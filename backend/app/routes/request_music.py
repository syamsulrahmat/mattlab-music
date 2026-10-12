import os
import re
import json
import time
import shutil
import urllib.request
import urllib.parse
import threading
import difflib
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from app.database import get_db
from app.scanner import scan_music_library

router = APIRouter(prefix="/request", tags=["Music Request & Torrent Automation"])

LIDARR_URL = os.getenv("LIDARR_URL", "http://192.168.100.200:8686")
LIDARR_API_KEY = os.getenv("LIDARR_API_KEY", "57ef9453feb44064afba47f5af85eaec")
QBITTORRENT_URL = os.getenv("QBITTORRENT_URL", "http://192.168.100.200:8080")
MUSIC_DIR = Path(os.getenv("MUSIC_DIR", "/music"))

# Active direct downloads tracking in memory
# key: download_id -> dict
active_direct_downloads: Dict[str, Dict[str, Any]] = {}
app_requested_history: List[Dict[str, Any]] = []
downloads_lock = threading.Lock()

def record_app_request(artist: str, album: str, track: Optional[str] = None):
    with downloads_lock:
        app_requested_history.append({
            "artist": (artist or "").lower().strip(),
            "album": (album or "").lower().strip(),
            "track": (track or "").lower().strip(),
            "time": time.time(),
        })

def is_app_requested_item(item_name: str) -> bool:
    if not item_name:
        return False
    name_low = item_name.lower().strip()
    with downloads_lock:
        for req in app_requested_history:
            art = req.get("artist")
            alb = req.get("album")
            trk = req.get("track")
            if trk and trk in name_low:
                return True
            if alb and alb in name_low:
                return True
            if art and art in name_low:
                return True
    return False

class ResolveRequest(BaseModel):
    query: str

class DownloadRequest(BaseModel):
    album: Dict[str, Any]
    quality_profile_id: Optional[int] = 1 # 1 = Any, 2 = Lossless
    force_direct: Optional[bool] = False

