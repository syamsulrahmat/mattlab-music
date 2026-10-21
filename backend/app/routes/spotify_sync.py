import os
import re
import json
import time
import shutil
import urllib.request
import urllib.parse
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks, status
from pydantic import BaseModel, Field

from app.config import MUSIC_DIR, COVERS_DIR
from app.database import get_db
from app.scanner import index_single_audio_file
from app.auth import get_current_user
from app.telegram import notify_telegram

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
    url: Optional[str] = None
    urls: Optional[List[str]] = None
    custom_name: Optional[str] = None
    auto_sync: Optional[bool] = True
    auto_download: Optional[bool] = True
    destination: Optional[str] = "new"  # "new", "library", or "playlist"
    target_playlist_id: Optional[int] = None

class SpotifyMergeRequest(BaseModel):
    urls: List[str]

def normalize_track_key(title: str, artist: str) -> str:
    """Normalize title and artist into a canonical deduplication key.
    Handles remasters, radio edits, featured artists, soundtracks, and punctuation."""
    t = re.sub(r'[\(\[].*?(remaster|live|edit|version|deluxe|bonus|anniversary|explicit|clean|feat|ft|soundtrack).*?[\)\]]', '', title, flags=re.I)
    t = re.sub(r'\s*-\s*(remaster(ed)?(\s*\d+)?|radio edit|single version|album version|explicit|clean|deluxe( edition)?|from.*?soundtrack).*$', '', t, flags=re.I)
    t = re.sub(r'[\(\[].*?[\)\]]', '', t)
    t = re.sub(r'[^\w\s]', '', t).strip().lower()
    t = re.sub(r'\s+', ' ', t)

    a = re.sub(r'[\(\[].*?[\)\]]', '', artist)
    a = a.split(',')[0].split('&')[0].split(' feat.')[0].split(' ft.')[0].split(' featuring ')[0]
    a = re.sub(r'[^\w\s]', '', a).strip().lower()
    a = re.sub(r'\s+', ' ', a)
    return f'{a}:::{t}'

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


def extract_spotify_entity_id(url_or_id: str) -> Tuple[str, str]:
    """Extract (entity_type, id) from Spotify URL or URI. Type is 'track' or 'playlist'."""
    raw = url_or_id.strip()
    match = re.search(r"track/([a-zA-Z0-9]+)", raw)
    if match:
        return ("track", match.group(1))
    match = re.search(r"spotify:track:([a-zA-Z0-9]+)", raw)
    if match:
        return ("track", match.group(1))

    match = re.search(r"playlist/([a-zA-Z0-9]+)", raw)
    if match:
        return ("playlist", match.group(1))
    match = re.search(r"spotify:playlist:([a-zA-Z0-9]+)", raw)
    if match:
        return ("playlist", match.group(1))

    if re.match(r"^[a-zA-Z0-9]{22}$", raw):
        return ("playlist", raw)
    raise ValueError("Invalid Spotify URL. Please provide a Spotify playlist or track link.")

def extract_spotify_playlist_id(url_or_id: str) -> str:
    """Extract clean 22-character Spotify playlist or track ID from URL or URI."""
    etype, eid = extract_spotify_entity_id(url_or_id)
    return eid

