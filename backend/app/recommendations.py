import os
import re
import json
import urllib.request
import urllib.parse
from typing import List, Dict, Any, Optional, Set
from pathlib import Path

from app.database import get_db

def get_track_genre_cached(cursor, track_id: int) -> Optional[str]:
    """Retrieve genre from track_genres table."""
    cursor.execute("SELECT genre FROM track_genres WHERE track_id = ?", (track_id,))
    row = cursor.fetchone()
    return row["genre"] if row and row["genre"] else None

def extract_and_store_track_genre(cursor, track_id: int, file_path: str, title: str, artist_name: str) -> Optional[str]:
    """Extract genre from file metadata tags or fast iTunes lookup, then cache it."""
    genre = None

    # 1. Read local file tags with Mutagen
    if file_path and os.path.exists(file_path):
        try:
            if file_path.lower().endswith(".flac"):
                from mutagen.flac import FLAC
                audio = FLAC(file_path)
                g_list = audio.get("genre", [])
                if g_list:
                    genre = g_list[0].strip()
            elif file_path.lower().endswith(".mp3"):
                from mutagen.id3 import ID3
                tags = ID3(file_path)
                tcon = tags.get("TCON")
                if tcon and tcon.text:
                    genre = str(tcon.text[0]).strip()
        except Exception:
            pass

    # 2. Fast iTunes Search API fallback (instant anonymous lookup)
    if not genre and title and artist_name:
        try:
            query = urllib.parse.quote(f"{artist_name} {title}")
            url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=3.5) as res:
                data = json.loads(res.read().decode("utf-8", errors="ignore"))
                if data.get("resultCount", 0) > 0:
                    genre = data["results"][0].get("primaryGenreName")
        except Exception:
            pass

    if genre:
        cursor.execute("""
            INSERT OR REPLACE INTO track_genres (track_id, genre, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        """, (track_id, genre))

    return genre

def fetch_spotify_radio_tracks(cursor, track_id: int, title: str, artist_name: str) -> List[Dict[str, str]]:
    """
    Query Spotify's actual live algorithmic radio for this specific track.
    Returns ordered list of dicts: [{"title": "...", "artist": "..."}, ...]
    Cached in `spotify_radio_cache` to ensure instantaneous subsequent lookups (< 5ms).
    """
    # 1. Check SQLite cache
    cursor.execute("""
        SELECT recommended_tracks_json, updated_at
        FROM spotify_radio_cache
        WHERE track_id = ?
    """, (track_id,))
    cached = cursor.fetchone()
    if cached and cached["recommended_tracks_json"]:
        try:
            items = json.loads(cached["recommended_tracks_json"])
            if isinstance(items, list) and items:
                return items
        except Exception:
            pass

    # 2. Live query: Search Spotify for the algorithmic "[Song] Radio" playlist
    radio_tracks: List[Dict[str, str]] = []
    clean_title = re.sub(r'[\(\[].*?[\)\]]', '', title).strip()
    search_query = f"{clean_title} Radio"

    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        search_res = client.search(search_query, limit=4)
        if hasattr(search_res, "playlists") and search_res.playlists:
            # Look for exact or best matching Radio playlist
            target_pl = None
            for p in search_res.playlists:
                p_name_low = (p.name or "").lower()
                if "radio" in p_name_low:
                    target_pl = p
                    break
            if not target_pl:
                target_pl = search_res.playlists[0]

            if target_pl and hasattr(target_pl, "url") and target_pl.url:
                radio_pl = client.get_playlist(target_pl.url, max_tracks=30)
                if radio_pl and radio_pl.tracks:
                    for t in radio_pl.tracks:
                        inner = getattr(t, "track", None) or t
                        t_name = getattr(inner, "name", "")
                        artists = ", ".join(a.name for a in getattr(inner, "artists", []))
                        if t_name:
                            radio_tracks.append({
                                "title": t_name,
                                "artist": artists
                            })

                    # Cache in DB
                    if radio_tracks:
                        cursor.execute("""
                            INSERT OR REPLACE INTO spotify_radio_cache
                            (track_id, radio_name, spotify_playlist_id, recommended_tracks_json, updated_at)
                            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                        """, (track_id, target_pl.name, getattr(target_pl, "id", None), json.dumps(radio_tracks)))
    except Exception as e:
        print(f"[SPOTIFY RADIO] Notice: could not fetch live radio for '{title}': {e}", flush=True)

    return radio_tracks

