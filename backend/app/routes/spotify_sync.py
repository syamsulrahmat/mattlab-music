import os
import re
import json
import time
import shutil
import urllib.request
import urllib.parse
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks, status
from pydantic import BaseModel, Field

from app.config import MUSIC_DIR, COVERS_DIR
from app.database import get_db
from app.scanner import index_single_audio_file
from app.auth import get_current_user

router = APIRouter(prefix="/spotify", tags=["Spotify Playlist Live Sync & Downloader"])

LIDARR_URL = os.getenv("LIDARR_URL", "http://192.168.100.200:8686")
LIDARR_API_KEY = os.getenv("LIDARR_API_KEY", "57ef9453feb44064afba47f5af85eaec")

# In-memory download status tracker
# key: sync_track_id -> { progress: float, speed: int, state: str, name: str }
active_spotify_downloads: Dict[int, Dict[str, Any]] = {}
sync_lock = threading.Lock()
active_playlist_workers: set = set()
worker_lock = threading.Lock()

class SpotifyImportRequest(BaseModel):
    url: str
    auto_sync: Optional[bool] = True
    auto_download: Optional[bool] = True

def sanitize_name(name: str) -> str:
    """Sanitize directory and file names for filesystem storage."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return clean or "Unknown"

def clean_search_term(text: str) -> str:
    """Strip noisy episode text, brackets, and symbols that cause yt-dlp 0-result searches."""
    # Strip text inside parentheses/brackets: (From "Naruto"), [Vocal], （第1話）, 【...】, etc.
    t = re.sub(r'[\（\(\[\{【].*?[\）\)\]\}】]', ' ', text)
    # Strip special punctuation and symbols
    t = re.sub(r'[★☆!！?？"\'“”‘’\<\>|/\\\\:\*\+~～`]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def build_search_queries(artist: str, title: str, playlist_name: str = "") -> List[str]:
    """Generate resilient, ranked search queries for yt-dlp."""
    clean_art = clean_search_term(artist)
    clean_tit = clean_search_term(title)
    clean_pl = clean_search_term(playlist_name)

    candidates = []
    # 1. Clean Artist + Clean Title (primary)
    if clean_art and clean_tit:
        candidates.append(f"{clean_art} {clean_tit}")
    # 2. Clean Title + Playlist keyword (e.g. Naruto)
    if clean_pl and clean_tit:
        pl_keyword = re.sub(r'(all songs|playlist|soundtrack|ost|greatest hits|vol\.?\s*\d+)', '', clean_pl, flags=re.I).strip()
        if pl_keyword and pl_keyword.lower() != clean_tit.lower():
            candidates.append(f"{clean_tit} {pl_keyword}")
        candidates.append(f"{clean_tit} {clean_pl}")
    # 3. Clean Title alone (matches official music videos for Japanese / foreign tracks)
    if clean_tit and len(clean_tit) >= 3:
        candidates.append(clean_tit)
    # 4. Raw Title + Raw Artist (fallback)
    raw_query = f"{artist.strip()} {title.strip()}"
    if raw_query not in candidates:
        candidates.append(raw_query)

    # Deduplicate while preserving order
    seen = set()
    result = []
    for c in candidates:
        c_norm = c.lower().strip()
        if c_norm and c_norm not in seen:
            seen.add(c_norm)
            result.append(f"ytsearch1:{c}")
    return result

def fetch_track_metadata(title: str, artist: str) -> Dict[str, Any]:
    """Fetch track-specific real album name and cover art from Deezer or iTunes APIs."""
    clean_art = clean_search_term(artist)
    clean_tit = clean_search_term(title)
    primary_art = clean_art.split(',')[0].strip()
    query = f"{primary_art} {clean_tit}".strip()
    if not query:
        return {"album": None, "cover_bytes": None}

    # 1. Deezer API (fast, high quality 500x500)
    try:
        url = f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=1"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as res:
            d = json.loads(res.read().decode())
            if d.get("data"):
                item = d["data"][0]
                album_title = item.get("album", {}).get("title")
                img_url = item.get("album", {}).get("cover_big") or item.get("album", {}).get("cover_medium")
                cover_bytes = None
                if img_url:
                    img_req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(img_req, timeout=5) as img_res:
                        cover_bytes = img_res.read()
                return {"album": album_title, "cover_bytes": cover_bytes}
    except Exception:
        pass

    # 2. iTunes Search API (fast, 600x600)
    try:
        url = f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': query, 'entity': 'song', 'limit': 1})}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as res:
            d = json.loads(res.read().decode())
            if d.get("results"):
                item = d["results"][0]
                album_title = item.get("collectionName")
                img_url = item.get("artworkUrl100", "").replace("100x100bb", "600x600bb")
                cover_bytes = None
                if img_url:
                    img_req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(img_req, timeout=5) as img_res:
                        cover_bytes = img_res.read()
                return {"album": album_title, "cover_bytes": cover_bytes}
    except Exception:
        pass

    return {"album": None, "cover_bytes": None}

def fetch_track_cover_art(title: str, artist: str) -> Optional[bytes]:
    """Compatibility wrapper returning just cover bytes."""
    meta = fetch_track_metadata(title, artist)
    return meta.get("cover_bytes")

def ensure_playlist_cover(dest_dir: Path, playlist_name: str, cover_url: Optional[str]) -> Optional[Path]:
    """Download and cache playlist banner cover artwork as folder.jpg and cover.jpg.
    NOTE: Playlist covers are strictly for the playlist header/card, NEVER applied to diverse track albums.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    folder_cover = dest_dir / "folder.jpg"
    cover_cover = dest_dir / "cover.jpg"

    if folder_cover.exists() and folder_cover.stat().st_size > 0:
        return folder_cover

    if cover_url:
        try:
            req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as res:
                img_data = res.read()
                if img_data:
                    folder_cover.write_bytes(img_data)
                    cover_cover.write_bytes(img_data)
        except Exception as e:
            print(f"[SPOTIFY SYNC] Warning: Failed to download playlist cover from {cover_url}: {e}", flush=True)

    return folder_cover if folder_cover.exists() else None