def fetch_spotify_track_data(track_id: str) -> Dict[str, Any]:
    """Fetch complete metadata for a single Spotify track."""
    # 1. Tier 1: spotifyscraper get_track
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        tr = client.get_track(track_id)
        if tr:
            t_title = (getattr(tr, "name", "") or "").strip()
            artists_list = getattr(tr, "artists", []) or []
            t_artist = ", ".join([a.name for a in artists_list if getattr(a, "name", None)]).strip()
            album_obj = getattr(tr, "album", None)
            album_name = getattr(album_obj, "name", "Spotify Single") if album_obj else "Spotify Single"
            cover_url = None
            if getattr(tr, "images", None) and len(tr.images) > 0:
                cover_url = tr.images[0].url
            elif album_obj and getattr(album_obj, "images", None) and len(album_obj.images) > 0:
                cover_url = album_obj.images[0].url

            return {
                "spotify_id": track_id,
                "title": f"{t_artist} - {t_title}" if t_artist else t_title,
                "description": f"Spotify track: {t_title} by {t_artist}",
                "cover_url": cover_url,
                "is_single_track": True,
                "tracks": [{
                    "spotify_track_id": track_id,
                    "title": t_title,
                    "artist": t_artist or "Unknown Artist",
                    "album": album_name,
                    "duration_ms": getattr(tr, "duration_ms", 0) or 0,
                    "position": 0,
                    "cover_url": cover_url,
                }]
            }
    except Exception as e:
        print(f"[SPOTIFY TRACK] Scraper failed for {track_id} ({e}), falling back to embed...", flush=True)

    # 2. Tier 2: Public embed page
    try:
        embed_url = f"https://open.spotify.com/embed/track/{track_id}"
        req = urllib.request.Request(embed_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8", errors="ignore")
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if match:
            data = json.loads(match.group(1))
            entity = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
            t_title = entity.get("name", "")
            t_artist = entity.get("subtitle", "")
            cover_url = None
            if entity.get("visualIdentity", {}).get("image"):
                cover_url = entity["visualIdentity"]["image"][0].get("url")
            return {
                "spotify_id": track_id,
                "title": f"{t_artist} - {t_title}" if t_artist else t_title,
                "description": f"Spotify track: {t_title} by {t_artist}",
                "cover_url": cover_url,
                "is_single_track": True,
                "tracks": [{
                    "spotify_track_id": track_id,
                    "title": t_title,
                    "artist": t_artist or "Unknown Artist",
                    "album": "Spotify Single",
                    "duration_ms": entity.get("duration", 0) or 0,
                    "position": 0,
                    "cover_url": cover_url,
                }]
            }
    except Exception as e:
        print(f"[SPOTIFY TRACK] Embed fallback failed for {track_id}: {e}", flush=True)

    raise ValueError(f"Could not load Spotify track details for track {track_id}")

def fetch_spotify_entity_data(url_or_id: str) -> Tuple[str, str, Dict[str, Any]]:
    """Resolve either playlist or track from a URL/ID and return (type, id, data)."""
    etype, eid = extract_spotify_entity_id(url_or_id)
    if etype == "track":
        return (etype, eid, fetch_spotify_track_data(eid))
    else:
        return (etype, eid, fetch_spotify_playlist_data(eid))

def fetch_spotify_playlist_data(playlist_id: str) -> Dict[str, Any]:
    """Fetch complete Spotify playlist metadata and track list.
    Primary (Tier 1): Use spotifyscraper (GraphQL Pathfinder) to paginate and fetch ALL tracks without 100-track limit.
    Fallback (Tier 2): Scrape public embed page if Pathfinder is unavailable (up to 100 tracks).
    """
    # 1. Tier 1: Try spotifyscraper for complete pagination across all tracks (>100 tracks)
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        pl = client.get_playlist(playlist_id, max_tracks=None)
        if pl and pl.tracks:
            tracks = []
            for idx, item in enumerate(pl.tracks):
                inner = getattr(item, "track", None) or item
                t_title = (getattr(inner, "name", "") or "").strip()
                artists_list = getattr(inner, "artists", []) or []
                t_artist = ", ".join([a.name for a in artists_list if getattr(a, "name", None)]).strip()
                if not t_title:
                    continue

                spotify_track_id = getattr(inner, "id", "") or f"track_{idx}"
                duration_ms = getattr(inner, "duration_ms", 0) or 0
                album_obj = getattr(inner, "album", None)
                album_name = getattr(album_obj, "name", pl.name) if album_obj else pl.name

                tracks.append({
                    "spotify_track_id": spotify_track_id,
                    "title": t_title,
                    "artist": t_artist or "Unknown Artist",
                    "album": album_name or pl.name,
                    "duration_ms": duration_ms,
                    "position": idx,
                })

            if tracks:
                cover_url = None
                if getattr(pl, "images", None) and len(pl.images) > 0:
                    cover_url = pl.images[0].url

                return {
                    "spotify_id": playlist_id,
                    "title": pl.name or "Spotify Playlist",
                    "description": getattr(pl, "description", "") or "",
                    "cover_url": cover_url,
                    "tracks": tracks,
                }
    except Exception as e:
        print(f"[SPOTIFY SYNC] Warning: spotifyscraper tier-1 failed ({e}), falling back to embed scraper...", flush=True)

    # 2. Tier 2: Embed scraper fallback
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
    """Import one or multiple Spotify playlists into a unified playlist, match local tracks, and queue missing tracks for download."""
    raw_urls = []
    if data.urls:
        raw_urls.extend(data.urls)
    if data.url:
        parts = [u.strip() for u in re.split(r'[\r\n,]+', data.url) if u.strip()]
        raw_urls.extend(parts)

    unique_urls = []
    for u in raw_urls:
        if u and u not in unique_urls:
            unique_urls.append(u)

    if not unique_urls:
        raise HTTPException(status_code=400, detail="Please provide at least one valid Spotify playlist link.")

    # 1. Merge directly into an existing playlist if target_playlist_id was supplied
    if data.target_playlist_id:
        return merge_spotify_sources(data.target_playlist_id, SpotifyMergeRequest(urls=unique_urls), current_user)

    # 2. Import tracks directly to Library without creating a playlist
    if data.destination == "library":
        playlist_datas = []
        for u in unique_urls:
            try:
                etype, eid, pdata = fetch_spotify_entity_data(u)
                if pdata and pdata.get("tracks"):
                    playlist_datas.append((eid, u, pdata))
            except Exception as e:
                print(f"[SPOTIFY LIBRARY IMPORT] Warning: could not extract {u}: {e}", flush=True)

        if not playlist_datas:
            raise HTTPException(status_code=400, detail="Could not extract any tracks from the provided link(s).")

        from app.routes.request_music import run_direct_download_worker, record_app_request

        new_tracks_queued = 0
        already_in_library = 0
        duplicates_skipped = 0
        seen_keys = set()
        seen_spotify_ids = set()

        with get_db() as conn:
            cursor = conn.cursor()
            for sid, surl, pdata in playlist_datas:
                for t in pdata.get("tracks", []):
                    s_track_id = t.get("spotify_track_id")
                    t_title = t.get("title", "")
                    t_artist = t.get("artist", "")
                    norm_key = normalize_track_key(t_title, t_artist)

                    if s_track_id and s_track_id in seen_spotify_ids:
                        duplicates_skipped += 1
                        continue
                    if norm_key in seen_keys:
                        duplicates_skipped += 1
                        continue

                    if s_track_id:
                        seen_spotify_ids.add(s_track_id)
                    seen_keys.add(norm_key)

                    matched_id = find_track_in_local_db(cursor, t_title, t_artist)
                    if matched_id:
                        already_in_library += 1
                        continue

                    # Queue direct download into /music
                    dl_id = f"spotify_lib_{int(time.time())}_{new_tracks_queued}"
                    album_title = t.get("album") or t_title
                    record_app_request(t_artist, album_title, t_title)
                    threading.Thread(
                        target=run_direct_download_worker,
                        args=(dl_id, t_artist, album_title, t_title, None, t.get("cover_url"), None),
                        daemon=True
                    ).start()
                    new_tracks_queued += 1

        return {
            "status": "ok",
            "destination": "library",
            "total_tracks": sum(len(pd[2].get("tracks", [])) for pd in playlist_datas),
            "new_tracks_queued": new_tracks_queued,
            "already_in_library": already_in_library,
            "duplicates_skipped": duplicates_skipped,
        }

    is_single_playlist = False
    if len(unique_urls) == 1:
        try:
            etype, _ = extract_spotify_entity_id(unique_urls[0])
            is_single_playlist = (etype == "playlist")
        except Exception:
            is_single_playlist = False

    # Single Playlist Import (Standard 1:1 chart clone or custom named)
    if is_single_playlist:
        spotify_id = extract_spotify_playlist_id(unique_urls[0])
        playlist_data = fetch_spotify_playlist_data(spotify_id)

        name = (data.custom_name.strip() if data.custom_name and data.custom_name.strip() else playlist_data["title"])
        description = playlist_data.get("description", "")
        spotify_url = f"https://open.spotify.com/playlist/{spotify_id}"
        tracks = playlist_data.get("tracks", [])

        if not tracks:
            raise HTTPException(status_code=400, detail="No tracks found in the Spotify playlist.")

        with get_db() as conn:
            cursor = conn.cursor()

            # Check if playlist already exists with this spotify_id for the current user
            cursor.execute("SELECT id FROM playlists WHERE spotify_id = ? AND user_id = ?", (spotify_id, current_user["id"]))
            existing_pl = cursor.fetchone()

            if existing_pl:
                playlist_id = existing_pl["id"]
                cursor.execute("""
                    UPDATE playlists
                    SET name = ?, description = ?, auto_sync = ?, last_synced_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND user_id = ?
                """, (name, description, 1 if data.auto_sync else 0, playlist_id, current_user["id"]))
            else:
                # Shift existing playlists down so the newly imported playlist is placed at the top (position 0)
                cursor.execute("UPDATE playlists SET position = position + 1 WHERE user_id = ?", (current_user["id"],))
                cursor.execute("""
                    INSERT INTO playlists (name, description, spotify_id, spotify_url, auto_sync, last_synced_at, user_id, position)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
                """, (name, description, spotify_id, spotify_url, 1 if data.auto_sync else 0, current_user["id"]))
                playlist_id = cursor.lastrowid

            # Record source in playlist_spotify_sources
            cursor.execute("""
                INSERT OR REPLACE INTO playlist_spotify_sources (playlist_id, spotify_id, spotify_url, name, track_count)
                VALUES (?, ?, ?, ?, ?)
            """, (playlist_id, spotify_id, spotify_url, playlist_data["title"], len(tracks)))

        sync_result = sync_single_spotify_playlist(playlist_id, playlist_data=playlist_data)

        return {
            "status": "ok",
            "playlist_id": playlist_id,
            "name": name,
            "total_tracks": sync_result["synced_tracks_total"],
            "new_tracks_added": sync_result["new_tracks_added"],
            "duplicates_skipped": 0,
            "sources_count": 1,
            "pending": sync_result["pending_downloads"],
            "is_collection": False,
        }

    # Unified Collection / Single Track Import with Deduplication
    playlist_datas = []
    for u in unique_urls:
        try:
            etype, eid, pdata = fetch_spotify_entity_data(u)
            if pdata and pdata.get("tracks"):
                playlist_datas.append((eid, u, pdata))
        except Exception as e:
            print(f"[SPOTIFY IMPORT] Warning: could not extract {u}: {e}", flush=True)

    if not playlist_datas:
        raise HTTPException(status_code=400, detail="Could not extract tracks from any of the provided Spotify links.")

    # Determine collection name
    if data.custom_name and data.custom_name.strip():
        name = data.custom_name.strip()
    else:
        name = playlist_datas[0][2].get("title") or "Spotify Collection"

    if len(playlist_datas) == 1 and playlist_datas[0][2].get("is_single_track"):
        description = f"Spotify track import: {playlist_datas[0][2].get('title')}"
    else:
        description = f"Curated collection merged from {len(playlist_datas)} Spotify source(s)."
    first_sid = playlist_datas[0][0]
    first_url = playlist_datas[0][1]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE playlists SET position = position + 1 WHERE user_id = ?", (current_user["id"],))
        # Note: Collections are custom playlists, so spotify_id and spotify_url are NULL, auto_sync = 0
        cursor.execute("""
            INSERT INTO playlists (name, description, spotify_id, spotify_url, auto_sync, last_synced_at, user_id, position)
            VALUES (?, ?, NULL, NULL, 0, CURRENT_TIMESTAMP, ?, 0)
        """, (name, description, current_user["id"]))
        playlist_id = cursor.lastrowid

        # Insert each source
        for sid, surl, pdata in playlist_datas:
            cursor.execute("""
                INSERT OR REPLACE INTO playlist_spotify_sources (playlist_id, spotify_id, spotify_url, name, track_count)
                VALUES (?, ?, ?, ?, ?)
            """, (playlist_id, sid, surl, pdata.get("title", "Spotify Playlist"), len(pdata.get("tracks", []))))

        # Deduplicate tracks across all playlists
        seen_spotify_ids = set()
        seen_keys = set()
        seen_local_ids = set()
        deduped_tracks = []
        duplicates_count = 0

        for sid, surl, pdata in playlist_datas:
            for t in pdata.get("tracks", []):
                s_track_id = t.get("spotify_track_id")
                t_title = t.get("title", "")
                t_artist = t.get("artist", "")
                norm_key = normalize_track_key(t_title, t_artist)

                if s_track_id and s_track_id in seen_spotify_ids:
                    duplicates_count += 1
                    continue
                if norm_key in seen_keys:
                    duplicates_count += 1
                    continue

                matched_id = find_track_in_local_db(cursor, t_title, t_artist)
                if matched_id and matched_id in seen_local_ids:
                    duplicates_count += 1
                    continue

                if s_track_id:
                    seen_spotify_ids.add(s_track_id)
                seen_keys.add(norm_key)
                if matched_id:
                    seen_local_ids.add(matched_id)

                deduped_tracks.append({
                    "spotify_track_id": s_track_id,
                    "title": t_title,
                    "artist": t_artist,
                    "duration_ms": t.get("duration_ms", 0),
                    "cover_url": t.get("cover_url"),
                    "matched_id": matched_id,
                })

        # Insert deduplicated tracks into spotify_sync_tracks and playlist_tracks
        for idx, t in enumerate(deduped_tracks):
            status_val = "matched" if t["matched_id"] else "pending"
            cursor.execute("""
                INSERT OR REPLACE INTO spotify_sync_tracks (
                    playlist_id, spotify_track_id, title, artist, duration_ms,
                    cover_url, position, track_id, status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (playlist_id, t["spotify_track_id"], t["title"], t["artist"], t["duration_ms"],
                  t["cover_url"], idx, t["matched_id"], status_val))

            if t["matched_id"]:
                cursor.execute("""
                    INSERT INTO playlist_tracks (playlist_id, track_id, position)
                    VALUES (?, ?, ?)
                    ON CONFLICT(playlist_id, track_id) DO UPDATE SET position = excluded.position
                """, (playlist_id, t["matched_id"], idx))

        cursor.execute("SELECT COUNT(*) FROM spotify_sync_tracks WHERE playlist_id = ? AND status = 'pending'", (playlist_id,))
        pending_count = cursor.fetchone()[0]

    # Cache cover art
    safe_playlist = sanitize_name(name)
    dest_dir = MUSIC_DIR / "Spotify Downloads" / safe_playlist
    ensure_playlist_cover(dest_dir, name, playlist_datas[0][2].get("cover_url"))

    if pending_count > 0 and data.auto_download:
        process_playlist_download_queue(playlist_id)

    return {
        "status": "ok",
        "playlist_id": playlist_id,
        "name": name,
        "total_tracks": len(deduped_tracks),
        "new_tracks_added": len(deduped_tracks),
        "duplicates_skipped": duplicates_count,
        "sources_count": len(playlist_datas),
        "pending": pending_count,
        "is_collection": True,
    }


@router.post("/merge-sources/{playlist_id}")
def merge_spotify_sources(
    playlist_id: int,
    data: SpotifyMergeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Merge tracks from one or more new Spotify playlists into an existing playlist with deduplication."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, spotify_id, spotify_url, auto_sync FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        pl = cursor.fetchone()
        if not pl:
            raise HTTPException(status_code=404, detail="Playlist not found")

    raw_urls = []
    for u in data.urls:
        parts = [p.strip() for p in re.split(r'[\r\n,]+', u) if p.strip()]
        raw_urls.extend(parts)

    unique_urls = []
    for u in raw_urls:
        if u and u not in unique_urls:
            unique_urls.append(u)

    if not unique_urls:
        raise HTTPException(status_code=400, detail="Please provide at least one valid Spotify playlist link.")

    playlist_datas = []
    for u in unique_urls:
        try:
            etype, eid, pdata = fetch_spotify_entity_data(u)
            if pdata and pdata.get("tracks"):
                playlist_datas.append((eid, u, pdata))
        except Exception as e:
            print(f"[SPOTIFY MERGE] Warning: could not extract {u}: {e}", flush=True)

    if not playlist_datas:
        raise HTTPException(status_code=400, detail="Could not extract tracks from any of the provided Spotify links.")

    with get_db() as conn:
        cursor = conn.cursor()

        # If this was previously a single Spotify playlist, preserve its original source in playlist_spotify_sources
        if pl["spotify_id"]:
            cursor.execute("""
                INSERT OR IGNORE INTO playlist_spotify_sources (playlist_id, spotify_id, spotify_url, name, track_count)
                VALUES (?, ?, ?, ?, (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?))
            """, (playlist_id, pl["spotify_id"], pl["spotify_url"] or f"https://open.spotify.com/playlist/{pl['spotify_id']}", pl["name"], playlist_id))

        # Convert playlist into a personal custom collection (unlinking from Spotify chart sync)
        cursor.execute("""
            UPDATE playlists 
            SET spotify_id = NULL, spotify_url = NULL, auto_sync = 0, last_synced_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, (playlist_id,))

        # Existing tracks to deduplicate against
        cursor.execute("""
            SELECT spotify_track_id, title, artist, track_id, position
            FROM spotify_sync_tracks
            WHERE playlist_id = ?
        """, (playlist_id,))
        existing_sync = cursor.fetchall()

        seen_spotify_ids = {r["spotify_track_id"] for r in existing_sync if r["spotify_track_id"]}
        seen_keys = {normalize_track_key(r["title"], r["artist"]) for r in existing_sync}
        seen_local_ids = {r["track_id"] for r in existing_sync if r["track_id"]}
        max_pos = max([r["position"] for r in existing_sync] + [-1])

        # Also populate local tracks in playlist_tracks if manually added
        cursor.execute("SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
        for r in cursor.fetchall():
            seen_local_ids.add(r["track_id"])
            if r["position"] > max_pos:
                max_pos = r["position"]

        new_tracks_added = 0
        duplicates_skipped = 0
        new_pending_count = 0

        for sid, surl, pdata in playlist_datas:
            # Register in playlist_spotify_sources
            cursor.execute("""
                INSERT OR REPLACE INTO playlist_spotify_sources (playlist_id, spotify_id, spotify_url, name, track_count)
                VALUES (?, ?, ?, ?, ?)
            """, (playlist_id, sid, surl, pdata.get("title", "Spotify Playlist"), len(pdata.get("tracks", []))))

            for t in pdata.get("tracks", []):
                s_track_id = t.get("spotify_track_id")
                t_title = t.get("title", "")
                t_artist = t.get("artist", "")
                norm_key = normalize_track_key(t_title, t_artist)

                if s_track_id and s_track_id in seen_spotify_ids:
                    duplicates_skipped += 1
                    continue
                if norm_key in seen_keys:
                    duplicates_skipped += 1
                    continue

                matched_id = find_track_in_local_db(cursor, t_title, t_artist)
                if matched_id and matched_id in seen_local_ids:
                    duplicates_skipped += 1
                    continue

                # Unique new track to append
                max_pos += 1
                if s_track_id:
                    seen_spotify_ids.add(s_track_id)
                seen_keys.add(norm_key)
                if matched_id:
                    seen_local_ids.add(matched_id)

                status_val = "matched" if matched_id else "pending"
                if not matched_id:
                    new_pending_count += 1

                cursor.execute("""
                    INSERT OR REPLACE INTO spotify_sync_tracks (
                        playlist_id, spotify_track_id, title, artist, duration_ms,
                        cover_url, position, track_id, status, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (playlist_id, s_track_id, t_title, t_artist, t.get("duration_ms", 0),
                      t.get("cover_url"), max_pos, matched_id, status_val))

                if matched_id:
                    cursor.execute("""
                        INSERT INTO playlist_tracks (playlist_id, track_id, position)
                        VALUES (?, ?, ?)
                        ON CONFLICT(playlist_id, track_id) DO UPDATE SET position = excluded.position
                    """, (playlist_id, matched_id, max_pos))

                new_tracks_added += 1

        cursor.execute("SELECT COUNT(*) FROM spotify_sync_tracks WHERE playlist_id = ?", (playlist_id,))
        total_tracks = cursor.fetchone()[0]

    if new_pending_count > 0:
        process_playlist_download_queue(playlist_id)

    return {
        "status": "ok",
        "playlist_id": playlist_id,
        "name": pl["name"],
        "new_tracks_added": new_tracks_added,
        "duplicates_skipped": duplicates_skipped,
        "total_tracks": total_tracks,
        "sources_count": len(playlist_datas),
        "pending": new_pending_count,
    }


@router.get("/sources/{playlist_id}")
def get_spotify_sources(
    playlist_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List all Spotify playlist sources merged into this playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("""
            SELECT id, spotify_id, spotify_url, name, track_count, added_at
            FROM playlist_spotify_sources
            WHERE playlist_id = ?
            ORDER BY id ASC
        """, (playlist_id,))
        rows = [dict(r) for r in cursor.fetchall()]

    return {"playlist_id": playlist_id, "sources": rows}

@router.get("/status/{playlist_id}")
def get_spotify_playlist_status(
    playlist_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get live download and sync status of a Spotify-linked playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, spotify_id, spotify_url, auto_sync, last_synced_at, sync_status FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
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
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")
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
                            notify_telegram(summary_msg, topic="music")

                    except Exception as e:
                        print(f"[SPOTIFY WATCHER] Error syncing playlist {pl.get('name')}: {e}", flush=True)

            except Exception as outer_err:
                print(f"[SPOTIFY WATCHER] Loop error: {outer_err}", flush=True)

            time.sleep(interval_seconds)

    thread = threading.Thread(target=watcher_loop, daemon=True)
    thread.start()