def find_best_local_match(cursor, title: str, artist: str) -> Optional[Dict[str, Any]]:
    """Match a Spotify track title and artist against local library."""
    # 1. Exact match
    cursor.execute("""
        SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
               a.name as artist_name, al.title as album_title
        FROM tracks t
        JOIN artists a ON t.artist_id = a.id
        LEFT JOIN albums al ON t.album_id = al.id
        WHERE LOWER(t.title) = LOWER(?) AND LOWER(a.name) = LOWER(?)
        LIMIT 1
    """, (title.strip(), artist.strip()))
    r = cursor.fetchone()
    if r:
        return dict(r)

    # 2. Relaxed match
    clean_t = re.sub(r'[\(\[].*?[\)\]]', '', title).strip().lower()
    first_artist = artist.split(",")[0].split("&")[0].strip().lower()
    if clean_t and first_artist:
        cursor.execute("""
            SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                   a.name as artist_name, al.title as album_title
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE LOWER(t.title) LIKE LOWER(?) AND LOWER(a.name) LIKE LOWER(?)
            LIMIT 1
        """, (f"%{clean_t}%", f"%{first_artist}%"))
        r = cursor.fetchone()
        if r:
            return dict(r)

    # 3. Title-only match if distinctive (> 5 chars)
    if len(clean_t) >= 6:
        cursor.execute("""
            SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                   a.name as artist_name, al.title as album_title
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE LOWER(t.title) = LOWER(?)
            LIMIT 1
        """, (clean_t,))
        r = cursor.fetchone()
        if r:
            return dict(r)

    return None

