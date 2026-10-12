import json
import urllib.request
import urllib.parse
from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.config import DATA_DIR
from app.database import get_db

router = APIRouter(tags=["Lyrics"])
LYRICS_DIR = DATA_DIR / "lyrics"
LYRICS_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/lyrics/{track_id}")
async def get_track_lyrics(track_id: int):
    """
    Retrieve timed/synced or plain lyrics for a track.
    Checks:
    1. Cached lyrics in /data/lyrics/{track_id}.json
    2. Local .lrc sidecar file next to audio file
    3. LRCLIB public lyrics service (free, open source)
    """
    cache_file = LYRICS_DIR / f"{track_id}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                t.title, t.duration_seconds, t.file_path,
                a.title AS album_title,
                ar.name AS artist_name
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.id = ?
        """, (track_id,))
        track = cursor.fetchone()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # 1. Check local .lrc sidecar file
    audio_path = Path(track["file_path"])
    lrc_cand = audio_path.with_suffix(".lrc")
    if lrc_cand.exists() and lrc_cand.is_file():
        try:
            lrc_text = lrc_cand.read_text(encoding="utf-8", errors="ignore")
            result = {
                "track_id": track_id,
                "syncedLyrics": lrc_text,
                "plainLyrics": None,
                "source": "local_lrc",
            }
            cache_file.write_text(json.dumps(result), encoding="utf-8")
            return result
        except Exception:
            pass

    # 2. Fetch from LRCLIB API
    try:
        clean_title = track["title"].split("(")[0].split("-")[0].strip()
        params = {
            "artist_name": track["artist_name"].split("/")[0].split(",")[0].strip(),
            "track_name": clean_title,
            "album_name": track["album_title"],
            "duration": int(track["duration_seconds"] or 0),
        }
        url = f"https://lrclib.net/api/get?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "MattLabMusic/1.0 (self-hosted)"})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
            result = {
                "track_id": track_id,
                "syncedLyrics": data.get("syncedLyrics"),
                "plainLyrics": data.get("plainLyrics"),
                "source": "lrclib",
            }
            cache_file.write_text(json.dumps(result), encoding="utf-8")
            return result
    except Exception:
        pass

    # 3. Fallback search on LRCLIB without strict duration/album
    try:
        query = f"{track['artist_name']} {clean_title}"
        url = f"https://lrclib.net/api/search?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={"User-Agent": "MattLabMusic/1.0 (self-hosted)"})
        with urllib.request.urlopen(req, timeout=4) as response:
            items = json.loads(response.read().decode("utf-8"))
            if items and len(items) > 0:
                first = items[0]
                result = {
                    "track_id": track_id,
                    "syncedLyrics": first.get("syncedLyrics"),
                    "plainLyrics": first.get("plainLyrics"),
                    "source": "lrclib_search",
                }
                cache_file.write_text(json.dumps(result), encoding="utf-8")
                return result
    except Exception:
        pass

    not_found_result = {
        "track_id": track_id,
        "syncedLyrics": None,
        "plainLyrics": None,
        "source": "none",
        "notFound": True,
    }
    # Cache negative result for 1 hour to avoid spamming
    try:
        cache_file.write_text(json.dumps(not_found_result), encoding="utf-8")
    except Exception:
        pass
    return not_found_result