def lidarr_get(endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Helper to perform GET requests against Lidarr REST API."""
    query_params = {"apiKey": LIDARR_API_KEY}
    if params:
        query_params.update(params)
    qs = urllib.parse.urlencode(query_params)
    url = f"{LIDARR_URL}/api/v1/{endpoint}?{qs}"
    
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode())

def lidarr_post(endpoint: str, payload: Dict[str, Any]) -> Any:
    """Helper to perform POST requests against Lidarr REST API."""
    url = f"{LIDARR_URL}/api/v1/{endpoint}?apiKey={LIDARR_API_KEY}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode())

def lidarr_put(endpoint: str, payload: Dict[str, Any]) -> Any:
    """Helper to perform PUT requests against Lidarr REST API."""
    url = f"{LIDARR_URL}/api/v1/{endpoint}?apiKey={LIDARR_API_KEY}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode())

def check_in_local_library(title: str, artist_name: str) -> bool:
    """Check if album or artist already exists in local SQLite tracks/albums."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT a.id FROM albums a
                JOIN artists ar ON a.artist_id = ar.id
                WHERE LOWER(a.title) LIKE LOWER(?) AND LOWER(ar.name) LIKE LOWER(?)
                LIMIT 1
            """, (f"%{title}%", f"%{artist_name}%"))
            return cursor.fetchone() is not None
    except Exception:
        return False

def sanitize_filename(name: str) -> str:
    """Sanitize directory and file names for filesystem storage."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return clean or "Unknown"

def format_album_item(raw_album: Dict[str, Any]) -> Dict[str, Any]:
    """Format raw Lidarr album object for clean frontend consumption."""
    artist_data = raw_album.get("artist", {})
    artist_name = artist_data.get("artistName", "Unknown Artist")
    title = raw_album.get("title", "Unknown Album")
    year = (raw_album.get("releaseDate") or "")[:4]
    
    # Extract best poster cover art
    raw_cover = None
    for img in raw_album.get("images", []):
        if img.get("coverType") == "cover":
            raw_cover = img.get("remoteUrl") or img.get("url")
            break
    if not raw_cover and raw_album.get("images"):
        raw_cover = raw_album["images"][0].get("remoteUrl") or raw_album["images"][0].get("url")
    if not raw_cover and raw_album.get("remoteCover"):
        raw_cover = raw_album.get("remoteCover")

    # If cover is relative to Lidarr, route through backend proxy
    cover_url = None
    if raw_cover:
        if raw_cover.startswith("http://") or raw_cover.startswith("https://"):
            cover_url = raw_cover
        else:
            cover_url = f"/api/request/cover?url={urllib.parse.quote(raw_cover)}"

    in_lib = check_in_local_library(title, artist_name)

    return {
        "title": title,
        "artist_name": artist_name,
        "year": year,
        "cover_url": cover_url,
        "foreign_album_id": raw_album.get("foreignAlbumId"),
        "foreign_artist_id": artist_data.get("foreignArtistId"),
        "artist_id": raw_album.get("artistId", 0),
        "lidarr_album_id": raw_album.get("id"),
        "monitored": raw_album.get("monitored", False),
        "in_library": in_lib,
        "genres": raw_album.get("genres", []),
        "raw": raw_album,
    }

def resolve_spotify_url(url: str) -> Dict[str, Any]:
    """Parse Spotify album, track, or playlist URLs using public endpoints."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    # 1. Spotify Playlist Link
    if "/playlist/" in url:
        playlist_id = re.search(r"/playlist/([a-zA-Z0-9]+)", url)
        if not playlist_id:
            raise ValueError("Invalid Spotify playlist URL")
        
        embed_url = f"https://open.spotify.com/embed/playlist/{playlist_id.group(1)}"
        req = urllib.request.Request(embed_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8", errors="ignore")
            
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if match:
            data = json.loads(match.group(1))
            entity = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
            playlist_name = entity.get("name", "Spotify Playlist")
            track_list = entity.get("trackList", [])
            
            unique_items = []
            seen = set()
            for t in track_list:
                t_title = t.get("title", "")
                t_artist = t.get("subtitle", "")
                key = f"{t_artist.lower()} - {t_title.lower()}"
                if key not in seen:
                    seen.add(key)
                    unique_items.append({"track": t_title, "artist": t_artist})
                if len(unique_items) >= 20:
                    break
            
            resolved_albums = []
            for item in unique_items[:8]:
                search_term = f"{item['artist']} {item['track']}"
                try:
                    results = lidarr_get("album/lookup", {"term": search_term})
                    if results:
                        formatted = format_album_item(results[0])
                        formatted["source_track"] = item["track"]
                        resolved_albums.append(formatted)
                except Exception:
                    continue

            return {
                "type": "spotify_playlist",
                "playlist_name": playlist_name,
                "total_tracks": len(track_list),
                "items": resolved_albums,
                "all_tracks": unique_items,
            }

    # 2. Spotify Album Link
    elif "/album/" in url:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8", errors="ignore")
        
        title_match = re.search(r'<meta property="og:title" content="(.*?)"', html)
        desc_match = re.search(r'<meta property="og:description" content="(.*?)"', html)
        
        album_name = ""
        artist_name = ""
        if title_match:
            raw_title = title_match.group(1).replace("&amp;", "&")
            album_name = raw_title.split(" - Album by")[0].split(" | Spotify")[0].strip()
        if desc_match:
            raw_desc = desc_match.group(1).replace("&amp;", "&")
            parts = [p.strip() for p in raw_desc.split("·")]
            if parts:
                artist_name = parts[0]
                
        search_query = f"{artist_name} {album_name}".strip() if artist_name else album_name
        lookup_results = lidarr_get("album/lookup", {"term": search_query})
        if artist_name and lookup_results:
            lookup_results.sort(key=lambda a: (0 if a.get("artist", {}).get("artistName", "").lower() == artist_name.lower() else 1))
        
        return {
            "type": "spotify_album",
            "detected_artist": artist_name,
            "detected_album": album_name,
            "items": [format_album_item(a) for a in lookup_results[:8]],
        }

    # 3. Spotify Track Link
    elif "/track/" in url:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8", errors="ignore")
            
        title_match = re.search(r'<meta property="og:title" content="(.*?)"', html)
        desc_match = re.search(r'<meta property="og:description" content="(.*?)"', html)
        
        track_name = title_match.group(1).replace("&amp;", "&") if title_match else ""
        artist_name = ""
        album_name = ""
        if desc_match:
            parts = [p.strip() for p in desc_match.group(1).replace("&amp;", "&").split("·")]
            if len(parts) >= 2:
                artist_name = parts[0]
                album_name = parts[1]
                
        search_query = f"{artist_name} {album_name or track_name}".strip()
        lookup_results = lidarr_get("album/lookup", {"term": search_query})
        if artist_name and lookup_results:
            lookup_results.sort(key=lambda a: (0 if a.get("artist", {}).get("artistName", "").lower() == artist_name.lower() else 1))
        
        formatted_items = [format_album_item(a) for a in lookup_results[:8]]
        for item in formatted_items:
            item["source_track"] = track_name

        return {
            "type": "spotify_track",
            "detected_track": track_name,
            "detected_artist": artist_name,
            "detected_album": album_name,
            "items": formatted_items,
        }
    
    raise ValueError("Unrecognized Spotify URL format. Please paste an album, track, or playlist link.")

def run_direct_download_worker(
    download_id: str,
    artist_name: str,
    album_title: str,
    track_title: Optional[str] = None,
    year: Optional[str] = None,
    cover_url: Optional[str] = None,
    target_artist_id: Optional[int] = None
):
    """
    Background worker that grabs official audio via yt-dlp, converts to 320k MP3,
    applies full ID3 tags + embedded cover artwork, saves to /music, and scans library.
    """
    import yt_dlp
    from mutagen.easyid3 import EasyID3
    from mutagen.id3 import ID3, APIC
    from mutagen.mp3 import MP3

    track_name = track_title or album_title
    display_title = f"{artist_name} - {track_name}"

    with downloads_lock:
        active_direct_downloads[download_id] = {
            "id": download_id,
            "name": display_title,
            "progress": 5.0,
            "state": "downloading",
            "dlspeed": 0,
            "eta": 0,
            "size": 0,
            "source": "Direct Download (320k)",
            "updated_at": time.time(),
        }

    try:
        # Create output directories
        artist_folder = MUSIC_DIR / sanitize_filename(artist_name)
        album_folder = artist_folder / sanitize_filename(album_title)
        album_folder.mkdir(parents=True, exist_ok=True)

        final_mp3_path = album_folder / f"{sanitize_filename(track_name)}.mp3"
        temp_dir = Path("/tmp") / f"ytdl_{download_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file_tmpl = str(temp_dir / "%(title)s.%(ext)s")

        def progress_hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                pct = round((downloaded / total * 100), 1) if total > 0 else 0
                with downloads_lock:
                    if download_id in active_direct_downloads:
                        active_direct_downloads[download_id]["progress"] = min(pct, 90.0)
                        active_direct_downloads[download_id]["dlspeed"] = d.get("speed", 0) or 0
                        active_direct_downloads[download_id]["eta"] = d.get("eta", 0) or 0
                        active_direct_downloads[download_id]["size"] = total
                        active_direct_downloads[download_id]["updated_at"] = time.time()
            elif d.get("status") == "finished":
                with downloads_lock:
                    if download_id in active_direct_downloads:
                        active_direct_downloads[download_id]["progress"] = 92.0
                        active_direct_downloads[download_id]["state"] = "converting"
                        active_direct_downloads[download_id]["updated_at"] = time.time()

        # Search query for highest quality official audio
        search_query = f"ytsearch1:{artist_name} {track_name} audio"
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": temp_file_tmpl,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }],
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [progress_hook],
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([search_query])

        with downloads_lock:
            if download_id in active_direct_downloads:
                active_direct_downloads[download_id]["state"] = "tagging"
                active_direct_downloads[download_id]["progress"] = 95.0

        # Find produced MP3
        mp3_files = list(temp_dir.glob("*.mp3"))
        if not mp3_files:
            raise RuntimeError("Audio extraction produced no MP3 file")

        downloaded_mp3 = mp3_files[0]
        shutil.move(str(downloaded_mp3), str(final_mp3_path))
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Apply ID3 tags
        try:
            audio = MP3(str(final_mp3_path), ID3=EasyID3)
            audio["title"] = track_name
            audio["artist"] = artist_name
            audio["album"] = album_title
            audio["albumartist"] = artist_name
            if year:
                audio["date"] = str(year)[:4]
            audio.save()

            # Resolve cover image URL robustly
            target_cover_url = cover_url
            if not target_cover_url:
                try:
                    lookups = lidarr_get("album/lookup", {"term": f"{artist_name} {album_title}"})
                    if lookups:
                        target_cover_url = lookups[0].get("remoteCover")
                        if not target_cover_url and lookups[0].get("images"):
                            for img in lookups[0]["images"]:
                                if img.get("coverType") == "cover":
                                    target_cover_url = img.get("remoteUrl") or img.get("url")
                                    break
                except Exception as look_err:
                    print(f"[DirectDownload] Lookup fallback notice: {look_err}")

            img_bytes = None
            if target_cover_url:
                try:
                    c_url = target_cover_url
                    if c_url.startswith("/api/request/cover?url="):
                        c_url = urllib.parse.unquote(c_url.split("?url=")[1])
                    if c_url.startswith("/"):
                        c_url = f"{LIDARR_URL}{c_url}?apiKey={LIDARR_API_KEY}"
                    
                    req_img = urllib.request.Request(c_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req_img, timeout=10) as res:
                        img_bytes = res.read()
                except Exception as cov_dl_err:
                    print(f"[DirectDownload] Cover download error: {cov_dl_err}")

            if img_bytes:
                # 1. Save cover.jpg directly into album directory
                try:
                    cover_file_path = album_folder / "cover.jpg"
                    with open(cover_file_path, "wb") as cf:
                        cf.write(img_bytes)
                except Exception:
                    pass

                # 2. Embed into MP3 with ID3 APIC frame
                try:
                    audio_id3 = MP3(str(final_mp3_path), ID3=ID3)
                    audio_id3.tags.add(APIC(
                        encoding=3,
                        mime="image/jpeg",
                        type=3,
                        desc="Cover",
                        data=img_bytes
                    ))
                    audio_id3.save()
                except Exception as apic_err:
                    print(f"[DirectDownload] APIC tag embed notice: {apic_err}")

                # 3. Cache into COVERS_DIR for immediate web player rendering
                try:
                    from app.scanner import get_album_hash, save_cover_image
                    album_hash = get_album_hash(artist_name, album_title)
                    saved_path = save_cover_image(img_bytes, album_hash)
                    if saved_path:
                        with get_db() as conn:
                            cur = conn.cursor()
                            cur.execute(
                                "UPDATE albums SET cover_path = ? WHERE LOWER(title) = LOWER(?)",
                                (saved_path, album_title)
                            )
                except Exception as cache_err:
                    print(f"[DirectDownload] Cover caching notice: {cache_err}")
        except Exception as tag_err:
            print(f"[DirectDownload] Tagging notice: {tag_err}")

        # Scan into local library
        try:
            scan_music_library()
        except Exception as scan_err:
            print(f"[DirectDownload] Library scan notice: {scan_err}")

        # Notify Lidarr to rescan and index on disk
        if target_artist_id:
            try:
                lidarr_post("command", {"name": "RescanArtist", "artistId": target_artist_id})
                lidarr_post("command", {"name": "DownloadedAlbumsScan"})
            except Exception:
                pass

        with downloads_lock:
            if download_id in active_direct_downloads:
                active_direct_downloads[download_id]["progress"] = 100.0
                active_direct_downloads[download_id]["state"] = "completed"
                active_direct_downloads[download_id]["updated_at"] = time.time()

    except Exception as e:
        print(f"[DirectDownload] Worker error for {display_title}: {e}")
        with downloads_lock:
            if download_id in active_direct_downloads:
                active_direct_downloads[download_id]["state"] = "error"
                active_direct_downloads[download_id]["error"] = str(e)
                active_direct_downloads[download_id]["updated_at"] = time.time()

@router.get("/cover")
def proxy_cover(url: str = Query(...)):
    """Proxy cover art images to avoid Lidarr auth cookies or external CORS issues."""
    try:
        target_url = url
        if target_url.startswith("/"):
            delim = "&" if "?" in target_url else "?"
            target_url = f"{LIDARR_URL}{target_url}{delim}apiKey={LIDARR_API_KEY}"
        
        req = urllib.request.Request(target_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as res:
            content = res.read()
            mime = res.headers.get("Content-Type", "image/jpeg")
            return Response(content=content, media_type=mime)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to fetch cover art: {str(e)}")

@router.get("/preview")
def get_song_preview(artist: Optional[str] = Query(None), title: Optional[str] = Query(None), query: Optional[str] = Query(None)):
    """
    Fetch a 30-second audio preview clip for any song via high-speed iTunes/Deezer CDNs.
    Provides instant, zero-auth preview stream so users can listen before downloading.
    """
    search_term = f"{artist or ''} {title or ''}".strip() or (query or "").strip()
    if not search_term:
        raise HTTPException(status_code=400, detail="Search query or artist/title required")

    # 1. Primary: iTunes Search API
    try:
        url = f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': search_term, 'entity': 'song', 'limit': 3})}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode())
            results = data.get("results", [])
            if results:
                match = results[0]
                preview_url = match.get("previewUrl")
                if preview_url:
                    return {
                        "success": True,
                        "preview_url": preview_url,
                        "track_name": match.get("trackName"),
                        "artist_name": match.get("artistName"),
                        "duration_ms": 30000,
                    }
    except Exception as e:
        print(f"[Preview] iTunes error: {e}")

    # 2. Fallback: Deezer preview API
    try:
        deezer_url = f"https://api.deezer.com/search?q={urllib.parse.quote(search_term)}&limit=1"
        req = urllib.request.Request(deezer_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            d_data = json.loads(res.read().decode())
            d_results = d_data.get("data", [])
            if d_results and d_results[0].get("preview"):
                return {
                    "success": True,
                    "preview_url": d_results[0]["preview"],
                    "track_name": d_results[0].get("title"),
                    "artist_name": d_results[0].get("artist", {}).get("name"),
                    "duration_ms": 30000,
                }
    except Exception as e:
        print(f"[Preview] Deezer error: {e}")

    raise HTTPException(status_code=404, detail="No audio preview clip found for this track")

def compute_popularity_score(album: Dict[str, Any], query: str) -> float:
    """
    Compute relevance + popularity ranking score so prominent releases by famous artists
    (e.g., Christina Perri for 'A Thousand Years', Coldplay for 'Viva la Vida')
    rank at the top ahead of obscure covers or bootlegs.
    """
    score = 0.0
    artist = album.get("artist", {})
    artist_name = (artist.get("artistName") or "").lower()
    title = (album.get("title") or "").lower()
    q = query.lower().strip()

    # Exact or substring title match
    if title == q:
        score += 80.0
    elif q in title:
        score += 40.0

    # Artist in query match
    if artist_name and artist_name in q:
        score += 50.0

    # Verification / links count: Popular artists have many links (Spotify, Discogs, Official site, etc.)
    links = artist.get("links") or []
    score += min(len(links) * 2.5, 75.0)

    # Album community ratings
    ratings = album.get("ratings") or {}
    score += (ratings.get("votes", 0) * ratings.get("value", 0)) * 6.0

    # Artist community ratings
    artist_ratings = artist.get("ratings") or {}
    score += (artist_ratings.get("votes", 0) * artist_ratings.get("value", 0)) * 2.5

    # Album type: Studio albums & singles/EPs rank higher than bootlegs/compilations
    album_type = (album.get("albumType") or "").lower()
    secondary_types = [t.lower() for t in (album.get("secondaryTypes") or [])]
    if album_type in ["album", "single", "ep"]:
        score += 15.0
    if "compilation" in secondary_types:
        score -= 10.0
    if "live" in secondary_types:
        score -= 5.0

    # Has remote cover
    if album.get("remoteCover") or album.get("images"):
        score += 15.0

    return score

def score_candidate(track_name: str, artist_name: str, query: str) -> float:
    query_low = query.lower().strip()
    track_low = (track_name or "").lower().strip()
    artist_low = (artist_name or "").lower().strip()
    combined = f"{track_low} {artist_low}"
    combined_rev = f"{artist_low} {track_low}"
    
    ratio1 = difflib.SequenceMatcher(None, query_low, combined).ratio()
    ratio2 = difflib.SequenceMatcher(None, query_low, combined_rev).ratio()
    base_ratio = max(ratio1, ratio2)
    
    q_tokens = query_low.split()
    matched_tokens = 0
    for tok in q_tokens:
        if tok in artist_low or tok in track_low:
            matched_tokens += 1
        else:
            for part in (artist_low + " " + track_low).split():
                if difflib.SequenceMatcher(None, tok, part).ratio() > 0.7:
                    matched_tokens += 1
                    break
    token_score = matched_tokens / max(len(q_tokens), 1)
    return base_ratio * 0.5 + token_score * 0.5

def resolve_smart_canonical_query(query: str) -> Optional[Dict[str, str]]:
    """
    Uses iTunes & Deezer search APIs to resolve typos, phonetics, and misspellings into
    canonical track, artist, and album names (e.g. 'phsyco red velvet' -> track: 'Psycho', artist: 'Red Velvet').
    """
    clean_q = query.strip()
    if not clean_q or len(clean_q) < 3:
        return None

    candidates: List[Dict[str, Any]] = []

    # 1. Search iTunes
    try:
        url = f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': clean_q, 'entity': 'song', 'limit': 5})}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode())
            for item in data.get("results", []):
                t_name = item.get("trackName")
                a_name = item.get("artistName")
                col_name = item.get("collectionName")
                if t_name and a_name:
                    candidates.append({
                        "track": t_name,
                        "artist": a_name,
                        "album": col_name or t_name,
                        "score": score_candidate(t_name, a_name, clean_q),
                    })
    except Exception as e:
        print(f"[SmartQuery] iTunes lookup failed: {e}")

    # 2. Search Deezer fallback
    try:
        url = f"https://api.deezer.com/search?q={urllib.parse.quote(clean_q)}&limit=5"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode())
            for item in data.get("data", []):
                t_name = item.get("title")
                a_name = item.get("artist", {}).get("name")
                alb_name = item.get("album", {}).get("title")
                if t_name and a_name:
                    candidates.append({
                        "track": t_name,
                        "artist": a_name,
                        "album": alb_name or t_name,
                        "score": score_candidate(t_name, a_name, clean_q),
                    })
    except Exception as e:
        print(f"[SmartQuery] Deezer lookup failed: {e}")

    if not candidates:
        return None

    candidates.sort(key=lambda c: c["score"], reverse=True)
    best = candidates[0]
    if best["score"] >= 0.35:
        return {
            "track": best["track"],
            "artist": best["artist"],
            "album": best["album"],
        }
    return None

@router.post("/resolve")
def resolve_music_query(req: ResolveRequest):
    """
    Smart resolver: handles natural language searches, Spotify album/track/playlist links,
    and automatic typo/phonetic spelling correction (e.g. 'phsyco red velvet' -> 'Psycho' by 'Red Velvet').
    Returns matched albums from MusicBrainz/Lidarr with local library status,
    sorted by popularity and relevance.
    """
    raw_query = req.query.strip()
    if not raw_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if "open.spotify.com" in raw_query:
        try:
            return resolve_spotify_url(raw_query)
        except Exception as e:
            print(f"[Resolve] Spotify extraction fallback: {e}")

    # Check for smart canonical correction (typo tolerance)
    canonical = resolve_smart_canonical_query(raw_query)
    corrected_query_str = None
    target_track_name = None
    target_artist_name = None

    results = []
    seen_album_ids = set()

    # 1. If typo correction identified canonical artist & track
    if canonical:
        target_track_name = canonical.get("track")
        target_artist_name = canonical.get("artist")
        canonical_album = canonical.get("album") or ""
        corrected_query_str = f"{target_artist_name} - {target_track_name}"

        # Clean collection name (strip ' - EP', ' - Single', ' (Deluxe)', etc.)
        clean_album = re.sub(r' - (EP|Single|Mini Album|Deluxe|Remastered).*', '', canonical_album, flags=re.I).strip()

        lookup_queries = []
        if clean_album and len(clean_album) > 1:
            lookup_queries.append(clean_album)
        if target_artist_name and target_track_name:
            lookup_queries.append(f"{target_artist_name} {target_track_name}")
        if target_artist_name and clean_album:
            lookup_queries.append(f"{target_artist_name} {clean_album}")

        for term in lookup_queries:
            try:
                term_results = lidarr_get("album/lookup", {"term": term}) or []
                for a in term_results:
                    aid = a.get("foreignAlbumId") or a.get("title")
                    if aid not in seen_album_ids:
                        seen_album_ids.add(aid)
                        results.append(a)
            except Exception as e:
                print(f"[Resolve] Canonical lookup failed for '{term}': {e}")

    # 2. Also query Lidarr with raw_query
    try:
        raw_results = lidarr_get("album/lookup", {"term": raw_query}) or []
        for a in raw_results:
            aid = a.get("foreignAlbumId") or a.get("title")
            if aid not in seen_album_ids:
                seen_album_ids.add(aid)
                results.append(a)
    except Exception as e:
        print(f"[Resolve] Raw Lidarr lookup failed for '{raw_query}': {e}")

    canonical_album = canonical.get("album") or "" if canonical else ""
    clean_album = re.sub(r' - (EP|Single|Mini Album|Deluxe|Remastered).*', '', canonical_album, flags=re.I).strip() if canonical_album else ""

    # Sort results with boost for matching canonical artist and album
    def score_album(a):
        base = compute_popularity_score(a, raw_query)
        a_title = (a.get("title") or "").lower()
        a_art = (a.get("artist", {}).get("artistName") or "").lower()
        if target_artist_name:
            if target_artist_name.lower() in a_art or a_art in target_artist_name.lower():
                base += 150.0
        if clean_album and len(clean_album) > 2:
            cl = clean_album.lower()
            if cl in a_title or a_title in cl:
                base += 350.0
        return base

    results.sort(key=score_album, reverse=True)

    formatted = []
    for a in results[:14]:
        item = format_album_item(a)
        if target_track_name:
            a_art = (item.get("artist_name") or "").lower()
            a_title = (item.get("title") or "").lower()
            if target_artist_name and (target_artist_name.lower() in a_art or a_art in target_artist_name.lower()):
                if clean_album and (clean_album.lower() in a_title or a_title in clean_album.lower()):
                    item["source_track"] = target_track_name
                elif not clean_album:
                    item["source_track"] = target_track_name
        formatted.append(item)

    resp = {
        "type": "search",
        "query": raw_query,
        "items": formatted,
    }
    if corrected_query_str:
        resp["corrected_query"] = corrected_query_str
        resp["detected_track"] = target_track_name
        resp["detected_artist"] = target_artist_name
        resp["detected_album"] = canonical.get("album")

    if target_track_name:
        song_cover = formatted[0]["cover_url"] if formatted else None
        for f in formatted:
            if clean_album and clean_album.lower() in (f.get("title") or "").lower():
                song_cover = f.get("cover_url")
                break
        resp["song_result"] = {
            "title": target_track_name,
            "artist_name": target_artist_name,
            "album_title": canonical.get("album") if canonical else (formatted[0]["title"] if formatted else ""),
            "cover_url": song_cover,
            "source_track": target_track_name,
        }

    return resp

@router.post("/download")
def download_album(req: DownloadRequest):
    """
    Hybrid Downloader:
    1. Checks Lidarr and torrent trackers (Prowlarr -> qBittorrent).
    2. If torrent releases exist: dispatches AlbumSearch to grab torrent.
    3. If 0 torrent releases exist (common for modern singles, streaming releases):
       automatically triggers high-quality (320k) direct audio extraction directly into /music.
    """
    album_data = req.album
    if not album_data:
        raise HTTPException(status_code=400, detail="Missing album payload")

    artist_name = album_data.get("artist_name") or album_data.get("artist", {}).get("artistName")
    foreign_album_id = album_data.get("foreign_album_id") or album_data.get("foreignAlbumId")
    foreign_artist_id = album_data.get("foreign_artist_id") or album_data.get("artist", {}).get("foreignArtistId")
    album_title = album_data.get("title")
    source_track = album_data.get("source_track")
    year = album_data.get("year")
    cover_url = album_data.get("cover_url")
    if not cover_url:
        for img in album_data.get("images", []):
            if img.get("coverType") == "cover":
                cover_url = img.get("remoteUrl") or img.get("url")
                break
        if not cover_url and album_data.get("images"):
            cover_url = album_data["images"][0].get("remoteUrl") or album_data["images"][0].get("url")
        if not cover_url and album_data.get("remoteCover"):
            cover_url = album_data.get("remoteCover")
    quality_profile_id = req.quality_profile_id or 1
    force_direct = req.force_direct or False

    if not artist_name:
        raise HTTPException(status_code=400, detail="Artist name is required")

    # Record that this item was requested by our web app so it displays on live activity
    record_app_request(artist_name, album_title or "", source_track)

    # 1. Check or Add Artist in Lidarr
    existing_artists = lidarr_get("artist")
    matched_artist = None
    for a in existing_artists:
        if a.get("foreignArtistId") == foreign_artist_id or a.get("artistName", "").lower() == (artist_name or "").lower():
            matched_artist = a
            break

    target_artist_id = None
    if matched_artist:
        target_artist_id = matched_artist["id"]
    else:
        # Artist not in Lidarr -> Add Artist
        artist_lookup = lidarr_get("artist/lookup", {"term": f"lidarr:{foreign_artist_id}"}) if foreign_artist_id else []
        if not artist_lookup:
            artist_lookup = lidarr_get("artist/lookup", {"term": artist_name})
            
        if artist_lookup:
            new_artist_payload = artist_lookup[0]
            new_artist_payload.update({
                "rootFolderPath": "/music",
                "qualityProfileId": quality_profile_id,
                "metadataProfileId": 1,
                "monitored": True,
                "addOptions": {
                    "monitor": "none",
                    "searchForMissingAlbums": False,
                    "albumsToMonitor": [foreign_album_id] if foreign_album_id else []
                }
            })
            try:
                created_artist = lidarr_post("artist", new_artist_payload)
                target_artist_id = created_artist["id"]
                # Allow Lidarr 2-3s to populate initial album catalog
                for _ in range(6):
                    time.sleep(1)
                    albums_check = lidarr_get("album", {"artistId": target_artist_id})
                    if albums_check:
                        break
            except Exception as e:
                print(f"[Download] Lidarr artist add error: {e}")

    # 2. Find and Monitor Album in Lidarr
    target_album_id = None
    if target_artist_id:
        artist_albums = lidarr_get("album", {"artistId": target_artist_id})
        for a in artist_albums:
            if (foreign_album_id and a.get("foreignAlbumId") == foreign_album_id) or \
               (album_title and a.get("title", "").lower() == album_title.lower()):
                target_album_id = a.get("id")
                if not a.get("monitored"):
                    a["monitored"] = True
                    try:
                        lidarr_put(f"album/{a['id']}", a)
                    except Exception:
                        pass
                break

    # 3. Check Torrent Releases on Trackers
    torrent_releases_count = 0
    if target_album_id and not force_direct:
        try:
            releases = lidarr_get("release", {"albumId": target_album_id})
            torrent_releases_count = len(releases) if isinstance(releases, list) else 0
        except Exception as e:
            print(f"[Download] Release lookup error: {e}")

    # 4. Dispatch Torrent vs Fallback Direct Download
    if torrent_releases_count > 0:
        # Torrents exist! Dispatch to Lidarr and qBittorrent
        try:
            cmd = lidarr_post("command", {"name": "AlbumSearch", "albumIds": [target_album_id]})
            return {
                "success": True,
                "method": "torrent",
                "status": "queued",
                "message": f"Torrent found ({torrent_releases_count} release(s)). Dispatched to qBittorrent via Lidarr for '{album_title}'!",
                "command_id": cmd.get("id"),
                "album_id": target_album_id,
            }
        except Exception as e:
            print(f"[Download] AlbumSearch error: {e}")

    # If 0 torrent releases found on trackers (or force_direct), execute Direct HQ Download
    download_id = f"dl_{int(time.time())}_{abs(hash(artist_name + (album_title or ''))) % 10000}"
    track_to_download = source_track or album_title

    thread = threading.Thread(
        target=run_direct_download_worker,
        args=(
            download_id,
            artist_name,
            album_title or track_to_download,
            track_to_download,
            year,
            cover_url,
            target_artist_id
        ),
        daemon=True
    )
    thread.start()

    return {
        "success": True,
        "method": "direct_download",
        "status": "downloading",
        "download_id": download_id,
        "message": f"No torrent seeders found on trackers. Auto-downloading 320k audio for '{track_to_download}' directly to your library!",
    }

@router.get("/activity")
def get_download_activity():
    """
    Returns unified active download queue from:
    1. Direct background HQ downloads
    2. qBittorrent active torrents in 'lidarr' category
    3. Lidarr queue
    """
    activities = []
    now = time.time()

    # 1. Fetch direct background downloads
    with downloads_lock:
        to_delete = []
        for d_id, item in active_direct_downloads.items():
            # Keep completed/error items for 60 seconds so user sees final state
            if item.get("state") in ("completed", "error"):
                if now - item.get("updated_at", now) > 60:
                    to_delete.append(d_id)
                    continue

            activities.append({
                "id": item["id"],
                "name": item["name"],
                "progress": item["progress"],
                "state": item["state"],
                "dlspeed": item["dlspeed"],
                "eta": item["eta"],
                "size": item["size"],
                "source": item["source"],
            })

        for d_id in to_delete:
            active_direct_downloads.pop(d_id, None)

    # 2. Fetch qBittorrent active torrents in 'lidarr' category
    q_in_progress = []
    q_completed = []

    try:
        req = urllib.request.Request(f"{QBITTORRENT_URL}/api/v2/torrents/info?category=lidarr")
        with urllib.request.urlopen(req, timeout=4) as res:
            q_torrents = json.loads(res.read().decode())
            # Sort newest first by added_on
            q_torrents.sort(key=lambda t: t.get("added_on", 0), reverse=True)

            for t in q_torrents:
                name = t.get("name", "")
                raw_state = t.get("state", "")
                pct = round(t.get("progress", 0) * 100, 1)

                # Human-friendly state mapping:
                if pct >= 100 or raw_state in ("stoppedUP", "pausedUP", "uploading", "stalledUP", "forcedUP"):
                    friendly_state = "completed"
                elif raw_state in ("downloading", "forcedDL", "metaDL"):
                    friendly_state = "downloading"
                elif raw_state in ("queuedDL", "allocating", "checkingDL"):
                    friendly_state = "queued"
                elif raw_state in ("stalledDL", "pausedDL"):
                    friendly_state = "stalled"
                else:
                    friendly_state = "completed" if pct >= 100 else raw_state

                # USER RULE: Only show downloads requested by our music app!
                # Filter out completed items and third-party Lidarr downloads not initiated by this app.
                if friendly_state == "completed":
                    if not is_app_requested_item(name):
                        continue
                else:
                    # In-progress: require app request match or recent addition within last 2 hours
                    if not is_app_requested_item(name) and t.get("added_on", 0) < now - 7200:
                        continue

                item_obj = {
                    "id": t.get("hash"),
                    "name": t.get("name"),
                    "progress": pct,
                    "state": friendly_state,
                    "raw_state": raw_state,
                    "dlspeed": t.get("dlspeed", 0),
                    "eta": t.get("eta", 0),
                    "size": t.get("size", 0),
                    "added_on": t.get("added_on", 0),
                    "source": "qBittorrent",
                }

                if friendly_state == "completed":
                    q_completed.append(item_obj)
                else:
                    q_in_progress.append(item_obj)

    except Exception as e:
        print(f"[Activity] qBittorrent query error: {e}")

    # 3. Fetch Lidarr processing queue
    lidarr_items = []
    try:
        l_queue = lidarr_get("queue")
        for record in l_queue.get("records", []):
            album_info = record.get("album", {})
            title = album_info.get("title") or record.get("title") or ""
            if not is_app_requested_item(title):
                continue

            size = record.get("size", 0)
            sizeleft = record.get("sizeleft", 0)
            pct = round(((size - sizeleft) / size * 100), 1) if size > 0 else 0
            
            rec_status = record.get("status", "").lower()
            if pct >= 100 or rec_status in ("completed", "imported"):
                rec_state = "completed"
            elif rec_status in ("downloading", "pending"):
                rec_state = "downloading"
            else:
                rec_state = rec_status

            lidarr_items.append({
                "id": str(record.get("id")),
                "name": title,
                "progress": pct,
                "state": rec_state,
                "raw_state": record.get("status"),
                "timeleft": record.get("timeleft"),
                "size": size,
                "source": "Lidarr",
            })
    except Exception as e:
        print(f"[Activity] Lidarr queue error: {e}")

    # Combine: Active in-progress first, then Lidarr items, then completed app items
    active_in_progress = [a for a in activities if a["state"] != "completed"]
    active_completed = [a for a in activities if a["state"] == "completed"]

    combined = active_in_progress + q_in_progress + lidarr_items + active_completed + q_completed

    # Deduplicate by name/id
    seen_names = set()
    deduped = []
    for item in combined:
        n = (item.get("name") or "").lower()
        if n and n not in seen_names:
            seen_names.add(n)
            deduped.append(item)

    return {
        "active_downloads": deduped,
        "count": len(deduped),
    }
