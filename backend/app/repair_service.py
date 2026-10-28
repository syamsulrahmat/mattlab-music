"""
Developer Mode Track & Cover Art Repair Service for MattLab Music.
Provides authoritative canonical metadata verification (via iTunes API),
multi-candidate duration-matched audio acquisition with FFmpeg stream validation,
and high-resolution 1400x1400 cover art cascade.
"""

import os
import sys
import time
import shutil
import logging
import urllib.parse
import urllib.request
import json
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import yt_dlp
import mutagen
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, APIC
from PIL import Image
import io
import re

from app.database import get_db
from app.scanner import MUSIC_DIR, COVERS_DIR, get_album_hash, save_cover_image

logger = logging.getLogger("DevRepairService")

# Global batch worker state
_repair_state_lock = threading.Lock()
_repair_state = {
    "is_running": False,
    "job_type": None,  # "audio" | "covers" | "all"
    "total": 0,
    "processed": 0,
    "succeeded": 0,
    "failed": 0,
    "current_item": None,
    "start_time": None,
    "end_time": None,
    "log": [],
}


def get_repair_status() -> Dict[str, Any]:
    with _repair_state_lock:
        return dict(_repair_state)


def _log_repair_event(message: str):
    logger.info(message)
    with _repair_state_lock:
        timestamp = time.strftime("%H:%M:%S")
        _repair_state["log"].insert(0, f"[{timestamp}] {message}")
        if len(_repair_state["log"]) > 100:
            _repair_state["log"].pop()


# ── Canonical Metadata Resolution ──────────────────────────────────────────

