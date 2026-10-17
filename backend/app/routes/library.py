import re
import logging
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db

logger = logging.getLogger("library_routes")

router = APIRouter(tags=["Library & Catalog"])

@router.get("/stats")
async def get_library_stats():
    """Retrieve high-level catalog statistics."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS c FROM artists")
        artists_count = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) AS c FROM albums")
        albums_count = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) AS c, COALESCE(SUM(duration_seconds), 0) AS total_duration FROM tracks")
        track_row = cursor.fetchone()
        tracks_count = track_row["c"]
        total_duration = track_row["total_duration"]

    return {
        "artists": artists_count,
        "albums": albums_count,
        "tracks": tracks_count,
        "total_duration_seconds": total_duration,
        "total_duration_hours": round(total_duration / 3600, 1),
    }

@router.get("/artists")
async def list_artists(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = None
):
    """List artists with album and track counts."""
    with get_db() as conn:
        cursor = conn.cursor()
        if q:
            cursor.execute("""
                SELECT 
                    ar.id, ar.name,
                    COUNT(DISTINCT al.id) AS album_count,
                    COUNT(DISTINCT t.id) AS track_count
                FROM artists ar
                LEFT JOIN albums al ON al.artist_id = ar.id
                LEFT JOIN tracks t ON t.artist_id = ar.id
                WHERE ar.name LIKE ?
                GROUP BY ar.id
                ORDER BY ar.name COLLATE NOCASE ASC
                LIMIT ? OFFSET ?
            """, (f"%{q}%", limit, offset))
        else:
            cursor.execute("""
                SELECT 
                    ar.id, ar.name,
                    COUNT(DISTINCT al.id) AS album_count,
                    COUNT(DISTINCT t.id) AS track_count
                FROM artists ar
                LEFT JOIN albums al ON al.artist_id = ar.id
                LEFT JOIN tracks t ON t.artist_id = ar.id
                GROUP BY ar.id
                ORDER BY ar.name COLLATE NOCASE ASC
                LIMIT ? OFFSET ?
            """, (limit, offset))

        artists = [
            {
                **dict(row),
                "image_url": f"/api/artists/{row['id']}/image",
            }
            for row in cursor.fetchall()
        ]

    return {"items": artists, "limit": limit, "offset": offset}

ARTISTS_DIR = Path("/data/artists")
ARTISTS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_ARTIST_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#242424"/>
  <circle cx="150" cy="120" r="50" fill="#3e3e3e"/>
  <path d="M70 260 C70 200, 110 180, 150 180 C190 180, 230 200, 230 260 Z" fill="#3e3e3e"/>
</svg>"""

