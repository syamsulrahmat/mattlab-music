import re
import time
import logging
import urllib.parse
import urllib.request
import json
import threading
from typing import Optional, Dict, Any, List
from app.database import get_db

logger = logging.getLogger("popularity")

# In-memory thread lock to prevent concurrent backfills
_backfill_lock = threading.Lock()
_is_backfilling = False

def normalize_title_for_search(title: str) -> str:
    """Clean track title by removing parenthetical noise like (Remastered 2021) or [feat. X]."""
    t = re.sub(r'[\(\[].*?(remaster|live|edit|version|deluxe|bonus|anniversary|explicit|clean|soundtrack).*?[\)\]]', '', title, flags=re.I)
    t = re.sub(r'\s*-\s*(remaster(ed)?(\s*\d+)?|radio edit|single version|album version|explicit|clean|deluxe).*$', '', t, flags=re.I)
    return re.sub(r'\s+', ' ', t).strip()

def fetch_itunes_popularity(title: str, artist: str) -> Optional[int]:
    """Query iTunes Search API to estimate canonical popularity based on search relevance position."""
    try:
        clean_title = normalize_title_for_search(title)
        clean_artist = artist.split(',')[0].split('&')[0].split(' feat.')[0].strip()
        query = f"{clean_artist} {clean_title}"
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=5"
        
        req = urllib.request.Request(url, headers={"User-Agent": "MattLab-Music/1.0"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                results = data.get("results", [])
                if results:
                    # Search result index 0 from top hits represents high global popularity (85-98)
                    # We map relevance match into a normalized 0-100 scale
                    for idx, item in enumerate(results):
                        item_artist = (item.get("artistName") or "").lower()
                        item_title = (item.get("trackName") or "").lower()
                        if clean_title.lower() in item_title or item_title in clean_title.lower():
                            # Matched: higher index = slightly lower popularity
                            score = max(50, 95 - (idx * 8))
                            return score
                    return 60
    except Exception as e:
        logger.debug(f"[Popularity] iTunes lookup failed for '{artist} - {title}': {e}")
    return None

def fetch_spotify_popularity(title: str, artist: str) -> Optional[int]:
    """Query Spotify scraper client for play_count and estimate 0-100 score."""
    try:
        from app.trending_search import get_spotify_client
        client = get_spotify_client()
        clean_title = normalize_title_for_search(title)
        clean_artist = artist.split(',')[0].split('&')[0].split(' feat.')[0].strip()
        res = client.search(f"{clean_artist} {clean_title}")
        if res and hasattr(res, "tracks") and res.tracks:
            top_track = res.tracks[0]
            play_count = getattr(top_track, "play_count", None)
            if play_count and isinstance(play_count, (int, float)) and play_count > 0:
                # Logarithmic scaling of Spotify worldwide playcount into 0-100:
                # 1M plays -> ~55, 10M plays -> ~70, 100M plays -> ~85, 1B plays -> ~98
                import math
                score = min(100, max(20, round(math.log10(max(1000, play_count)) * 10.5)))
                return score
            return 75
    except Exception as e:
        logger.debug(f"[Popularity] Spotify lookup failed for '{artist} - {title}': {e}")
    return None

def resolve_track_popularity(title: str, artist: str) -> int:
    """Resolve popularity score (0-100) using Spotify or iTunes fallback."""
    # 1. Try Spotify first
    score = fetch_spotify_popularity(title, artist)
    if score is not None:
        return score
    
    # 2. Try iTunes
    score = fetch_itunes_popularity(title, artist)
    if score is not None:
        return score

    # 3. Default base score
    return 45

def backfill_library_popularity_background():
    """Background worker that populates popularity points for tracks that lack them."""
    global _is_backfilling
    if not _backfill_lock.acquire(blocking=False):
        return  # already running

    _is_backfilling = True
    def _worker():
        global _is_backfilling
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT t.id, t.title, ar.name AS artist_name
                    FROM tracks t
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE t.popularity IS NULL OR t.popularity = 0
                    ORDER BY t.id ASC
                    LIMIT 100
                """)
                rows = cursor.fetchall()

            for row in rows:
                tid = row["id"]
                title = row["title"]
                artist = row["artist_name"]
                pop = resolve_track_popularity(title, artist)
                with get_db() as conn:
                    conn.execute("UPDATE tracks SET popularity = ? WHERE id = ?", (pop, tid))
                time.sleep(0.1)  # small throttle
        except Exception as e:
            logger.warning(f"[Popularity] Backfill worker encountered error: {e}")
        finally:
            _is_backfilling = False
            _backfill_lock.release()

    thread = threading.Thread(target=_worker, daemon=True, name="PopularityBackfillWorker")
    thread.start()
