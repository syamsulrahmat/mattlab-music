import time
import logging
from typing import Dict, Any, List, Optional
from spotify_scraper import SpotifyClient

logger = logging.getLogger("trending_search")

# In-memory thread-safe cache with 5-minute TTL
_trending_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 300  # 5 minutes

_spotify_client_instance: Optional[SpotifyClient] = None


def get_spotify_client() -> SpotifyClient:
    """Return or initialize singleton SpotifyClient."""
    global _spotify_client_instance
    if _spotify_client_instance is None:
        _spotify_client_instance = SpotifyClient()
    return _spotify_client_instance


def fetch_trending_search_sync(query: str, limit: int = 8) -> Dict[str, Any]:
    """
    Fetch trending and autocomplete suggestions from Spotify for a query.
    Cached in RAM for 5 minutes to avoid redundant network overhead.
    """
    cleaned = query.strip().lower()
    now = time.time()

    # 1. Check in-memory cache
    if cleaned in _trending_cache:
        entry = _trending_cache[cleaned]
        if now - entry["timestamp"] < _CACHE_TTL:
            return entry["data"]

    # 2. Query Spotify
    try:
        client = get_spotify_client()
        res = client.search(query)
        if not res:
            return {"tracks": [], "artists": []}

        tracks: List[Dict[str, Any]] = []
        for t in (getattr(res, "tracks", []) or [])[:limit]:
            t_name = (getattr(t, "name", "") or "").strip()
            artists_list = getattr(t, "artists", []) or []
            artist_name = ", ".join([a.name for a in artists_list if getattr(a, "name", None)]).strip()
            album_obj = getattr(t, "album", None)
            album_name = (getattr(album_obj, "name", "") or "").strip() if album_obj else ""

            cover_url = None
            if getattr(t, "images", None) and len(t.images) > 0:
                cover_url = t.images[0].url
            elif album_obj and getattr(album_obj, "images", None) and len(album_obj.images) > 0:
                cover_url = album_obj.images[0].url

            dur_sec = round((getattr(t, "duration_ms", 0) or 0) / 1000.0)

            tracks.append({
                "spotify_id": getattr(t, "id", None),
                "title": t_name,
                "artist_name": artist_name or "Unknown Artist",
                "album_title": album_name,
                "cover_url": cover_url,
                "duration_seconds": dur_sec,
                "popularity": getattr(t, "play_count", None),
            })

        artists: List[Dict[str, Any]] = []
        for a in (getattr(res, "artists", []) or [])[:4]:
            a_name = (getattr(a, "name", "") or "").strip()
            artists.append({
                "spotify_id": getattr(a, "id", None),
                "name": a_name,
            })

        result_data = {
            "tracks": tracks,
            "artists": artists,
        }

        # Cache result
        _trending_cache[cleaned] = {
            "timestamp": now,
            "data": result_data,
        }
        return result_data
    except Exception as e:
        logger.warning(f"[TrendingSearch] Spotify search failed for '{query}': {e}")
        return {"tracks": [], "artists": []}