def resolve_canonical_metadata(artist: str, title: str, album: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Queries iTunes Search API to resolve exact canonical track duration,
    official title/artist names, and 1400x1400 cover art URL.
    """
    clean_artist = artist.split(",")[0].split("/")[0].split("&")[0].strip()
    clean_title = title.split("(")[0].split("-")[0].strip()
    term = urllib.parse.quote_plus(f"{clean_artist} {clean_title}")
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=5"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results", [])
            if not results:
                return None

            # Find best matching result
            best = None
            for item in results:
                it_artist = item.get("artistName", "").lower()
                it_title = item.get("trackName", "").lower()
                dur_ms = item.get("trackTimeMillis", 0)

                if dur_ms > 45000:  # Skip tiny ringtones/snippets
                    if clean_title.lower() in it_title or it_title in clean_title.lower():
                        best = item
                        break

            if not best and results:
                best = results[0]

            if not best:
                return None

            dur_s = round(best.get("trackTimeMillis", 0) / 1000.0, 2)
            raw_cover = best.get("artworkUrl100", "")
            highres_cover = raw_cover.replace("100x100bb", "1400x1400bb") if raw_cover else None

            return {
                "canonical_duration": dur_s,
                "canonical_title": best.get("trackName", title),
                "canonical_artist": best.get("artistName", artist),
                "canonical_album": best.get("collectionName", album or ""),
                "cover_url": highres_cover,
                "isrc": best.get("isrc"),
                "release_date": best.get("releaseDate"),
            }
    except Exception as e:
        logger.warning(f"iTunes metadata lookup failed for {artist} - {title}: {e}")
        return None


# ── YouTube Multi-Candidate Duration Matching ───────────────────────────────

CENSORED_REGEX_PATTERNS = [
    r'\bclean\b',
    r'\bradio\s+edit\b',
    r'\bcensored\b',
    r'\bedited\s+version\b',
    r'\bclean\s+version\b',
    r'\bkidz\s+bop\b',
]

def is_censored_video_title(title: str) -> bool:
    """Returns True if the video title indicates a clean, censored, or radio edit version."""
    for pattern in CENSORED_REGEX_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            return True
    return False

def search_and_verify_candidates(artist: str, title: str, canonical_dur: float) -> Optional[Dict[str, Any]]:
    """
    Searches YouTube for candidate releases and picks the best match whose
    duration is within ±6 seconds of the canonical duration.
    Prioritizes explicit studio releases, official Topic channels, and rejects clean/radio edits.
    """
    clean_artist = artist.split(",")[0].split("/")[0].strip()
    queries = [
        f"ytsearch8:{clean_artist} {title} explicit",
        f"ytsearch8:{clean_artist} - Topic {title}",
        f"ytsearch8:{clean_artist} {title} official audio",
        f"ytsearch8:{clean_artist} {title} audio",
    ]

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
    }

    banned_keywords = [
        "preview", "teaser", "snippet", "trailer", "sped up",
        "slowed", "nightcore", "8d audio", "cover by", "guitar cover",
        "drum cover", "reaction", "review", "chords"
    ]

    candidates = []

    for query in queries:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(query, download=False)
                entries = info.get("entries", []) if info else []

                for entry in entries:
                    if not entry:
                        continue
                    v_id = entry.get("id")
                    v_title = entry.get("title", "")
                    v_uploader = entry.get("uploader", "")
                    v_dur = entry.get("duration")

                    if not v_id or not v_dur:
                        continue

                    # Disqualify clean, censored, or radio edit versions
                    if is_censored_video_title(v_title):
                        continue

                    # Skip obvious non-music or banned content
                    v_title_lower = v_title.lower()
                    if any(k in v_title_lower for k in banned_keywords):
                        continue

                    # Skip short videos if canonical is long
                    if canonical_dur > 100 and v_dur < 60:
                        continue

                    # Calculate duration delta
                    delta = abs(v_dur - canonical_dur)
                    
                    # Tolerance: 6s or max 5% for long tracks
                    max_allowed_delta = max(6.0, canonical_dur * 0.05)
                    if delta > max_allowed_delta:
                        continue

                    # Scoring: heavily reward explicit studio album tracks
                    score = 100.0 - (delta * 3.0)
                    if "explicit" in v_title_lower or "dirty" in v_title_lower:
                        score += 45.0
                    if "- Topic" in v_uploader or "Topic" in v_uploader:
                        score += 35.0
                    if "official audio" in v_title_lower:
                        score += 25.0
                    if "official video" in v_title_lower:
                        # Music videos are frequently radio edited; give modest boost only
                        score += 5.0
                    if "lyrics" in v_title_lower:
                        score += 15.0

                    candidates.append({
                        "id": v_id,
                        "url": f"https://www.youtube.com/watch?v={v_id}",
                        "title": v_title,
                        "uploader": v_uploader,
                        "duration": v_dur,
                        "delta": delta,
                        "score": score,
                    })

            # If we found high-quality explicit or topic candidates, stop search early
            if any(c["score"] >= 140 for c in candidates):
                break

        except Exception as e:
            logger.warning(f"Error querying yt-dlp for '{query}': {e}")

    if not candidates:
        return None

    # Sort candidates by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[0]


# ── FFmpeg Integrity Verification & Extraction ─────────────────────────────

def download_and_verify_audio(candidate_url: str, canonical_dur: float, temp_dir: Path) -> Optional[Path]:
    """
    Downloads audio via yt-dlp, converts to 320k MP3, and runs an FFmpeg stream integrity
    check to guarantee zero corrupt audio frames.
    """
    temp_tmpl = str(temp_dir / "extracted.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": temp_tmpl,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }],
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([candidate_url])

        mp3_files = list(temp_dir.glob("*.mp3"))
        if not mp3_files:
            logger.error("yt-dlp completed but no MP3 was found in temp directory")
            return None

        downloaded_mp3 = mp3_files[0]

        # 1. Verify stream integrity with FFmpeg
        cmd = ["ffmpeg", "-v", "error", "-i", str(downloaded_mp3), "-f", "null", "-"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0 or "Error" in result.stderr:
            logger.warning(f"FFmpeg stream check reported errors: {result.stderr.strip()}")
            return None

        # 2. Verify actual audio length
        audio = MP3(str(downloaded_mp3))
        actual_dur = audio.info.length
        max_delta = max(8.0, canonical_dur * 0.06)
        if abs(actual_dur - canonical_dur) > max_delta:
            logger.warning(f"Downloaded audio length ({actual_dur:.1f}s) diverged from canonical ({canonical_dur:.1f}s)")
            return None

        return downloaded_mp3

    except Exception as e:
        logger.error(f"Download/verification failed for {candidate_url}: {e}")
        return None


# ── High-Resolution Cover Art Fetcher ──────────────────────────────────────

def fetch_highres_cover_image(artist: str, album: str, title: Optional[str] = None) -> Optional[bytes]:
    """
    Pulls pristine 1400x1400 JPEG album artwork from iTunes API.
    Validates image data using Pillow before returning.
    """
    clean_artist = artist.split(",")[0].split("/")[0].strip()
    clean_album = album.split("(")[0].strip() if album else ""
    
    queries = []
    if clean_album and clean_album.lower() not in ["single", "unknown", "untitled"]:
        queries.append(f"https://itunes.apple.com/search?term={urllib.parse.quote_plus(f'{clean_artist} {clean_album}')}&entity=album&limit=3")
    if title:
        clean_title = title.split("(")[0].strip()
        queries.append(f"https://itunes.apple.com/search?term={urllib.parse.quote_plus(f'{clean_artist} {clean_title}')}&entity=song&limit=3")

    for url in queries:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for item in data.get("results", []):
                    art100 = item.get("artworkUrl100", "")
                    if art100:
                        art1400 = art100.replace("100x100bb", "1400x1400bb")
                        art_req = urllib.request.Request(art1400, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(art_req, timeout=10) as img_resp:
                            img_bytes = img_resp.read()
                            # Validate bytes via PIL
                            with Image.open(io.BytesIO(img_bytes)) as pil_img:
                                pil_img.verify()
                            return img_bytes
        except Exception as e:
            logger.debug(f"Cover query error: {e}")

    return None


# ── Public Repair Actions ──────────────────────────────────────────────────

def repair_track_audio(track_id: int) -> Dict[str, Any]:
    """
    Full audio re-download & verification pipeline:
    1. Look up track metadata.
    2. Resolve canonical duration from iTunes.
    3. Multi-candidate YouTube search with strict duration matching.
    4. 320k MP3 extraction and FFmpeg integrity verification.
    5. Clean ID3 tagging + cover embedding.
    6. Atomic file replacement and cache purge.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.id, t.title, t.file_path, t.duration_seconds, t.file_format,
                   al.id as album_id, al.title as album, al.cover_path,
                   ar.id as artist_id, ar.name as artist
            FROM tracks t
            JOIN albums al ON t.album_id = al.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.id = ?
        """, (track_id,))
        row = cursor.fetchone()

    if not row:
        return {"success": False, "error": f"Track #{track_id} not found in database"}

    title = row["title"]
    artist = row["artist"]
    album = row["album"]
    album_id = row["album_id"]
    old_file_path = Path(row["file_path"])
    old_dur = row["duration_seconds"] or 0

    _log_repair_event(f"Starting audio repair for #{track_id}: '{title}' by {artist} (current: {old_dur}s)")

    # 1. Resolve canonical metadata
    canonical = resolve_canonical_metadata(artist, title, album)
    if canonical:
        canonical_dur = canonical["canonical_duration"]
        _log_repair_event(f"Canonical duration resolved: {canonical_dur}s via iTunes ('{canonical['canonical_title']}')")
    else:
        # Fallback to existing duration if reasonable, or default 210s
        canonical_dur = old_dur if old_dur > 60 else 210.0
        _log_repair_event(f"iTunes metadata not found; using baseline duration: {canonical_dur}s")

    # 2. Search & verify candidate
    candidate = search_and_verify_candidates(artist, title, canonical_dur)
    if not candidate:
        _log_repair_event(f"❌ No valid YouTube candidate matched duration {canonical_dur}s within tolerance")
        return {
            "success": False, 
            "error": f"No duration-matched candidate found within ±6s of {canonical_dur}s"
        }

    _log_repair_event(f"Selected candidate: '{candidate['title']}' ({candidate['duration']}s, delta {candidate['delta']:.1f}s) from '{candidate['uploader']}'")

    # 3. Download & verify audio
    temp_dir = Path(tempfile.mkdtemp(prefix="repair_audio_"))
    try:
        downloaded_mp3 = download_and_verify_audio(candidate["url"], canonical_dur, temp_dir)
        if not downloaded_mp3:
            _log_repair_event("❌ Audio download or FFmpeg stream integrity check failed")
            return {"success": False, "error": "Downloaded stream failed FFmpeg integrity check"}

        # Target final file path
        output_dir = old_file_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        final_mp3_path = output_dir / f"{title}.mp3"

        # Move file into place
        shutil.move(str(downloaded_mp3), str(final_mp3_path))

        # 4. Tagging
        try:
            audio = MP3(str(final_mp3_path), ID3=EasyID3)
            audio["title"] = title
            audio["artist"] = artist
            audio["album"] = album
            audio["albumartist"] = artist
            audio.save()
        except Exception as tag_err:
            logger.warning(f"EasyID3 notice: {tag_err}")

        # 5. Embed cover art if available
        cover_jpg = output_dir / "cover.jpg"
        cover_bytes = None
        if cover_jpg.exists():
            try:
                with open(cover_jpg, "rb") as cf:
                    cover_bytes = cf.read()
            except Exception:
                pass
        elif canonical and canonical.get("cover_url"):
            try:
                cover_bytes = fetch_highres_cover_image(artist, album, title)
                if cover_bytes:
                    with open(cover_jpg, "wb") as cf:
                        cf.write(cover_bytes)
            except Exception:
                pass

        if cover_bytes:
            try:
                audio_id3 = MP3(str(final_mp3_path), ID3=ID3)
                audio_id3.tags.add(APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=cover_bytes
                ))
                audio_id3.save()
            except Exception as apic_err:
                logger.warning(f"Cover embed notice: {apic_err}")

        # 6. Read actual stats
        new_audio = MP3(str(final_mp3_path))
        new_dur = round(new_audio.info.length, 2)
        new_bitrate = getattr(new_audio.info, "bitrate", 320000)
        new_size = final_mp3_path.stat().st_size

        # Delete old file if name or extension differed
        if old_file_path != final_mp3_path and old_file_path.exists():
            try:
                old_file_path.unlink()
            except Exception:
                pass

        # Purge stale sibling formats (.flac, .m4a, .wav)
        for ext in [".flac", ".m4a", ".wav", ".aac"]:
            sib = output_dir / f"{title}{ext}"
            if sib.exists() and sib != final_mp3_path:
                try:
                    sib.unlink()
                except Exception:
                    pass

        # Purge transcode cache
        transcode_dir = Path("/data/transcodes")
        if transcode_dir.exists():
            for tc in transcode_dir.glob(f"{track_id}_*.mp3"):
                try:
                    tc.unlink()
                except Exception:
                    pass

        # Update database
        now_time = time.time()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tracks
                SET file_path = ?, file_format = 'mp3', duration_seconds = ?,
                    file_size = ?, bitrate = ?, mtime = ?
                WHERE id = ?
            """, (str(final_mp3_path), new_dur, new_size, new_bitrate, now_time, track_id))
            conn.commit()

        _log_repair_event(f"✨ Successfully repaired track #{track_id}: '{title}' -> {new_dur}s (was {old_dur}s)")
        return {
            "success": True,
            "track_id": track_id,
            "title": title,
            "artist": artist,
            "old_duration": old_dur,
            "new_duration": new_dur,
            "bitrate": new_bitrate,
            "file_size": new_size,
        }

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def repair_track_cover(track_id: int) -> Dict[str, Any]:
    """
    Pulls high-res 1400x1400 artwork from iTunes, writes cover.jpg,
    saves to /data/covers/, embeds in the track file, and updates SQLite.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.id, t.title, t.file_path,
                   al.id as album_id, al.title as album, al.cover_path,
                   ar.name as artist
            FROM tracks t
            JOIN albums al ON t.album_id = al.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.id = ?
        """, (track_id,))
        row = cursor.fetchone()

    if not row:
        return {"success": False, "error": f"Track #{track_id} not found"}

    title = row["title"]
    artist = row["artist"]
    album = row["album"]
    album_id = row["album_id"]
    track_path = Path(row["file_path"])

    _log_repair_event(f"Fetching 1400x1400 cover art for '{album}' by {artist} (Track #{track_id})")

    img_bytes = fetch_highres_cover_image(artist, album, title)
    if not img_bytes:
        _log_repair_event(f"❌ Could not find high-res artwork for {artist} - {album}")
        return {"success": False, "error": "No high-res artwork found on iTunes Store API"}

    album_dir = track_path.parent
    album_dir.mkdir(parents=True, exist_ok=True)
    cover_jpg = album_dir / "cover.jpg"

    # 1. Save cover.jpg directly into album directory
    try:
        with open(cover_jpg, "wb") as cf:
            cf.write(img_bytes)
    except Exception as e:
        logger.warning(f"Could not write album cover.jpg: {e}")

    # 2. Save into /data/covers cache
    album_hash = get_album_hash(artist, album)
    cached_cover_path = save_cover_image(img_bytes, album_hash)

    # 3. Embed into track audio file if MP3
    if track_path.exists() and track_path.suffix.lower() == ".mp3":
        try:
            audio_id3 = MP3(str(track_path), ID3=ID3)
            audio_id3.tags.add(APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,
                desc="Cover",
                data=img_bytes
            ))
            audio_id3.save()
        except Exception as apic_err:
            logger.warning(f"Cover embed in MP3 notice: {apic_err}")

    # 4. Update database
    cover_path_to_save = cached_cover_path or str(cover_jpg)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE albums SET cover_path = ? WHERE id = ?", (cover_path_to_save, album_id))
        conn.commit()

    _log_repair_event(f"✨ Successfully applied 1400px cover art to album #{album_id} '{album}'")
    return {
        "success": True,
        "album_id": album_id,
        "album": album,
        "artist": artist,
        "cover_path": cover_path_to_save,
        "cover_url": f"/api/covers/{album_id}?v={int(time.time())}",
    }