def extract_spotify_playlist_id(url_or_id: str) -> str:
    """Extract clean 22-character Spotify playlist ID from URL or URI."""
    raw = url_or_id.strip()
    match = re.search(r"playlist/([a-zA-Z0-9]+)", raw)
    if match:
        return match.group(1)
    match = re.search(r"spotify:playlist:([a-zA-Z0-9]+)", raw)
    if match:
        return match.group(1)
    if re.match(r"^[a-zA-Z0-9]{22}$", raw):
        return raw
    raise ValueError("Invalid Spotify playlist URL. Please provide an open.spotify.com/playlist/... link.")

def fetch_spotify_playlist_data(playlist_id: str) -> Dict[str, Any]:
    """Scrape playlist metadata and track list from Spotify embed."""
    embed_url = f"https://open.spotify.com/embed/playlist/{playlist_id}"
    req = urllib.request.Request(
        embed_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=12) as res:
        html = res.read().decode("utf-8", errors="ignore")

    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
    if not match:
        raise ValueError("Could not parse Spotify playlist data. Make sure the playlist is public.")

    try:
        data = json.loads(match.group(1))
        entity = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
        if not entity:
            raise ValueError("Spotify playlist not found or private.")

        title = entity.get("name", "Spotify Playlist")
        description = entity.get("description", "")
        raw_tracks = entity.get("trackList", [])

        # Best cover image
        cover_url = None
        if entity.get("coverArt", {}).get("sources"):
            cover_url = entity["coverArt"]["sources"][0].get("url")
        if not cover_url:
            images = entity.get("visualIdentity", {}).get("image", [])
            if images and isinstance(images, list):
                sorted_images = sorted(images, key=lambda x: x.get("maxWidth", 0), reverse=True)
                cover_url = sorted_images[0].get("url")

        tracks = []
        for idx, t in enumerate(raw_tracks):
            t_title = (t.get("title") or "").strip()
            t_artist = (t.get("subtitle") or "").strip()
            if not t_title:
                continue

            uri = t.get("uri") or ""
            spotify_track_id = uri.replace("spotify:track:", "") or f"track_{idx}"
            duration_ms = t.get("duration") or 0

            tracks.append({
                "spotify_track_id": spotify_track_id,
                "title": t_title,
                "artist": t_artist,
                "album": title,
                "duration_ms": duration_ms,
                "position": idx,
            })

        return {
            "spotify_id": playlist_id,
            "title": title,
            "description": description,
            "cover_url": cover_url,
            "tracks": tracks,
        }
    except Exception as e:
        raise ValueError(f"Failed to extract Spotify playlist: {str(e)}")