@router.get("/artists/{artist_id}/image")
async def get_artist_image(artist_id: int):
    """Serve cached artist avatar or fetch from Deezer public API."""
    import urllib.request
    import urllib.parse
    import json
    from fastapi.responses import FileResponse, Response

    cache_file = ARTISTS_DIR / f"{artist_id}.jpg"
    if cache_file.exists():
        return FileResponse(str(cache_file), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM artists WHERE id = ?", (artist_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Artist not found")
        artist_name = row["name"]

        cursor.execute("SELECT cover_path FROM albums WHERE artist_id = ? AND cover_path IS NOT NULL LIMIT 1", (artist_id,))
        album_cover = cursor.fetchone()

    # Try Deezer public API for high-res artist photo
    try:
        clean_name = artist_name.split("/")[0].split(",")[0].strip()
        url = f"https://api.deezer.com/search/artist?q={urllib.parse.quote(clean_name)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("data") and len(data["data"]) > 0:
                pic_url = data["data"][0].get("picture_big") or data["data"][0].get("picture_medium")
                if pic_url:
                    img_req = urllib.request.Request(pic_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(img_req, timeout=4) as img_resp:
                        cache_file.write_bytes(img_resp.read())
                        return FileResponse(str(cache_file), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        pass

    # Fallback to local album cover if available
    if album_cover and album_cover["cover_path"] and Path(album_cover["cover_path"]).exists():
        return FileResponse(album_cover["cover_path"], media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

    return Response(content=DEFAULT_ARTIST_SVG, media_type="image/svg+xml")

@router.get("/artists/{artist_id}")
async def get_artist_detail(artist_id: int):
    """Get single artist with their albums and tracks."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM artists WHERE id = ?", (artist_id,))
        artist = cursor.fetchone()
        if not artist:
            raise HTTPException(status_code=404, detail="Artist not found")

        cursor.execute("""
            SELECT id, title, year, cover_path
            FROM albums
            WHERE artist_id = ?
            ORDER BY year DESC, title ASC
        """, (artist_id,))
        albums = [
            {
                "id": row["id"],
                "title": row["title"],
                "year": row["year"],
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.album_id,
                a.title AS album_title
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            WHERE t.artist_id = ?
            ORDER BY t.title ASC
        """, (artist_id,))
        tracks = [
            {
                **dict(row),
                "artist_id": artist_id,
                "artist_name": artist["name"],
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {
        "id": artist["id"],
        "name": artist["name"],
        "image_url": f"/api/artists/{artist_id}/image",
        "albums": albums,
        "tracks": tracks,
    }

@router.get("/home")
async def get_home_shelves():
    """Retrieve structured data for the Spotify Island home page."""
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Recently Added Albums (deduplicated by title)
        cursor.execute("""
            SELECT 
                MIN(a.id) AS id, a.title, MAX(a.year) AS year,
                MIN(ar.name) AS artist_name,
                COUNT(t.id) AS track_count
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = a.id
            GROUP BY LOWER(a.title)
            ORDER BY MAX(a.id) DESC
            LIMIT 8
        """)
        recently_added = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

        # 2. Popular Artists
        cursor.execute("""
            SELECT 
                ar.id, ar.name,
                COUNT(DISTINCT al.id) AS album_count,
                COUNT(DISTINCT t.id) AS track_count
            FROM artists ar
            LEFT JOIN albums al ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.artist_id = ar.id
            GROUP BY ar.id
            ORDER BY track_count DESC
            LIMIT 8
        """)
        popular_artists = [
            {
                **dict(row),
                "image_url": f"/api/artists/{row['id']}/image",
            }
            for row in cursor.fetchall()
        ]

        # 3. Your Albums (featured shelf)
        cursor.execute("""
            SELECT 
                MIN(a.id) AS id, a.title, MAX(a.year) AS year,
                MIN(ar.name) AS artist_name,
                COUNT(t.id) AS track_count
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = a.id
            GROUP BY LOWER(a.title)
            ORDER BY a.title COLLATE NOCASE ASC
            LIMIT 18
        """)
        featured_albums = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {
        "recently_added": recently_added,
        "popular_artists": popular_artists,
        "featured_albums": featured_albums,
    }

@router.get("/albums")
async def list_albums(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = None
):
    """List deduplicated albums with artist name and cover art URL."""
    with get_db() as conn:
        cursor = conn.cursor()
        if q:
            cursor.execute("""
                SELECT 
                    MIN(a.id) AS id, a.title, MAX(a.year) AS year, MIN(a.artist_id) AS artist_id,
                    MIN(ar.name) AS artist_name,
                    COUNT(t.id) AS track_count,
                    COALESCE(SUM(t.duration_seconds), 0) AS duration_seconds
                FROM albums a
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN tracks t ON t.album_id = a.id
                WHERE a.title LIKE ? OR ar.name LIKE ?
                GROUP BY LOWER(a.title)
                ORDER BY a.title COLLATE NOCASE ASC
                LIMIT ? OFFSET ?
            """, (f"%{q}%", f"%{q}%", limit, offset))
        else:
            cursor.execute("""
                SELECT 
                    MIN(a.id) AS id, a.title, MAX(a.year) AS year, MIN(a.artist_id) AS artist_id,
                    MIN(ar.name) AS artist_name,
                    COUNT(t.id) AS track_count,
                    COALESCE(SUM(t.duration_seconds), 0) AS duration_seconds
                FROM albums a
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN tracks t ON t.album_id = a.id
                GROUP BY LOWER(a.title)
                ORDER BY a.title COLLATE NOCASE ASC
                LIMIT ? OFFSET ?
            """, (limit, offset))

        albums = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {"items": albums, "limit": limit, "offset": offset}

@router.get("/albums/{album_id}")
async def get_album_detail(album_id: int):
    """Get single album with ordered tracks, consolidating duplicates by album title."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                a.id, a.title, a.year, a.artist_id,
                ar.name AS artist_name
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            WHERE a.id = ?
        """, (album_id,))
        album = cursor.fetchone()
        if not album:
            raise HTTPException(status_code=404, detail="Album not found")

        # Find all album IDs matching this album title (for deduplicated albums)
        cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?)", (album["title"],))
        matching_album_ids = [row["id"] for row in cursor.fetchall()]
        placeholders = ",".join("?" * len(matching_album_ids))

        cursor.execute(f"""
            SELECT 
                t.id, t.title, t.track_number, t.disc_number, t.duration_seconds,
                t.file_format, t.bitrate,
                ar.name AS artist_name
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.album_id IN ({placeholders})
            ORDER BY t.disc_number ASC, t.track_number ASC, t.title ASC
        """, matching_album_ids)

        tracks = [
            {
                **dict(row),
                "album_id": album_id,
                "album_title": album["title"],
                "cover_url": f"/api/covers/{album_id}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {
        "id": album["id"],
        "title": album["title"],
        "year": album["year"],
        "artist_id": album["artist_id"],
        "artist_name": album["artist_name"],
        "cover_url": f"/api/covers/{album_id}",
        "tracks": tracks,
    }

@router.get("/tracks")
async def list_tracks(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort: str = Query("title", regex="^(title|artist|duration)$")
):
    """List tracks with pagination."""
    order_col = "t.title COLLATE NOCASE ASC"
    if sort == "artist":
        order_col = "ar.name COLLATE NOCASE ASC, t.title ASC"
    elif sort == "duration":
        order_col = "t.duration_seconds DESC"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.file_format,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            ORDER BY {order_col}
            LIMIT ? OFFSET ?
        """, (limit, offset))

        tracks = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {"items": tracks, "limit": limit, "offset": offset}

def sanitize_fts5_query(user_query: str) -> str:
    """Sanitize arbitrary user input into a safe, syntax-valid SQLite FTS5 query."""
    cleaned = re.sub(r"[^\w\s]", " ", user_query).strip()
    words = [w for w in cleaned.split() if w]
    if not words:
        return ""
    if len(words) == 1:
        return f'"{words[0]}"*'
    phrase = '"' + " ".join(words) + '"'
    tokens = " AND ".join([f'"{w}"*' if i == len(words) - 1 else f'"{w}"' for i, w in enumerate(words)])
    return f"{phrase} OR ({tokens})"


@router.get("/search")
async def search_library(q: str = Query(..., min_length=1), limit: int = Query(25, ge=1, le=100)):
    """Search across tracks, lyrics, artists, and albums simultaneously with FTS5 and smart typo resolution."""
    from app.routes.request_music import resolve_smart_canonical_query

    cleaned_q = q.strip()
    tokens = [t.strip() for t in cleaned_q.split() if t.strip()]
    if not tokens:
        return {"query": q, "tracks": [], "lyrics_matches": [], "albums": [], "artists": []}

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Search tracks matching all tokens across title, artist name, and album title
        track_where_clauses = ["(t.title LIKE ? OR ar.name LIKE ? OR a.title LIKE ?)" for _ in tokens]
        track_params = []
        for tok in tokens:
            track_params.extend([f"%{tok}%", f"%{tok}%", f"%{tok}%"])

        cursor.execute(f"""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE {' AND '.join(track_where_clauses)}
            ORDER BY t.title COLLATE NOCASE ASC
            LIMIT {limit}
        """, tuple(track_params))
        tracks = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
                "matched_in": "metadata",
            }
            for row in cursor.fetchall()
        ]

        # 2. Search SQLite FTS5 for matches across indexed song lyrics
        lyrics_matches = []
        fts_q = sanitize_fts5_query(cleaned_q)
        if fts_q:
            try:
                cursor.execute("""
                    SELECT 
                        t.id, t.title, t.track_number, t.duration_seconds,
                        a.id AS album_id, a.title AS album_title,
                        ar.id AS artist_id, ar.name AS artist_name,
                        snippet(tracks_lyrics_fts, 4, '<mark class="bg-brand-500/25 text-brand-300 font-semibold px-0.5 rounded">', '</mark>', '...', 10) AS lyric_snippet,
                        bm25(tracks_lyrics_fts) AS rank
                    FROM tracks_lyrics_fts fts
                    JOIN tracks t ON fts.track_id = t.id
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE tracks_lyrics_fts MATCH ?
                    ORDER BY rank ASC
                    LIMIT 20
                """, (fts_q,))
                for row in cursor.fetchall():
                    item = {
                        **dict(row),
                        "cover_url": f"/api/covers/{row['album_id']}",
                        "stream_url": f"/api/stream/{row['id']}",
                        "matched_in": "lyrics",
                    }
                    lyrics_matches.append(item)
            except Exception as e:
                logger.warning(f"[Search] FTS5 lyrics search error: {e}")

        # Smart merge of metadata matches and lyrics matches
        tracks_by_id = {t["id"]: t for t in tracks}
        for lm in lyrics_matches:
            if lm["id"] in tracks_by_id:
                # Track matched both title/artist and lyrics
                tracks_by_id[lm["id"]]["lyric_snippet"] = lm["lyric_snippet"]
                tracks_by_id[lm["id"]]["matched_in"] = "title_and_lyrics"
            else:
                # Track matched specifically by lyrics - append to general tracks list as well
                tracks.append(lm)

        # 3. Search albums matching tokens
        album_where_clauses = ["(a.title LIKE ? OR ar.name LIKE ?)" for _ in tokens]
        album_params = []
        for tok in tokens:
            album_params.extend([f"%{tok}%", f"%{tok}%"])

        cursor.execute(f"""
            SELECT 
                a.id, a.title, a.year, a.artist_id,
                ar.name AS artist_name,
                COUNT(t.id) AS track_count
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = a.id
            WHERE {' AND '.join(album_where_clauses)}
            GROUP BY a.id
            ORDER BY a.title COLLATE NOCASE ASC
            LIMIT 15
        """, tuple(album_params))
        albums = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

        # 4. Search artists matching query
        cursor.execute("""
            SELECT 
                ar.id, ar.name,
                COUNT(DISTINCT al.id) AS album_count,
                COUNT(DISTINCT t.id) AS track_count
            FROM artists ar
            LEFT JOIN albums al ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.artist_id = ar.id
            WHERE ar.name LIKE ?
            GROUP BY ar.id
            ORDER BY ar.name COLLATE NOCASE ASC
            LIMIT 10
        """, (f"%{cleaned_q}%",))
        artists = [
            {
                **dict(row),
                "image_url": f"/api/artists/{row['id']}/image",
            }
            for row in cursor.fetchall()
        ]

        primary_artist = None
        match_type = "general"
        corrected_query = None
        did_you_mean = None

        # Check if an exact artist match was found
        exact_artist = next((a for a in artists if a["name"].strip().lower() == cleaned_q.lower()), None)
        if not exact_artist and len(artists) == 1 and len(cleaned_q) >= 4 and artists[0]["name"].lower().startswith(cleaned_q.lower()):
            exact_artist = artists[0]

        if exact_artist:
            primary_artist = exact_artist
            match_type = "artist"
        elif len(artists) == 0:
            from app.fuzzy_search import ensure_catalog_loaded, find_matched_artist, find_matched_track
            ensure_catalog_loaded(conn)
            art_match = find_matched_artist(cleaned_q, threshold=0.80)
            if art_match:
                a_dict, score = art_match
                trk_match = find_matched_track(cleaned_q, threshold=0.80)
                if not trk_match or score >= trk_match[1]:
                    cursor.execute("""
                        SELECT ar.id, ar.name, COUNT(DISTINCT al.id) AS album_count, COUNT(DISTINCT t.id) AS track_count
                        FROM artists ar
                        LEFT JOIN albums al ON al.artist_id = ar.id
                        LEFT JOIN tracks t ON t.artist_id = ar.id
                        WHERE ar.id = ?
                        GROUP BY ar.id
                    """, (a_dict["id"],))
                    art_row = cursor.fetchone()
                    if art_row:
                        primary_artist = {**dict(art_row), "image_url": f"/api/artists/{art_row['id']}/image"}
                        artists = [primary_artist]
                        match_type = "artist"
                        corrected_query = a_dict["name"]

                        cursor.execute("""
                            SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                            FROM tracks t
                            JOIN albums a ON t.album_id = a.id
                            JOIN artists ar ON t.artist_id = ar.id
                            WHERE ar.id = ?
                            ORDER BY t.title COLLATE NOCASE ASC
                            LIMIT 30
                        """, (a_dict["id"],))
                        tracks = [
                            {
                                **dict(r),
                                "cover_url": f"/api/covers/{r['album_id']}",
                                "stream_url": f"/api/stream/{r['id']}",
                                "matched_in": "artist_catalog",
                            }
                            for r in cursor.fetchall()
                        ]

                        cursor.execute("""
                            SELECT a.id, a.title, a.year, a.artist_id, ar.name AS artist_name, COUNT(t.id) AS track_count
                            FROM albums a
                            JOIN artists ar ON a.artist_id = ar.id
                            LEFT JOIN tracks t ON t.album_id = a.id
                            WHERE a.artist_id = ?
                            GROUP BY a.id
                            ORDER BY a.year DESC, a.title ASC
                            LIMIT 15
                        """, (a_dict["id"],))
                        albums = [{**dict(r), "cover_url": f"/api/covers/{r['id']}"} for r in cursor.fetchall()]

        # 5. Intelligent local fuzzy matching & general word spell correction fallback
        if not primary_artist and len(tracks) == 0 and len(lyrics_matches) == 0 and len(artists) == 0 and len(albums) == 0:
            from app.fuzzy_search import ensure_catalog_loaded, resolve_fuzzy_query
            ensure_catalog_loaded(conn)

            fuzzy_res = resolve_fuzzy_query(cleaned_q)
            res_type = fuzzy_res.get("type")

            # A. Compound Artist + Track (e.g. 'katy pery firwork')
            if res_type == "compound":
                compound = fuzzy_res["compound"]
                c_art = compound["artist"]
                c_trk = compound["track"]
                corrected_query = f"{compound['canonical_artist']} - {compound['canonical_track']}"
                match_type = "compound"

                cursor.execute("""
                    SELECT ar.id, ar.name, COUNT(DISTINCT al.id) AS album_count, COUNT(DISTINCT t.id) AS track_count
                    FROM artists ar
                    LEFT JOIN albums al ON al.artist_id = ar.id
                    LEFT JOIN tracks t ON t.artist_id = ar.id
                    WHERE ar.id = ?
                    GROUP BY ar.id
                """, (c_art["id"],))
                art_row = cursor.fetchone()
                if art_row:
                    primary_artist = {**dict(art_row), "image_url": f"/api/artists/{art_row['id']}/image"}
                    artists = [primary_artist]

                # Specific matched track first
                cursor.execute("""
                    SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                    FROM tracks t
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE t.id = ?
                """, (c_trk["id"],))
                target_row = cursor.fetchone()
                if target_row:
                    tracks.append({
                        **dict(target_row),
                        "cover_url": f"/api/covers/{target_row['album_id']}",
                        "stream_url": f"/api/stream/{target_row['id']}",
                        "matched_in": "fuzzy_compound",
                    })

                # Additional tracks by this artist
                cursor.execute("""
                    SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                    FROM tracks t
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE ar.id = ? AND t.id != ?
                    ORDER BY t.title COLLATE NOCASE ASC
                    LIMIT 20
                """, (c_art["id"], c_trk["id"]))
                for row in cursor.fetchall():
                    tracks.append({
                        **dict(row),
                        "cover_url": f"/api/covers/{row['album_id']}",
                        "stream_url": f"/api/stream/{row['id']}",
                        "matched_in": "artist_catalog",
                    })

                # Artist albums
                cursor.execute("""
                    SELECT a.id, a.title, a.year, a.artist_id, ar.name AS artist_name, COUNT(t.id) AS track_count
                    FROM albums a
                    JOIN artists ar ON a.artist_id = ar.id
                    LEFT JOIN tracks t ON t.album_id = a.id
                    WHERE a.artist_id = ?
                    GROUP BY a.id
                    ORDER BY a.year DESC, a.title ASC
                    LIMIT 15
                """, (c_art["id"],))
                albums = [{**dict(r), "cover_url": f"/api/covers/{r['id']}"} for r in cursor.fetchall()]

            # B. Artist match (e.g. 'Tylor switf' -> 'Taylor Swift')
            elif res_type == "artist":
                a_dict = fuzzy_res["artist"]
                corrected_query = a_dict["name"]
                match_type = "artist"

                cursor.execute("""
                    SELECT ar.id, ar.name, COUNT(DISTINCT al.id) AS album_count, COUNT(DISTINCT t.id) AS track_count
                    FROM artists ar
                    LEFT JOIN albums al ON al.artist_id = ar.id
                    LEFT JOIN tracks t ON t.artist_id = ar.id
                    WHERE ar.id = ?
                    GROUP BY ar.id
                """, (a_dict["id"],))
                art_row = cursor.fetchone()
                if art_row:
                    primary_artist = {**dict(art_row), "image_url": f"/api/artists/{art_row['id']}/image"}
                    artists = [primary_artist]

                # Fetch artist's library songs
                cursor.execute("""
                    SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                    FROM tracks t
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE ar.id = ?
                    ORDER BY t.title COLLATE NOCASE ASC
                    LIMIT 30
                """, (a_dict["id"],))
                tracks = [
                    {
                        **dict(r),
                        "cover_url": f"/api/covers/{r['album_id']}",
                        "stream_url": f"/api/stream/{r['id']}",
                        "matched_in": "artist_catalog",
                    }
                    for r in cursor.fetchall()
                ]

                # Fetch artist's library albums
                cursor.execute("""
                    SELECT a.id, a.title, a.year, a.artist_id, ar.name AS artist_name, COUNT(t.id) AS track_count
                    FROM albums a
                    JOIN artists ar ON a.artist_id = ar.id
                    LEFT JOIN tracks t ON t.album_id = a.id
                    WHERE a.artist_id = ?
                    GROUP BY a.id
                    ORDER BY a.year DESC, a.title ASC
                    LIMIT 15
                """, (a_dict["id"],))
                albums = [{**dict(r), "cover_url": f"/api/covers/{r['id']}"} for r in cursor.fetchall()]

            # C. Track match (e.g. 'blanck space' -> 'Blank Space', 'love stroy' -> 'Love Story')
            elif res_type == "track":
                t_dict = fuzzy_res["track"]
                corrected_query = t_dict["title"]
                match_type = "track"

                cursor.execute("""
                    SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                    FROM tracks t
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE t.id = ?
                """, (t_dict["id"],))
                target_row = cursor.fetchone()
                if target_row:
                    tracks.append({
                        **dict(target_row),
                        "cover_url": f"/api/covers/{target_row['album_id']}",
                        "stream_url": f"/api/stream/{target_row['id']}",
                        "matched_in": "fuzzy_track",
                    })

                # Also fetch other tracks sharing base title or artist
                cursor.execute("""
                    SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                    FROM tracks t
                    JOIN albums a ON t.album_id = a.id
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE (t.artist_id = ? OR t.title LIKE ?) AND t.id != ?
                    ORDER BY t.title COLLATE NOCASE ASC
                    LIMIT 15
                """, (t_dict["artist_id"], f"%{t_dict['title'][:5]}%", t_dict["id"]))
                for r in cursor.fetchall():
                    tracks.append({
                        **dict(r),
                        "cover_url": f"/api/covers/{r['album_id']}",
                        "stream_url": f"/api/stream/{r['id']}",
                        "matched_in": "related_track",
                    })

            # D. General Word Spell Correction (e.g. 'burnin flams' -> 'burning flames')
            elif res_type == "sentence":
                corrected_sentence = fuzzy_res["corrected_sentence"]
                corr_tokens = [t.strip() for t in corrected_sentence.split() if t.strip()]
                if corr_tokens:
                    c_where = ["(t.title LIKE ? OR ar.name LIKE ? OR a.title LIKE ?)" for _ in corr_tokens]
                    c_params = []
                    for tok in corr_tokens:
                        c_params.extend([f"%{tok}%", f"%{tok}%", f"%{tok}%"])
                    cursor.execute(f"""
                        SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                        FROM tracks t
                        JOIN albums a ON t.album_id = a.id
                        JOIN artists ar ON t.artist_id = ar.id
                        WHERE {' AND '.join(c_where)}
                        ORDER BY t.title COLLATE NOCASE ASC
                        LIMIT {limit}
                    """, tuple(c_params))
                    c_tracks = [
                        {
                            **dict(r),
                            "cover_url": f"/api/covers/{r['album_id']}",
                            "stream_url": f"/api/stream/{r['id']}",
                            "matched_in": "spellcheck_corrected",
                        }
                        for r in cursor.fetchall()
                    ]
                    if c_tracks:
                        tracks.extend(c_tracks)
                        corrected_query = corrected_sentence
                        match_type = "song"

                    # Also search FTS5 lyrics for corrected sentence
                    c_fts = sanitize_fts5_query(corrected_sentence)
                    if c_fts:
                        try:
                            cursor.execute("""
                                SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name,
                                       bm25(tracks_lyrics_fts) AS rank
                                FROM tracks_lyrics_fts fts
                                JOIN tracks t ON fts.track_id = t.id
                                JOIN albums a ON t.album_id = a.id
                                JOIN artists ar ON t.artist_id = ar.id
                                WHERE tracks_lyrics_fts MATCH ?
                                ORDER BY rank ASC
                                LIMIT 20
                            """, (c_fts,))
                            existing_ids = {t["id"] for t in tracks}
                            for r in cursor.fetchall():
                                if r["id"] not in existing_ids:
                                    tracks.append({
                                        **dict(r),
                                        "cover_url": f"/api/covers/{r['album_id']}",
                                        "stream_url": f"/api/stream/{r['id']}",
                                        "matched_in": "lyrics",
                                    })
                                    existing_ids.add(r["id"])
                            if tracks:
                                corrected_query = corrected_sentence
                        except Exception:
                            pass

            # E. Remote canonical fallback if still 0
            if len(tracks) == 0 and len(artists) == 0 and len(albums) == 0:
                try:
                    canonical = resolve_smart_canonical_query(cleaned_q)
                    if canonical:
                        c_track = canonical.get("track")
                        c_artist = canonical.get("artist")
                        corrected_query = f"{c_artist} - {c_track}"
                        did_you_mean = {"track": c_track, "artist": c_artist}

                        # Check if artist exists in local library
                        cursor.execute("""
                            SELECT ar.id, ar.name, COUNT(DISTINCT al.id) AS album_count, COUNT(DISTINCT t.id) AS track_count
                            FROM artists ar
                            LEFT JOIN albums al ON al.artist_id = ar.id
                            LEFT JOIN tracks t ON t.artist_id = ar.id
                            WHERE ar.name LIKE ?
                            GROUP BY ar.id
                        """, (f"%{c_artist}%",))
                        art_row = cursor.fetchone()
                        if art_row:
                            primary_artist = {**dict(art_row), "image_url": f"/api/artists/{art_row['id']}/image"}
                            artists = [primary_artist]
                            match_type = "artist"
                            corrected_query = art_row["name"]

                            # Fetch artist's library songs
                            cursor.execute("""
                                SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                                FROM tracks t
                                JOIN albums a ON t.album_id = a.id
                                JOIN artists ar ON t.artist_id = ar.id
                                WHERE ar.id = ?
                                ORDER BY t.title COLLATE NOCASE ASC
                                LIMIT 25
                            """, (art_row["id"],))
                            tracks = [
                                {
                                    **dict(r),
                                    "cover_url": f"/api/covers/{r['album_id']}",
                                    "stream_url": f"/api/stream/{r['id']}",
                                    "matched_in": "artist_catalog",
                                }
                                for r in cursor.fetchall()
                            ]

                        # Check if specific track exists in local library
                        cursor.execute("""
                            SELECT t.id, t.title, t.track_number, t.duration_seconds, a.id AS album_id, a.title AS album_title, ar.id AS artist_id, ar.name AS artist_name
                            FROM tracks t
                            JOIN albums a ON t.album_id = a.id
                            JOIN artists ar ON t.artist_id = ar.id
                            WHERE t.title LIKE ? AND ar.name LIKE ?
                            ORDER BY t.title COLLATE NOCASE ASC
                            LIMIT 10
                        """, (f"%{c_track}%", f"%{c_artist}%"))
                        extra_tracks = [
                            {
                                **dict(row),
                                "cover_url": f"/api/covers/{row['album_id']}",
                                "stream_url": f"/api/stream/{row['id']}",
                                "matched_in": "canonical_lookup",
                            }
                            for row in cursor.fetchall()
                        ]
                        if extra_tracks:
                            tracks.extend(extra_tracks)
                except Exception as e:
                    logger.warning(f"[Search] Canonical typo check error: {e}")

    resp = {
        "query": q,
        "tracks": tracks,
        "lyrics_matches": lyrics_matches,
        "albums": albums,
        "artists": artists,
        "primary_artist": primary_artist,
        "match_type": match_type,
    }
    if corrected_query:
        resp["corrected_query"] = corrected_query
        resp["did_you_mean"] = did_you_mean

    return resp