def repair_album_cover(album_id: int) -> Dict[str, Any]:
    """Pulls high-res 1400x1400 artwork and applies it to an entire album and all its tracks."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT al.id, al.title as album, ar.name as artist
            FROM albums al
            JOIN artists ar ON al.artist_id = ar.id
            WHERE al.id = ?
        """, (album_id,))
        row = cursor.fetchone()

    if not row:
        return {"success": False, "error": f"Album #{album_id} not found"}

    artist = row["artist"]
    album = row["album"]

    img_bytes = fetch_highres_cover_image(artist, album)
    if not img_bytes:
        return {"success": False, "error": "No high-res artwork found on iTunes Store API"}

    # Save to /data/covers cache
    album_hash = get_album_hash(artist, album)
    cached_cover_path = save_cover_image(img_bytes, album_hash)

    # Update database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE albums SET cover_path = ? WHERE id = ?", (cached_cover_path, album_id))
        cursor.execute("SELECT id, file_path FROM tracks WHERE album_id = ?", (album_id,))
        tracks = cursor.fetchall()
        conn.commit()

    # Save cover.jpg in album folders and embed in MP3s
    for t in tracks:
        tp = Path(t["file_path"])
        if tp.exists():
            cover_jpg = tp.parent / "cover.jpg"
            if not cover_jpg.exists():
                try:
                    with open(cover_jpg, "wb") as cf:
                        cf.write(img_bytes)
                except Exception:
                    pass
            if tp.suffix.lower() == ".mp3":
                try:
                    audio_id3 = MP3(str(tp), ID3=ID3)
                    audio_id3.tags.add(APIC(
                        encoding=3,
                        mime="image/jpeg",
                        type=3,
                        desc="Cover",
                        data=img_bytes
                    ))
                    audio_id3.save()
                except Exception:
                    pass

    _log_repair_event(f"✨ Applied 1400px cover art to album #{album_id} '{album}' and {len(tracks)} tracks")
    return {
        "success": True,
        "album_id": album_id,
        "album": album,
        "artist": artist,
        "cover_path": cached_cover_path,
        "cover_url": f"/api/covers/{album_id}?v={int(time.time())}",
    }