def find_track_in_local_db(cursor, title: str, artist: str) -> Optional[int]:
    """Find matching track_id in local library database."""
    # 1. Exact match
    cursor.execute("""
        SELECT t.id FROM tracks t
        JOIN artists a ON t.artist_id = a.id
        WHERE LOWER(t.title) = LOWER(?) AND LOWER(a.name) = LOWER(?)
        LIMIT 1
    """, (title.strip(), artist.strip()))
    row = cursor.fetchone()
    if row:
        return row["id"]

    # 2. Relaxed match (remove feat, remaster, extra brackets)
    clean_title = re.sub(r"[\(\[].*?[\)\]]", "", title).strip()
    clean_artist = re.sub(r"[\(\[].*?[\)\]]", "", artist).split(",")[0].strip()

    if clean_title:
        cursor.execute("""
            SELECT t.id FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            WHERE LOWER(t.title) LIKE LOWER(?) AND LOWER(a.name) LIKE LOWER(?)
            LIMIT 1
        """, (f"%{clean_title}%", f"%{clean_artist}%"))
        row = cursor.fetchone()
        if row:
            return row["id"]

    return None

def trigger_lidarr_flac_monitoring(artist_name: str, album_title: str):
    """Notify Lidarr in background to monitor album for Lossless FLAC quality upgrades."""
    try:
        query = urllib.parse.urlencode({"term": f"{artist_name} {album_title}", "apiKey": LIDARR_API_KEY})
        url = f"{LIDARR_URL}/api/v1/album/lookup?{query}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as res:
            results = json.loads(res.read().decode())
            if results:
                album_obj = results[0]
                # If artist already monitored, monitor album
                lidarr_album_id = album_obj.get("id")
                if lidarr_album_id:
                    put_url = f"{LIDARR_URL}/api/v1/album/{lidarr_album_id}?apiKey={LIDARR_API_KEY}"
                    album_obj["monitored"] = True
                    put_data = json.dumps(album_obj).encode("utf-8")
                    put_req = urllib.request.Request(put_url, data=put_data, headers={"Content-Type": "application/json"}, method="PUT")
                    urllib.request.urlopen(put_req, timeout=10)
    except Exception as e:
        # Lidarr upgrade is purely opportunistic, non-blocking
        pass

