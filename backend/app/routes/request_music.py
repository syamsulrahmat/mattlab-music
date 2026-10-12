import os
import re
import json
import urllib.request
import urllib.parse
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database import get_db

router = APIRouter(prefix="/request", tags=["Music Request & Torrent Automation"])

LIDARR_URL = os.getenv("LIDARR_URL", "http://192.168.100.200:8686")
LIDARR_API_KEY = os.getenv("LIDARR_API_KEY", "57ef9453feb44064afba47f5af85eaec")
QBITTORRENT_URL = os.getenv("QBITTORRENT_URL", "http://192.168.100.200:8080")

class ResolveRequest(BaseModel):
    query: str

class DownloadRequest(BaseModel):
    album: Dict[str, Any]
    quality_profile_id: Optional[int] = 1 # 1 = Any, 2 = Lossless

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

def format_album_item(raw_album: Dict[str, Any]) -> Dict[str, Any]:
    """Format raw Lidarr album object for clean frontend consumption."""
    artist_data = raw_album.get("artist", {})
    artist_name = artist_data.get("artistName", "Unknown Artist")
    title = raw_album.get("title", "Unknown Album")
    year = (raw_album.get("releaseDate") or "")[:4]
    
    # Extract best poster cover art (prefer public remoteUrl)
    cover_url = None
    for img in raw_album.get("images", []):
        if img.get("coverType") == "cover":
            cover_url = img.get("remoteUrl") or img.get("url")
            break
    if not cover_url and raw_album.get("images"):
        cover_url = raw_album["images"][0].get("remoteUrl") or raw_album["images"][0].get("url")
    if not cover_url and raw_album.get("remoteCover"):
        cover_url = raw_album.get("remoteCover")

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
            
            # Group into unique album/artist queries (limit to top 15 distinct items for usability)
            unique_items = []
            seen = set()
            for t in track_list:
                t_title = t.get("title", "")
                t_artist = t.get("subtitle", "")
                key = f"{t_artist.lower()} - {t_title.lower()}"
                if key not in seen:
                    seen.add(key)
                    unique_items.append({"track": t_title, "artist": t_artist})
                if len(unique_items) >= 15:
                    break
            
            # Resolve the first 6 items against Lidarr for preview
            resolved_albums = []
            for item in unique_items[:6]:
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
        
        # Extract title and artist from og:meta tags
        # og:title format typically: "Album Name - Album by Artist | Spotify" or "Album Name"
        # og:description format: "Artist · Album · Year · tracks."
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
            "items": [format_album_item(a) for a in lookup_results[:6]],
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
            # Format: "Artist · Album Name · Song · Year"
            parts = [p.strip() for p in desc_match.group(1).replace("&amp;", "&").split("·")]
            if len(parts) >= 2:
                artist_name = parts[0]
                album_name = parts[1]
                
        search_query = f"{artist_name} {album_name or track_name}".strip()
        lookup_results = lidarr_get("album/lookup", {"term": search_query})
        if artist_name and lookup_results:
            lookup_results.sort(key=lambda a: (0 if a.get("artist", {}).get("artistName", "").lower() == artist_name.lower() else 1))
        
        return {
            "type": "spotify_track",
            "detected_track": track_name,
            "detected_artist": artist_name,
            "detected_album": album_name,
            "items": [format_album_item(a) for a in lookup_results[:6]],
        }
    
    raise ValueError("Unrecognized Spotify URL format. Please paste an album, track, or playlist link.")