def get_recommended_tracks(
    track_id: int,
    limit: int = 20,
    exclude_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Spotify-Powered Autoplay & Recommendation Algorithm:
    1. Primary: Spotify's live algorithmic "[Song] Radio" sequence matched against local library.
    2. Secondary: Co-occurrence in local playlists & Spotify charts.
    3. Tertiary: Genre, artist affinity, and era proximity fallback.
    """
    excluded_set: Set[int] = set(exclude_ids or [])
    excluded_set.add(track_id)

    with get_db() as conn:
        cursor = conn.cursor()

        # Get base track details
        cursor.execute("""
            SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds, t.file_path,
                   a.name as artist_name, al.title as album_title, al.year as album_year
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE t.id = ?
        """, (track_id,))
        base_track = cursor.fetchone()
        if not base_track:
            return {"genre": None, "tracks": []}

        base_dict = dict(base_track)
        title = base_dict["title"]
        artist_name = base_dict["artist_name"]
        artist_id = base_dict["artist_id"]
        album_year = base_dict.get("album_year")

        candidates: Dict[int, Dict[str, Any]] = {}

        def add_candidate(row, score: float, reason: str):
            tid = row["id"]
            if tid in excluded_set:
                return
            if tid not in candidates:
                candidates[tid] = {
                    "id": row["id"],
                    "title": row["title"],
                    "artist_id": row["artist_id"],
                    "artist_name": row["artist_name"],
                    "album_id": row["album_id"] if "album_id" in row.keys() else None,
                    "album_title": row["album_title"] if "album_title" in row.keys() else None,
                    "duration_seconds": row["duration_seconds"] if "duration_seconds" in row.keys() else 0,
                    "score": 0.0,
                    "reasons": set(),
                }
            candidates[tid]["score"] += score
            candidates[tid]["reasons"].add(reason)

        # -------------------------------------------------------------
        # Tier 0 (TOP PRIORITY): Spotify Official Song Radio Algorithm!
        # Query Spotify's exact neural network radio order for this song
        # -------------------------------------------------------------
        spotify_radio = fetch_spotify_radio_tracks(cursor, track_id, title, artist_name)
        radio_matched_count = 0
        if spotify_radio:
            for idx, r_track in enumerate(spotify_radio):
                match = find_best_local_match(cursor, r_track["title"], r_track["artist"])
                if match:
                    # Give high score proportional to position in Spotify's radio
                    pos_score = max(50.0, 100.0 - (idx * 2.5))
                    add_candidate(match, pos_score, "Spotify Radio")
                    radio_matched_count += 1

        # Get or resolve genre for fallback / pill display
        genre = get_track_genre_cached(cursor, track_id)
        if not genre:
            genre = extract_and_store_track_genre(
                cursor,
                track_id,
                base_dict.get("file_path", ""),
                title,
                artist_name
            )

        # -------------------------------------------------------------
        # Tier 1: Local Playlist & Chart Co-occurrence
        # -------------------------------------------------------------
        cursor.execute("""
            SELECT DISTINCT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                            a.name as artist_name, al.title as album_title
            FROM playlist_tracks pt1
            JOIN playlist_tracks pt2 ON pt1.playlist_id = pt2.playlist_id
            JOIN tracks t ON pt2.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE pt1.track_id = ? AND pt2.track_id != ?
            LIMIT 30
        """, (track_id, track_id))
        for r in cursor.fetchall():
            add_candidate(r, 45.0, "Playlist Affinity")

        cursor.execute("""
            SELECT DISTINCT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                            a.name as artist_name, al.title as album_title
            FROM spotify_sync_tracks st1
            JOIN spotify_sync_tracks st2 ON st1.playlist_id = st2.playlist_id
            JOIN tracks t ON st2.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE st1.track_id = ? AND st2.track_id IS NOT NULL AND st2.track_id != ?
            LIMIT 30
        """, (track_id, track_id))
        for r in cursor.fetchall():
            add_candidate(r, 40.0, "Chart Co-occurrence")

        # -------------------------------------------------------------
        # Tier 2: Same Genre Matches
        # -------------------------------------------------------------
        if genre and len(candidates) < limit + 5:
            cursor.execute("""
                SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                       a.name as artist_name, al.title as album_title
                FROM track_genres tg
                JOIN tracks t ON tg.track_id = t.id
                JOIN artists a ON t.artist_id = a.id
                LEFT JOIN albums al ON t.album_id = al.id
                WHERE tg.genre = ? AND t.id != ?
                ORDER BY t.popularity DESC, RANDOM()
                LIMIT 25
            """, (genre, track_id))
            for r in cursor.fetchall():
                add_candidate(r, 30.0, f"Genre: {genre}")

        # -------------------------------------------------------------
        # Tier 3: Same Artist Fallback
        # -------------------------------------------------------------
        if len(candidates) < limit + 3:
            cursor.execute("""
                SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                       a.name as artist_name, al.title as album_title
                FROM tracks t
                JOIN artists a ON t.artist_id = a.id
                LEFT JOIN albums al ON t.album_id = al.id
                WHERE t.artist_id = ? AND t.id != ?
                ORDER BY t.popularity DESC, RANDOM()
                LIMIT 15
            """, (artist_id, track_id))
            for r in cursor.fetchall():
                add_candidate(r, 20.0, "Same Artist")

        # -------------------------------------------------------------
        # Tier 4: Popularity Fallback
        # -------------------------------------------------------------
        if len(candidates) < limit:
            cursor.execute("""
                SELECT t.id, t.title, t.artist_id, t.album_id, t.duration_seconds,
                       a.name as artist_name, al.title as album_title
                FROM tracks t
                JOIN artists a ON t.artist_id = a.id
                LEFT JOIN albums al ON t.album_id = al.id
                WHERE t.id != ?
                ORDER BY t.popularity DESC, RANDOM()
                LIMIT 20
            """, (track_id,))
            for r in cursor.fetchall():
                add_candidate(r, 5.0, "Popular Track")

        # Sort candidates by score descending
        sorted_candidates = sorted(
            candidates.values(),
            key=lambda x: x["score"],
            reverse=True
        )[:limit]

        # Format final tracks
        formatted_tracks = []
        for c in sorted_candidates:
            album_id = c.get("album_id")
            # Determine friendliest display reason
            reason = "Spotify Radio" if "Spotify Radio" in c["reasons"] else next(iter(c["reasons"]), "Recommended")
            formatted_tracks.append({
                "id": c["id"],
                "title": c["title"],
                "artist_id": c["artist_id"],
                "artist_name": c["artist_name"],
                "album_id": album_id,
                "album_title": c["album_title"],
                "duration_seconds": c["duration_seconds"],
                "cover_url": f"/api/covers/{album_id}" if album_id else "/api/covers/0",
                "recommendation_reason": reason,
                "is_recommended": True,
            })

        return {
            "seed_track_id": track_id,
            "seed_genre": genre or "Spotify Radio",
            "tracks": formatted_tracks,
            "spotify_radio_matched": radio_matched_count,
        }