def download_single_spotify_track(sync_track_id: int):
    """Worker function that downloads a single missing Spotify track via yt-dlp with cascading fallbacks & artwork embedding."""
    import yt_dlp
    from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, ID3NoHeaderError

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT st.id, st.playlist_id, st.title, st.artist, st.album, st.position, p.name as playlist_name
            FROM spotify_sync_tracks st
            JOIN playlists p ON st.playlist_id = p.id
            WHERE st.id = ?
        """, (sync_track_id,))
        row = cursor.fetchone()

    if not row:
        return

    track_id_sync = row["id"]
    playlist_id = row["playlist_id"]
    title = row["title"]
    artist = row["artist"]
    playlist_name = row["playlist_name"]
    position = row["position"]

    # Mark as downloading
    with sync_lock:
        active_spotify_downloads[track_id_sync] = {
            "progress": 5.0,
            "state": "downloading",
            "name": f"{artist} - {title}",
            "speed": 0,
        }

    print(f"[SPOTIFY DL] 🚀 Starting download: '{artist} - {title}' (Sync ID {track_id_sync})", flush=True)
    with get_db() as conn:
        conn.cursor().execute("UPDATE spotify_sync_tracks SET status = 'downloading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (track_id_sync,))

    # Output directory
    safe_playlist = sanitize_name(playlist_name)
    safe_artist = sanitize_name(artist)
    safe_title = sanitize_name(title)
    dest_dir = MUSIC_DIR / "Spotify Downloads" / safe_playlist
    dest_dir.mkdir(parents=True, exist_ok=True)
    final_mp3 = dest_dir / f"{safe_artist} - {safe_title}.mp3"

    temp_dir = Path("/tmp") / f"spotify_dl_{track_id_sync}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file_tmpl = str(temp_dir / "%(title)s.%(ext)s")

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            pct = round((downloaded / total * 100), 1) if total > 0 else 0
            with sync_lock:
                if track_id_sync in active_spotify_downloads:
                    active_spotify_downloads[track_id_sync]["progress"] = min(pct, 90.0)
                    active_spotify_downloads[track_id_sync]["speed"] = d.get("speed", 0) or 0
        elif d.get("status") == "finished":
            with sync_lock:
                if track_id_sync in active_spotify_downloads:
                    active_spotify_downloads[track_id_sync]["progress"] = 92.0
                    active_spotify_downloads[track_id_sync]["state"] = "tagging"

    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": temp_file_tmpl,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "web"]
                }
            },
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }],
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [progress_hook],
        }

        # Try search queries with cascading fallbacks
        queries = build_search_queries(artist, title, playlist_name)
        download_success = False
        last_error = None

        for query in queries:
            print(f"[SPOTIFY DL] Trying search query: '{query}' for '{artist} - {title}'", flush=True)
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([query])
                mp3_files = list(temp_dir.glob("*.mp3"))
                if mp3_files and mp3_files[0].stat().st_size > 10000:
                    download_success = True
                    break
            except Exception as e:
                last_error = e

        if not download_success:
            raise RuntimeError(f"Audio extraction failed across all fallback queries (last error: {last_error})")

        downloaded_file = mp3_files[0]

        # Acquire track metadata (real album name & real album cover art)
        meta = fetch_track_metadata(title, artist)
        real_album = meta.get("album") or playlist_name
        cover_bytes = meta.get("cover_bytes")

        # Apply robust ID3 tags with APIC artwork frame
        try:
            try:
                id3 = ID3(downloaded_file)
            except ID3NoHeaderError:
                id3 = ID3()
            id3.delall("TIT2")
            id3.add(TIT2(encoding=3, text=title))
            id3.delall("TPE1")
            id3.add(TPE1(encoding=3, text=artist))
            id3.delall("TALB")
            id3.add(TALB(encoding=3, text=real_album))
            if cover_bytes:
                id3.delall("APIC")
                id3.add(APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3, # front cover
                    desc="Cover",
                    data=cover_bytes
                ))
            id3.save(downloaded_file, v2_version=3)
        except Exception as tag_err:
            print(f"[SPOTIFY DL] Warning: ID3 tagging error: {tag_err}", flush=True)

        # Move to final location
        shutil.move(str(downloaded_file), str(final_mp3))
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Cache cover thumbnail in COVERS_DIR using real album
        from app.scanner import save_cover_image, get_album_hash
        album_hash = get_album_hash(artist, real_album)
        saved_cover_path = None
        if cover_bytes:
            saved_cover_path = save_cover_image(cover_bytes, album_hash)

        # Index track immediately into SQLite
        new_track_id = index_single_audio_file(final_mp3)

        if not new_track_id:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM tracks WHERE file_path = ?", (str(final_mp3),))
                found = cursor.fetchone()
                if found:
                    new_track_id = found["id"]

        with get_db() as conn:
            cursor = conn.cursor()
            if new_track_id:
                # Update spotify_sync_tracks
                cursor.execute("""
                    UPDATE spotify_sync_tracks
                    SET status = 'matched', track_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (new_track_id, track_id_sync))

                # Insert into playlist_tracks so it's in the active playlist
                cursor.execute("""
                    INSERT INTO playlist_tracks (playlist_id, track_id, position)
                    VALUES (?, ?, ?)
                    ON CONFLICT(playlist_id, track_id) DO UPDATE SET position = excluded.position
                """, (playlist_id, new_track_id, position))

                # Ensure album cover_path is populated
                if saved_cover_path:
                    cursor.execute("""
                        UPDATE albums
                        SET cover_path = ?
                        WHERE id = (SELECT album_id FROM tracks WHERE id = ?) AND cover_path IS NULL
                    """, (saved_cover_path, new_track_id))

        with sync_lock:
            if track_id_sync in active_spotify_downloads:
                active_spotify_downloads[track_id_sync]["progress"] = 100.0
                active_spotify_downloads[track_id_sync]["state"] = "completed"

        print(f"[SPOTIFY DL] ✅ Finished: '{artist} - {title}' -> Track #{new_track_id} in {final_mp3.name}", flush=True)

        # Opportunistic background upgrade in Lidarr
        threading.Thread(target=trigger_lidarr_flac_monitoring, args=(artist, title), daemon=True).start()

    except Exception as err:
        print(f"[SPOTIFY DL] ❌ Error downloading '{artist} - {title}': {err}", flush=True)
        with get_db() as conn:
            conn.cursor().execute("""
                UPDATE spotify_sync_tracks
                SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (str(err), track_id_sync))

        with sync_lock:
            if track_id_sync in active_spotify_downloads:
                active_spotify_downloads[track_id_sync]["state"] = "failed"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        with sync_lock:
            active_spotify_downloads.pop(track_id_sync, None)

def process_playlist_download_queue(playlist_id: int):
    """Process pending downloads for a playlist sequentially in a background thread."""
    with worker_lock:
        if playlist_id in active_playlist_workers:
            return
        active_playlist_workers.add(playlist_id)

    def worker_loop():
        try:
            print(f"[SPOTIFY QUEUE] Worker started for playlist #{playlist_id}", flush=True)
            while True:
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT id, title, artist FROM spotify_sync_tracks
                        WHERE playlist_id = ? AND status = 'pending'
                        ORDER BY position ASC
                        LIMIT 1
                    """, (playlist_id,))
                    next_track = cursor.fetchone()

                if not next_track:
                    print(f"[SPOTIFY QUEUE] All downloads complete for playlist #{playlist_id}", flush=True)
                    break

                download_single_spotify_track(next_track["id"])
                time.sleep(0.3)
        except Exception as ex:
            print(f"[SPOTIFY QUEUE] Worker error for playlist #{playlist_id}: {ex}", flush=True)
        finally:
            with worker_lock:
                active_playlist_workers.discard(playlist_id)

    threading.Thread(target=worker_loop, daemon=True).start()

