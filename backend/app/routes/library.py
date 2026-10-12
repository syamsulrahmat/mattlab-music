from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db

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

@router.get("/search")
async def search_library(q: str = Query(..., min_length=1)):
    """Search across tracks, artists, and albums simultaneously."""
    query_param = f"%{q.strip()}%"
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Search tracks
        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.title LIKE ?
            ORDER BY t.title COLLATE NOCASE ASC
            LIMIT 25
        """, (query_param,))
        tracks = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

        # 2. Search albums
        cursor.execute("""
            SELECT 
                a.id, a.title, a.year, a.artist_id,
                ar.name AS artist_name,
                COUNT(t.id) AS track_count
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = a.id
            WHERE a.title LIKE ?
            GROUP BY a.id
            ORDER BY a.title COLLATE NOCASE ASC
            LIMIT 15
        """, (query_param,))
        albums = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

        # 3. Search artists
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
        """, (query_param,))
        artists = [
            {
                **dict(row),
                "image_url": f"/api/artists/{row['id']}/image",
            }
            for row in cursor.fetchall()
        ]

    return {
        "query": q,
        "tracks": tracks,
        "albums": albums,
        "artists": artists,
    }
