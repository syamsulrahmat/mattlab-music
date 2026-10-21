"""
Auto-Healer Service for MattLab Music
Automatically discovers and fixes corrupted, truncated, or broken audio files in the library.
Preserves track IDs, playlist positions, favorites, and user stats.
"""

import os
import sys
import time
import shutil
import logging
import tempfile
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional

import yt_dlp
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, APIC

from app.database import get_db
from app.scanner import MUSIC_DIR, COVERS_DIR

logger = logging.getLogger("AutoHealer")

# Global healing state
_state_lock = threading.Lock()
_healing_state = {
    "is_running": False,
    "total": 0,
    "healed": 0,
    "failed": 0,
    "current_track": None,
    "last_run": None,
    "log": []
}


def get_healer_status() -> Dict[str, Any]:
    with _state_lock:
        return dict(_healing_state)


def mark_track_healed(track_id: int):
    """Marks a track as verified/healed so it's not repeatedly re-downloaded."""
    try:
        with get_db() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS library_healed_tracks (track_id INTEGER PRIMARY KEY, healed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            conn.execute("INSERT OR REPLACE INTO library_healed_tracks (track_id) VALUES (?)", (track_id,))
            conn.commit()
    except Exception as e:
        logger.warning(f"Could not mark track #{track_id} healed: {e}")


def unmark_track_healed(track_id: int):
    """Removes a track from healed cache when an error is reported by the player."""
    try:
        with get_db() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS library_healed_tracks (track_id INTEGER PRIMARY KEY, healed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            conn.execute("DELETE FROM library_healed_tracks WHERE track_id = ?", (track_id,))
            conn.commit()
    except Exception as e:
        logger.warning(f"Could not unmark track #{track_id}: {e}")


def is_preview_capped(duration_seconds: float) -> bool:
    """Detects 30s or 180s (3-min) hard preview caps from streaming rips."""
    if duration_seconds is None:
        return True
    # 3-minute Apple Music / Web preview cap
    if 179.8 <= duration_seconds <= 180.2:
        return True
    # 30-second snippet preview cap
    if 29.8 <= duration_seconds <= 30.2:
        return True
    return False


def find_broken_tracks() -> List[Dict[str, Any]]:
    """Scans SQLite database and file system to find damaged or preview-capped tracks."""
    broken = []
    with get_db() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS library_healed_tracks (track_id INTEGER PRIMARY KEY, healed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.id, t.title, ar.name as artist, al.title as album, 
                   t.file_path, t.duration_seconds, t.file_size
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            JOIN albums al ON t.album_id = al.id
            WHERE t.id NOT IN (SELECT track_id FROM library_healed_tracks)
        """)
        tracks = cursor.fetchall()

    for r in tracks:
        tid = r["id"]
        title = r["title"]
        artist = r["artist"]
        album = r["album"]
        fp = r["file_path"]
        dur = r["duration_seconds"] or 0
        fsize = r["file_size"] or 0

        # Check 1: File missing on disk
        if not os.path.exists(fp):
            broken.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "file_path": fp,
                "duration": dur,
                "reason": "missing_file"
            })
            continue

        # Check 2: 3-min or 30-sec preview cap (skip legitimate short skits/interludes)
        if is_preview_capped(dur):
            title_lower = title.lower()
            if "skit" in title_lower or "interlude" in title_lower or "intro" in title_lower or "outro" in title_lower:
                continue
            broken.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "file_path": fp,
                "duration": dur,
                "reason": "preview_capped_180s" if dur > 100 else "preview_capped_30s"
            })
            continue

        # Check 3: Suspiciously small (< 1MB for tracks > 60s)
        if dur > 60 and fsize < 1_000_000:
            broken.append({
                "id": tid,
                "title": title,
                "artist": artist,
                "album": album,
                "file_path": fp,
                "duration": dur,
                "reason": "truncated_file_size"
            })
            continue

    return broken


def heal_track(track_id: int) -> bool:
    """
    Heals a specific track:
    1. If a full-length sibling already exists in the library:
       Re-links playlist_tracks and favorites to the full sibling and deletes the truncated preview file.
    2. If no full copy exists:
       Downloads pristine 320k MP3 audio via yt-dlp, tags with ID3/APIC, and safely updates SQLite.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.id, t.title, ar.name as artist, al.title as album, 
                   t.file_path, t.duration_seconds
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            JOIN albums al ON t.album_id = al.id
            WHERE t.id = ?
        """, (track_id,))
        row = cursor.fetchone()

        if not row:
            logger.error(f"Track ID {track_id} not found in database")
            return False

        title = row["title"]
        artist = row["artist"]
        album = row["album"]
        old_file_path = Path(row["file_path"])
        old_dur = row["duration_seconds"]

        # Strategy 1: Check if a full-length, non-truncated sibling exists in the library!
        clean_first_artist = artist.split(",")[0].split("/")[0].strip().lower()
        cursor.execute("""
            SELECT t.id, t.file_path, t.duration_seconds, t.file_size
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            WHERE LOWER(t.title) = LOWER(?) AND t.id != ? 
              AND (
                  LOWER(ar.name) = LOWER(?)
                  OR LOWER(ar.name) LIKE '%' || ? || '%'
                  OR LOWER(?) LIKE '%' || LOWER(ar.name) || '%'
              )
              AND t.duration_seconds > 185
            ORDER BY t.duration_seconds DESC
        """, (title, track_id, artist, clean_first_artist, clean_first_artist))
        sibling = cursor.fetchone()

        if sibling and os.path.exists(sibling["file_path"]):
            sibling_id = sibling["id"]
            logger.info(f"Found full existing sibling for #{track_id} '{title}': #{sibling_id} ({sibling['duration_seconds']}s). Re-linking playlists & removing truncated copy.")

            cursor.execute("UPDATE playlist_tracks SET track_id = ? WHERE track_id = ?", (sibling_id, track_id))
            cursor.execute("UPDATE OR IGNORE favorites SET track_id = ? WHERE track_id = ?", (sibling_id, track_id))
            cursor.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
            conn.commit()

            if old_file_path.exists() and str(old_file_path) != str(sibling["file_path"]):
                try:
                    old_file_path.unlink()
                    logger.info(f"Removed old truncated file: {old_file_path.name}")
                except Exception as e:
                    logger.warning(f"Could not remove old file: {e}")

            mark_track_healed(sibling_id)
            return True

        # Strategy 2: Check if final MP3 path already exists in library under another ID
        output_dir = old_file_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        final_mp3_path = output_dir / f"{title}.mp3"

        cursor.execute("SELECT id, duration_seconds FROM tracks WHERE file_path = ? AND id != ?", (str(final_mp3_path), track_id))
        conflicting_row = cursor.fetchone()
        if conflicting_row:
            conflict_id = conflicting_row["id"]
            logger.info(f"Target path {final_mp3_path.name} already in DB as track #{conflict_id}. Re-linking playlists.")
            cursor.execute("UPDATE playlist_tracks SET track_id = ? WHERE track_id = ?", (conflict_id, track_id))
            cursor.execute("UPDATE OR IGNORE favorites SET track_id = ? WHERE track_id = ?", (conflict_id, track_id))
            cursor.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
            conn.commit()
            if old_file_path.exists() and old_file_path != final_mp3_path:
                try:
                    old_file_path.unlink()
                except Exception:
                    pass
            mark_track_healed(conflict_id)
            return True

    # Strategy 3: Download clean 320k release from scratch
    logger.info(f"Downloading clean 320k audio for #{track_id}: '{title}' by {artist} (current duration: {old_dur}s)")
    temp_dir = Path(tempfile.mkdtemp(prefix="heal_"))
    temp_tmpl = str(temp_dir / "%(title)s.%(ext)s")

    query = f"ytsearch1:{artist} {title} audio"
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
            ydl.download([query])

        mp3_files = list(temp_dir.glob("*.mp3"))
        if not mp3_files:
            logger.error(f"yt-dlp produced no mp3 for {artist} - {title}")
            return False

        downloaded_mp3 = mp3_files[0]
        shutil.move(str(downloaded_mp3), str(final_mp3_path))
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Apply clean ID3 tags
        try:
            audio = MP3(str(final_mp3_path), ID3=EasyID3)
            audio["title"] = title
            audio["artist"] = artist
            audio["album"] = album
            audio["albumartist"] = artist
            audio.save()
        except Exception as tag_err:
            logger.warning(f"ID3 EasyTag notice: {tag_err}")

        # Try to embed clean APIC cover art from local album folder if available
        try:
            cover_jpg = output_dir / "cover.jpg"
            if cover_jpg.exists():
                with open(cover_jpg, "rb") as cf:
                    img_data = cf.read()
                audio_id3 = MP3(str(final_mp3_path), ID3=ID3)
                audio_id3.tags.add(APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=img_data
                ))
                audio_id3.save()
        except Exception as cov_err:
            logger.warning(f"Cover embed notice: {cov_err}")

        # Read actual audio info
        new_audio = MP3(str(final_mp3_path))
        new_dur = round(new_audio.info.length, 2)
        new_bitrate = getattr(new_audio.info, "bitrate", 320000)
        new_size = final_mp3_path.stat().st_size

        # Delete old file if path changed (.m4a or .flac -> .mp3)
        if old_file_path != final_mp3_path and old_file_path.exists():
            try:
                old_file_path.unlink()
                logger.info(f"Removed old corrupt file: {old_file_path.name}")
            except Exception as e:
                logger.warning(f"Could not remove old file {old_file_path}: {e}")

        # Also purge any other corrupt siblings with same base name in output dir (.flac, .m4a)
        for ext in [".flac", ".m4a", ".wav", ".aac"]:
            sibling_corrupt = output_dir / f"{title}{ext}"
            if sibling_corrupt.exists() and sibling_corrupt != final_mp3_path:
                try:
                    sibling_corrupt.unlink()
                    logger.info(f"Purged sibling corrupt file: {sibling_corrupt.name}")
                except Exception:
                    pass

        # Purge stale cached transcodes for this track
        transcode_dir = Path("/data/transcodes")
        if transcode_dir.exists():
            for tc in transcode_dir.glob(f"{track_id}_*.mp3"):
                try:
                    tc.unlink()
                    logger.info(f"Purged stale transcode: {tc.name}")
                except Exception:
                    pass

        # Update existing track record in-place
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tracks
                SET file_path = ?, file_format = 'mp3', duration_seconds = ?, 
                    file_size = ?, bitrate = ?, mtime = ?
                WHERE id = ?
            """, (str(final_mp3_path), new_dur, new_size, new_bitrate, time.time(), track_id))
            conn.commit()

        mark_track_healed(track_id)
        logger.info(f"Successfully healed track #{track_id}: '{title}' -> duration {new_dur}s (was {old_dur}s)")
        return True

    except Exception as e:
        logger.error(f"Heal failed for track #{track_id} '{title}': {e}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return False


def _heal_worker():
    """Background worker thread that processes all broken tracks."""
    global _healing_state
    broken = find_broken_tracks()
    total = len(broken)

    with _state_lock:
        _healing_state["is_running"] = True
        _healing_state["total"] = total
        _healing_state["healed"] = 0
        _healing_state["failed"] = 0
        _healing_state["log"] = []

    logger.info(f"Starting Auto-Heal run: {total} broken tracks detected.")

    for item in broken:
        tid = item["id"]
        title = item["title"]
        artist = item["artist"]

        with _state_lock:
            _healing_state["current_track"] = f"{artist} - {title}"

        ok = heal_track(tid)

        with _state_lock:
            if ok:
                _healing_state["healed"] += 1
                _healing_state["log"].append(f"Healed: {artist} - {title}")
            else:
                _healing_state["failed"] += 1
                _healing_state["log"].append(f"Failed: {artist} - {title}")

        time.sleep(0.5)

    with _state_lock:
        _healing_state["is_running"] = False
        _healing_state["current_track"] = None
        _healing_state["last_run"] = time.time()

    logger.info(f"Auto-Heal completed: {_healing_state['healed']} healed, {_healing_state['failed']} failed.")

    summary = f"✨ *MattLab Music: Library Auto-Healing Finished*\n• Repaired {_healing_state['healed']}/{total} damaged tracks with pristine 320k releases."
    try:
        import subprocess
        if os.path.exists("/usr/local/bin/tg-notify"):
            subprocess.run(["/usr/local/bin/tg-notify", "--dev", summary], check=False)
    except Exception:
        pass


def start_auto_heal_background() -> bool:
    """Launches the background auto-heal worker if not already running."""
    with _state_lock:
        if _healing_state["is_running"]:
            return False
        _healing_state["is_running"] = True

    thread = threading.Thread(target=_heal_worker, daemon=True)
    thread.start()
    return True