def sync_single_spotify_playlist(playlist_id: int, playlist_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Synchronize a Spotify-linked playlist with live Spotify chart/playlist data:
    1. Fetches metadata and track list from Spotify (if not pre-fetched).
    2. Drops tracks that fell off the playlist/chart from spotify_sync_tracks.
    3. Upserts active tracks into spotify_sync_tracks with strictly updated positions (0..N-1).
    4. Automatically retries any previously failed tracks by resetting status to 'pending'.
    5. Reconciles playlist_tracks so it strictly mirrors matched tracks in spotify_sync_tracks.
    6. Triggers background download queue if any pending tracks exist.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, spotify_id, name FROM playlists WHERE id = ?", (playlist_id,))
        pl = cursor.fetchone()
        if not pl or not pl["spotify_id"]:
            raise ValueError(f"Playlist #{playlist_id} is not linked to Spotify.")

    spotify_id = pl["spotify_id"]
    if not playlist_data:
        playlist_data = fetch_spotify_playlist_data(spotify_id)

    tracks = playlist_data.get("tracks", [])
    if not tracks:
        raise ValueError(f"No tracks found in Spotify playlist data for #{playlist_id}.")

    # Cache playlist cover art as folder.jpg/cover.jpg and backfill albums in SQLite
    safe_playlist = sanitize_name(pl["name"])
    dest_dir = MUSIC_DIR / "Spotify Downloads" / safe_playlist
    ensure_playlist_cover(dest_dir, pl["name"], playlist_data.get("cover_url"))

    current_spotify_ids = [t["spotify_track_id"] for t in tracks]
    current_spotify_set = set(current_spotify_ids)

    new_tracks_count = 0
    removed_ids = []

    with get_db() as conn:
        cursor = conn.cursor()

        # Update playlist title and description if available
        pl_title = playlist_data.get("title")
        pl_desc = playlist_data.get("description")
        cursor.execute("""
            UPDATE playlists
            SET name = COALESCE(NULLIF(?, ''), name),
                description = COALESCE(NULLIF(?, ''), description),
                last_synced_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (pl_title, pl_desc, playlist_id))

        # Fetch existing tracks in spotify_sync_tracks
        cursor.execute("""
            SELECT id, spotify_track_id, track_id, status, position
            FROM spotify_sync_tracks
            WHERE playlist_id = ?
        """, (playlist_id,))
        existing_rows = {r["spotify_track_id"]: dict(r) for r in cursor.fetchall()}

        # 1. Prune tracks that dropped off the Spotify playlist/chart
        removed_ids = [sid for sid in existing_rows if sid not in current_spotify_set]
        if removed_ids:
            placeholders = ",".join("?" for _ in removed_ids)
            cursor.execute(
                f"DELETE FROM spotify_sync_tracks WHERE playlist_id = ? AND spotify_track_id IN ({placeholders})",
                [playlist_id] + removed_ids
            )

        # 2. Add new tracks, update positions & details, auto-retry failed tracks
        for idx, t in enumerate(tracks):
            sid = t["spotify_track_id"]
            t_title = t["title"]
            t_artist = t["artist"]
            t_duration = t["duration_ms"]

            if sid in existing_rows:
                existing = existing_rows[sid]
                curr_track_id = existing["track_id"]
                curr_status = existing["status"]

                # Verify if matched local track actually exists in DB
                if curr_status == "matched" and curr_track_id:
                    cursor.execute("SELECT id FROM tracks WHERE id = ?", (curr_track_id,))
                    if not cursor.fetchone():
                        curr_track_id = None
                        curr_status = "pending"

                # Auto-retry failed tracks
                if curr_status == "failed":
                    curr_status = "pending"

                # If pending and no local track linked, try finding match
                if curr_status == "pending" and not curr_track_id:
                    matched_id = find_track_in_local_db(cursor, t_title, t_artist)
                    if matched_id:
                        curr_track_id = matched_id
                        curr_status = "matched"

                cursor.execute("""
                    UPDATE spotify_sync_tracks
                    SET position = ?,
                        title = ?,
                        artist = ?,
                        duration_ms = ?,
                        status = ?,
                        track_id = ?,
                        error_message = CASE WHEN ? = 'pending' THEN NULL ELSE error_message END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE playlist_id = ? AND spotify_track_id = ?
                """, (idx, t_title, t_artist, t_duration, curr_status, curr_track_id, curr_status, playlist_id, sid))
            else:
                new_tracks_count += 1
                matched_id = find_track_in_local_db(cursor, t_title, t_artist)
                status_val = "matched" if matched_id else "pending"

                cursor.execute("""
                    INSERT INTO spotify_sync_tracks (
                        playlist_id, spotify_track_id, title, artist, duration_ms,
                        position, track_id, status, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (playlist_id, sid, t_title, t_artist, t_duration, idx, matched_id, status_val))

        # 3. Strictly reconcile playlist_tracks:
        # It must contain exactly the matched tracks from spotify_sync_tracks, ordered by chart position.
        cursor.execute("""
            SELECT track_id, MIN(position) as pos
            FROM spotify_sync_tracks
            WHERE playlist_id = ? AND status = 'matched' AND track_id IS NOT NULL
            GROUP BY track_id
            ORDER BY pos ASC
        """, (playlist_id,))
        valid_matched = cursor.fetchall()
        valid_track_ids = [r["track_id"] for r in valid_matched]

        if valid_track_ids:
            placeholders = ",".join("?" for _ in valid_track_ids)
            cursor.execute(
                f"DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id NOT IN ({placeholders})",
                [playlist_id] + valid_track_ids
            )
        else:
            cursor.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))

        for r in valid_matched:
            cursor.execute("""
                INSERT INTO playlist_tracks (playlist_id, track_id, position)
                VALUES (?, ?, ?)
                ON CONFLICT(playlist_id, track_id) DO UPDATE SET position = excluded.position
            """, (playlist_id, r["track_id"], r["pos"]))

        # Count pending downloads
        cursor.execute("SELECT COUNT(*) FROM spotify_sync_tracks WHERE playlist_id = ? AND status = 'pending'", (playlist_id,))
        pending_count = cursor.fetchone()[0]

    # 4. Trigger download queue if pending tracks exist
    if pending_count > 0:
        process_playlist_download_queue(playlist_id)

    return {
        "status": "ok",
        "playlist_id": playlist_id,
        "name": pl["name"],
        "synced_tracks_total": len(tracks),
        "new_tracks_added": new_tracks_count,
        "removed_tracks": len(removed_ids),
        "pending_downloads": pending_count,
    }