# ── Audit & Library Diagnostics ────────────────────────────────────────────

def audit_library_issues() -> Dict[str, Any]:
    """
    Performs a thorough audit of the library to identify:
    - Audio issues: missing files, 180s/30s preview caps, truncated sizes (< 1MB)
    - Cover art issues: albums with NULL cover_path or nonexistent cover file
    """
    broken_audio = []
    missing_covers = []

    with get_db() as conn:
        cursor = conn.cursor()
        # 1. Audit tracks
        cursor.execute("""
            SELECT t.id, t.title, ar.name as artist, al.id as album_id, al.title as album,
                   t.file_path, t.duration_seconds, t.file_size, t.file_format, al.cover_path
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            JOIN albums al ON t.album_id = al.id
            ORDER BY t.id DESC
        """)
        tracks = cursor.fetchall()

        # 2. Audit albums with missing covers
        cursor.execute("""
            SELECT al.id, al.title, ar.name as artist, al.cover_path, COUNT(t.id) as track_count
            FROM albums al
            JOIN artists ar ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = al.id
            GROUP BY al.id
            HAVING al.cover_path IS NULL OR al.cover_path = ''
            ORDER BY track_count DESC
        """)
        empty_cover_albums = cursor.fetchall()

    for r in tracks:
        tid = r["id"]
        title = r["title"]
        artist = r["artist"]
        album = r["album"]
        fp = r["file_path"]
        dur = r["duration_seconds"] or 0
        fsize = r["file_size"] or 0

        # Check 1: File missing
        if not os.path.exists(fp):
            broken_audio.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "file_size": fsize,
                "reason": "Missing file on disk",
                "badge": "Missing File",
            })
            continue

        # Check 2: Preview caps (180s or 30s)
        if 179.8 <= dur <= 180.2:
            broken_audio.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "file_size": fsize,
                "reason": "3-minute preview cap (180s)",
                "badge": "Preview Cap (180s)",
            })
            continue

        if 29.8 <= dur <= 30.2:
            t_lower = title.lower()
            if "skit" in t_lower or "interlude" in t_lower or "intro" in t_lower or "outro" in t_lower:
                continue
            broken_audio.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "file_size": fsize,
                "reason": "30-second snippet preview cap",
                "badge": "Snippet (30s)",
            })
            continue

        # Check 3: Truncated file size (< 1MB for songs > 60s)
        if dur > 60 and fsize < 1_000_000:
            broken_audio.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "file_size": fsize,
                "reason": "Truncated file size (< 1MB)",
                "badge": "Truncated Size",
            })
            continue

    for a in empty_cover_albums:
        missing_covers.append({
            "id": a["id"],
            "title": a["title"],
            "artist": a["artist"],
            "track_count": a["track_count"],
        })

    return {
        "broken_audio_count": len(broken_audio),
        "missing_covers_count": len(missing_covers),
        "broken_audio": broken_audio,
        "missing_covers": missing_covers,
    }


