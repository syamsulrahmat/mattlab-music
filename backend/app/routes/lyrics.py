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

def sanitize_lyrics_text(plain_text):
    if not plain_text:
        return None
    text = plain_text.replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = [l for l in text.split("\n")]
    non_empty = [l for l in raw_lines if l.strip()]
    if not non_empty:
        return None

    total_words = sum(len(l.split()) for l in non_empty)
    avg_words = total_words / len(non_empty)
    has_trailing_space_lines = any(l.endswith(" ") for l in non_empty)

    # Detect word-tokenized lyrics (e.g. 1-2 words per line or trailing spaces before \n)
    if len(non_empty) > 12 and (avg_words <= 2.3 or has_trailing_space_lines):
        reconstructed = []
        current_line = []
        for l in raw_lines:
            stripped = l.strip()
            if not stripped:
                if current_line:
                    reconstructed.append(" ".join(current_line))
                    current_line = []
                if reconstructed and reconstructed[-1] != "":
                    reconstructed.append("")
                continue

            current_line.append(stripped)
            if stripped.endswith((".", "!", "?")) or len(current_line) >= 9 or (not l.endswith(" ") and len(current_line) >= 6):
                reconstructed.append(" ".join(current_line))
                current_line = []
        if current_line:
            reconstructed.append(" ".join(current_line))
        return "\n".join(reconstructed).strip()

    return text.strip()

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
            cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached_data and cached_data.get("plainLyrics"):
                cached_data["plainLyrics"] = sanitize_lyrics_text(cached_data["plainLyrics"])
            return cached_data
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

    # 2. Fetch from LRCLIB API (get + search fallback for synced lyrics)
    lrclib_data = None
    clean_title = track["title"].split("(")[0].split("-")[0].strip()
    primary_artist = track["artist_name"].split("/")[0].split(",")[0].strip()

    try:
        params = {
            "artist_name": primary_artist,
            "track_name": clean_title,
            "album_name": track["album_title"],
            "duration": int(track["duration_seconds"] or 0),
        }
        url = f"https://lrclib.net/api/get?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "MattLabMusic/1.0 (self-hosted)"})
        with urllib.request.urlopen(req, timeout=4) as response:
            lrclib_data = json.loads(response.read().decode("utf-8"))
    except Exception:
        pass

    # If api/get yielded no syncedLyrics, search LRCLIB for a candidate that has synced lyrics
    if not lrclib_data or not lrclib_data.get("syncedLyrics"):
        try:
            query = f"{primary_artist} {clean_title}"
            url = f"https://lrclib.net/api/search?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(url, headers={"User-Agent": "MattLabMusic/1.0 (self-hosted)"})
            with urllib.request.urlopen(req, timeout=4) as response:
                items = json.loads(response.read().decode("utf-8"))
                if items and isinstance(items, list):
                    synced_match = next((it for it in items if it.get("syncedLyrics")), None)
                    if synced_match:
                        lrclib_data = synced_match
                    elif not lrclib_data and items:
                        lrclib_data = items[0]
        except Exception:
            pass

    if lrclib_data and (lrclib_data.get("syncedLyrics") or lrclib_data.get("plainLyrics")):
        result = {
            "track_id": track_id,
            "syncedLyrics": lrclib_data.get("syncedLyrics"),
            "plainLyrics": sanitize_lyrics_text(lrclib_data.get("plainLyrics")),
            "source": "lrclib",
        }
        cache_file.write_text(json.dumps(result), encoding="utf-8")
        return result

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