@router.post("/import")
def import_spotify_playlist(
    data: SpotifyImportRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Import a Spotify playlist by URL, match local tracks, and queue missing tracks for download."""
    spotify_id = extract_spotify_playlist_id(data.url)
    playlist_data = fetch_spotify_playlist_data(spotify_id)

    name = playlist_data["title"]
    description = playlist_data.get("description", "")
    spotify_url = f"https://open.spotify.com/playlist/{spotify_id}"
    tracks = playlist_data.get("tracks", [])

    if not tracks:
        raise HTTPException(status_code=400, detail="No tracks found in the Spotify playlist.")

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if playlist already exists with this spotify_id
        cursor.execute("SELECT id FROM playlists WHERE spotify_id = ?", (spotify_id,))
        existing_pl = cursor.fetchone()

        if existing_pl:
            playlist_id = existing_pl["id"]
            cursor.execute("""
                UPDATE playlists
                SET name = ?, description = ?, auto_sync = ?, last_synced_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (name, description, 1 if data.auto_sync else 0, playlist_id))
        else:
            cursor.execute("""
                INSERT INTO playlists (name, description, spotify_id, spotify_url, auto_sync, last_synced_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (name, description, spotify_id, spotify_url, 1 if data.auto_sync else 0))
            playlist_id = cursor.lastrowid

    sync_result = sync_single_spotify_playlist(playlist_id, playlist_data=playlist_data)

    return {
        "status": "ok",
        "playlist_id": playlist_id,
        "name": name,
        "total_tracks": sync_result["synced_tracks_total"],
        "new_tracks_added": sync_result["new_tracks_added"],
        "pending": sync_result["pending_downloads"],
    }

@router.get("/status/{playlist_id}")
def get_spotify_playlist_status(
    playlist_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get live download and sync status of a Spotify-linked playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, spotify_id, spotify_url, auto_sync, last_synced_at, sync_status FROM playlists WHERE id = ?", (playlist_id,))
        pl = cursor.fetchone()
        if not pl:
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("""
            SELECT id, spotify_track_id, title, artist, duration_ms, position, track_id, status, error_message, cover_url
            FROM spotify_sync_tracks
            WHERE playlist_id = ?
            ORDER BY position ASC
        """, (playlist_id,))
        tracks = [dict(r) for r in cursor.fetchall()]

    total = len(tracks)
    matched = sum(1 for t in tracks if t["status"] == "matched")
    downloading = sum(1 for t in tracks if t["status"] == "downloading")
    pending = sum(1 for t in tracks if t["status"] == "pending")
    failed = sum(1 for t in tracks if t["status"] == "failed")

    # Attach live memory progress
    with sync_lock:
        for t in tracks:
            t_id = t["id"]
            if t_id in active_spotify_downloads:
                t["live_progress"] = active_spotify_downloads[t_id].get("progress", 0)
                t["live_state"] = active_spotify_downloads[t_id].get("state", "downloading")
    # Auto-heal: Ensure background worker is running if pending tracks exist
    if pending > 0:
        process_playlist_download_queue(playlist_id)

    return {
        "playlist_id": playlist_id,
        "name": pl["name"],
        "spotify_id": pl["spotify_id"],
        "spotify_url": pl["spotify_url"],
        "auto_sync": bool(pl["auto_sync"]),
        "last_synced_at": pl["last_synced_at"],
        "total": total,
        "matched": matched,
        "downloading": downloading,
        "pending": pending,
        "failed": failed,
        "tracks": tracks,
    }

@router.post("/sync-now/{playlist_id}")
def sync_playlist_now(
    playlist_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Force an immediate resync with Spotify for a linked playlist."""
    try:
        return sync_single_spotify_playlist(playlist_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def resume_interrupted_spotify_downloads():
    """Reset any interrupted downloads and kick off background queue workers."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Reset stuck downloading status
            cursor.execute("UPDATE spotify_sync_tracks SET status = 'pending' WHERE status = 'downloading'")
            # Retry any failed tracks that had the 'cover_bytes' bug
            cursor.execute("UPDATE spotify_sync_tracks SET status = 'pending', error_message = NULL WHERE status = 'failed' AND error_message LIKE '%cover_bytes%'")
            cursor.execute("SELECT DISTINCT playlist_id FROM spotify_sync_tracks WHERE status = 'pending'")
            pending_playlists = [r["playlist_id"] for r in cursor.fetchall()]

        for p_id in pending_playlists:
            print(f"[SPOTIFY RESUME] Resuming queue for playlist #{p_id}", flush=True)
            process_playlist_download_queue(p_id)
    except Exception as e:
        print(f"[SPOTIFY RESUME] Error checking pending playlists: {e}", flush=True)

def notify_telegram(message: str):
    """Send summary notification to Telegram bot via host binary or direct Telegram API."""
    if os.path.exists("/usr/local/bin/tg-notify"):
        try:
            import subprocess
            subprocess.run(["/usr/local/bin/tg-notify", message], check=False)
            return
        except Exception:
            pass
    try:
        token_path = Path("/data/telegram/token")
        chatid_path = Path("/data/telegram/chatid")
        if not token_path.exists():
            token_path = Path("/boot/config/plugins/dynamix/telegram/token")
            chatid_path = Path("/boot/config/plugins/dynamix/telegram/chatid")
        if token_path.exists() and chatid_path.exists():
            token = token_path.read_text().strip()
            chat_id = chatid_path.read_text().strip()
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "HTML"}).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5):
                pass
    except Exception as e:
        print(f"[TG NOTIFY] Error: {e}", flush=True)

def start_scheduled_spotify_watcher():
    """Background daemon loop that periodically checks Spotify playlists every 6 hours."""
    # Immediately resume any pending queues from before restart
    resume_interrupted_spotify_downloads()

    def watcher_loop():
        interval_hours = int(os.getenv("SPOTIFY_SYNC_INTERVAL_HOURS", "6"))
        interval_seconds = max(3600, interval_hours * 3600)
        time.sleep(30) # Initial warmup

        while True:
            try:
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id, name FROM playlists WHERE spotify_id IS NOT NULL AND auto_sync = 1")
                    active_playlists = [dict(r) for r in cursor.fetchall()]

                for pl in active_playlists:
                    try:
                        p_id = pl["id"]
                        p_name = pl["name"]
                        res = sync_single_spotify_playlist(p_id)
                        new_count = res.get("new_tracks_added", 0)
                        removed_count = res.get("removed_tracks", 0)

                        if new_count > 0 or removed_count > 0:
                            summary_msg = f"🎵 <b>Spotify Playlist Updated</b>: '{p_name}' synced ({new_count} added, {removed_count} removed, total {res.get('synced_tracks_total', 0)} tracks)"
                            notify_telegram(summary_msg)

                    except Exception as e:
                        print(f"[SPOTIFY WATCHER] Error syncing playlist {pl.get('name')}: {e}", flush=True)

            except Exception as outer_err:
                print(f"[SPOTIFY WATCHER] Loop error: {outer_err}", flush=True)

            time.sleep(interval_seconds)

    thread = threading.Thread(target=watcher_loop, daemon=True)
    thread.start()