@router.post("/resolve")
def resolve_music_query(req: ResolveRequest):
    """
    Smart resolver: handles natural language searches, Spotify album/track/playlist links.
    Returns matched albums from MusicBrainz/Lidarr with local library status.
    """
    raw_query = req.query.strip()
    if not raw_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Check if input is a Spotify link
    if "open.spotify.com" in raw_query:
        try:
            return resolve_spotify_url(raw_query)
        except Exception as e:
            # Fall back to raw text query
            print(f"[Resolve] Spotify extraction fallback: {e}")

    # Standard Natural Language Search via Lidarr album lookup
    try:
        results = lidarr_get("album/lookup", {"term": raw_query})
        formatted = [format_album_item(a) for a in results[:10]]
        return {
            "type": "search",
            "query": raw_query,
            "items": formatted,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query Lidarr/MusicBrainz: {str(e)}")

@router.post("/download")
def download_album_torrent(req: DownloadRequest):
    """
    Triggers torrent download for the selected album via Lidarr + Prowlarr + qBittorrent.
    Handles automatic artist creation if new, album monitoring, and dispatching AlbumSearch.
    """
    album_data = req.album
    if not album_data:
        raise HTTPException(status_code=400, detail="Missing album payload")

    artist_name = album_data.get("artist_name") or album_data.get("artist", {}).get("artistName")
    foreign_album_id = album_data.get("foreign_album_id") or album_data.get("foreignAlbumId")
    foreign_artist_id = album_data.get("foreign_artist_id") or album_data.get("artist", {}).get("foreignArtistId")
    album_title = album_data.get("title")
    quality_profile_id = req.quality_profile_id or 1

    if not foreign_album_id:
        raise HTTPException(status_code=400, detail="Missing foreignAlbumId for release")

    # 1. Check if Artist exists in Lidarr
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
        # Artist not in Lidarr -> Add Artist with rootFolderPath /music
        artist_lookup = lidarr_get("artist/lookup", {"term": f"lidarr:{foreign_artist_id}"}) if foreign_artist_id else []
        if not artist_lookup:
            artist_lookup = lidarr_get("artist/lookup", {"term": artist_name})
            
        if not artist_lookup:
            raise HTTPException(status_code=404, detail=f"Artist '{artist_name}' not found on MusicBrainz")

        new_artist_payload = artist_lookup[0]
        new_artist_payload.update({
            "rootFolderPath": "/music",
            "qualityProfileId": quality_profile_id,
            "metadataProfileId": 1,
            "monitored": True,
            "addOptions": {
                "monitor": "none", # Don't monitor entire back catalog
                "searchForMissingAlbums": False,
                "albumsToMonitor": [foreign_album_id]
            }
        })
        
        try:
            created_artist = lidarr_post("artist", new_artist_payload)
            target_artist_id = created_artist["id"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to add artist to Lidarr: {str(e)}")

    # 2. Find or Monitor the Album under the Artist
    artist_albums = lidarr_get("album", {"artistId": target_artist_id})
    target_album = None
    for a in artist_albums:
        if a.get("foreignAlbumId") == foreign_album_id or a.get("title", "").lower() == (album_title or "").lower():
            target_album = a
            break

    if target_album:
        # Ensure album is set to monitored
        if not target_album.get("monitored"):
            target_album["monitored"] = True
            try:
                lidarr_put(f"album/{target_album['id']}", target_album)
            except Exception:
                pass
        target_album_id = target_album["id"]
    else:
        # If newly added artist has not indexed albums yet, trigger command RefreshArtist
        try:
            lidarr_post("command", {"name": "RefreshArtist", "artistId": target_artist_id})
        except Exception:
            pass
        target_album_id = None

    # 3. Dispatch AlbumSearch Command
    if target_album_id:
        try:
            cmd = lidarr_post("command", {"name": "AlbumSearch", "albumIds": [target_album_id]})
            return {
                "success": True,
                "status": "queued",
                "message": f"Search command dispatched for '{album_title}'. Lidarr is querying torrent indexers and sending to qBittorrent!",
                "command_id": cmd.get("id"),
                "album_id": target_album_id,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to execute AlbumSearch in Lidarr: {str(e)}")
    else:
        # Search via artist command
        try:
            lidarr_post("command", {"name": "ArtistSearch", "artistId": target_artist_id})
            return {
                "success": True,
                "status": "queued",
                "message": f"Artist search dispatched for '{artist_name}'. Monitoring '{album_title}'!",
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to dispatch search: {str(e)}")

@router.get("/activity")
def get_download_activity():
    """
    Returns active download queue from both Lidarr and qBittorrent for live UI progress.
    """
    activities = []
    
    # 1. Fetch qBittorrent active torrents in 'lidarr' category
    try:
        req = urllib.request.Request(f"{QBITTORRENT_URL}/api/v2/torrents/info?category=lidarr")
        with urllib.request.urlopen(req, timeout=5) as res:
            q_torrents = json.loads(res.read().decode())
            for t in q_torrents:
                activities.append({
                    "id": t.get("hash"),
                    "name": t.get("name"),
                    "progress": round(t.get("progress", 0) * 100, 1),
                    "state": t.get("state"),
                    "dlspeed": t.get("dlspeed", 0),
                    "eta": t.get("eta", 0),
                    "size": t.get("size", 0),
                    "source": "qBittorrent",
                })
    except Exception as e:
        pass

    # 2. Fetch Lidarr processing queue
    try:
        l_queue = lidarr_get("queue")
        for record in l_queue.get("records", []):
            album_info = record.get("album", {})
            title = album_info.get("title") or record.get("title")
            size = record.get("size", 0)
            sizeleft = record.get("sizeleft", 0)
            pct = round(((size - sizeleft) / size * 100), 1) if size > 0 else 0
            
            # Avoid duplicate if already in qBittorrent list
            if not any(a["name"] == record.get("title") for a in activities):
                activities.append({
                    "id": str(record.get("id")),
                    "name": title,
                    "progress": pct,
                    "state": record.get("status"),
                    "timeleft": record.get("timeleft"),
                    "size": size,
                    "source": "Lidarr",
                })
    except Exception as e:
        pass

    return {
        "active_downloads": activities,
        "count": len(activities),
    }