# ── Batch Worker Thread ───────────────────────────────────────────────────

def _batch_worker(job_type: str):
    global _repair_state
    audit = audit_library_issues()

    if job_type == "audio":
        items = audit["broken_audio"]
    elif job_type == "covers":
        items = audit["missing_covers"]
    else:  # "all"
        items = audit["broken_audio"] + audit["missing_covers"]

    total = len(items)
    with _repair_state_lock:
        _repair_state["is_running"] = True
        _repair_state["job_type"] = job_type
        _repair_state["total"] = total
        _repair_state["processed"] = 0
        _repair_state["succeeded"] = 0
        _repair_state["failed"] = 0
        _repair_state["start_time"] = time.time()
        _repair_state["end_time"] = None

    _log_repair_event(f"🚀 Started Batch Repair Job '{job_type}': {total} items to process")

    if job_type in ["audio", "all"]:
        for item in audit["broken_audio"]:
            tid = item["id"]
            name = f"{item['artist']} - {item['title']}"
            with _repair_state_lock:
                _repair_state["current_item"] = f"Audio: {name}"

            res = repair_track_audio(tid)
            with _repair_state_lock:
                _repair_state["processed"] += 1
                if res.get("success"):
                    _repair_state["succeeded"] += 1
                else:
                    _repair_state["failed"] += 1
            time.sleep(0.5)

    if job_type in ["covers", "all"]:
        for item in audit["missing_covers"]:
            aid = item["id"]
            name = f"{item['artist']} - {item['title']}"
            with _repair_state_lock:
                _repair_state["current_item"] = f"Cover: {name}"

            res = repair_album_cover(aid)
            with _repair_state_lock:
                _repair_state["processed"] += 1
                if res.get("success"):
                    _repair_state["succeeded"] += 1
                else:
                    _repair_state["failed"] += 1
            time.sleep(0.5)

    with _repair_state_lock:
        _repair_state["is_running"] = False
        _repair_state["current_item"] = None
        _repair_state["end_time"] = time.time()

    summary = f"✨ Batch repair '{job_type}' finished: {_repair_state['succeeded']}/{total} succeeded, {_repair_state['failed']} failed."
    _log_repair_event(summary)

    try:
        if os.path.exists("/usr/local/bin/tg-notify"):
            subprocess.run(["/usr/local/bin/tg-notify", "--dev", f"🛠️ **MattLab Music Repair Job Finished**\n{summary}"], check=False)
    except Exception:
        pass


def start_batch_repair_background(job_type: str = "audio") -> bool:
    with _repair_state_lock:
        if _repair_state["is_running"]:
            return False
        _repair_state["is_running"] = True

    thread = threading.Thread(target=_batch_worker, args=(job_type,), daemon=True)
    thread.start()
    return True
