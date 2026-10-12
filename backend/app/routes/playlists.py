from typing import Optional, List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.database import get_db

router = APIRouter(tags=["Playlists & Favorites"])

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class AddTrackRequest(BaseModel):
    track_id: int

# ==================== FAVORITES ====================

@router.get("/favorites/ids")
async def get_favorite_ids():
    """Return all favorited track IDs for fast frontend matching."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT track_id FROM favorites")
        ids = [row["track_id"] for row in cursor.fetchall()]
    return ids

@router.get("/favorites")
async def get_favorites():
    """Return all favorited tracks in reverse chronological order."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.file_format,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name,
                f.created_at AS favorited_at
            FROM favorites f
            JOIN tracks t ON f.track_id = t.id
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            ORDER BY f.created_at DESC
        """)
        tracks = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]
    return {"items": tracks, "count": len(tracks)}

@router.post("/favorites/{track_id}")
async def add_favorite(track_id: int):
    """Add a track to favorites."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tracks WHERE id = ?", (track_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Track not found")

        cursor.execute("INSERT OR IGNORE INTO favorites (track_id) VALUES (?)", (track_id,))
    return {"status": "added", "track_id": track_id}

@router.delete("/favorites/{track_id}")
async def remove_favorite(track_id: int):
    """Remove a track from favorites."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE track_id = ?", (track_id,))
    return {"status": "removed", "track_id": track_id}


# ==================== PLAYLISTS ====================

@router.get("/playlists")
async def list_playlists():
    """List all playlists with track count and duration."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                p.id, p.name, p.description, p.created_at, p.updated_at,
                COUNT(pt.id) AS track_count,
                COALESCE(SUM(t.duration_seconds), 0) AS total_duration
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
            LEFT JOIN tracks t ON pt.track_id = t.id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        """)
        playlists = [dict(row) for row in cursor.fetchall()]
    return {"items": playlists}

@router.post("/playlists")
async def create_playlist(payload: PlaylistCreate):
    """Create a new playlist."""
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Playlist name cannot be empty")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO playlists (name, description) VALUES (?, ?)",
            (clean_name, payload.description or "")
        )
        playlist_id = cursor.lastrowid

    return {"id": playlist_id, "name": clean_name, "track_count": 0}

@router.get("/playlists/{playlist_id}")
async def get_playlist_detail(playlist_id: int):
    """Get single playlist and its ordered tracks."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM playlists WHERE id = ?", (playlist_id,))
        playlist = cursor.fetchone()
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.file_format,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name,
                pt.position, pt.added_at
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE pt.playlist_id = ?
            ORDER BY pt.position ASC, pt.added_at ASC
        """, (playlist_id,))

        tracks = [
            {
                **dict(row),
                "cover_url": f"/api/covers/{row['album_id']}",
                "stream_url": f"/api/stream/{row['id']}",
            }
            for row in cursor.fetchall()
        ]

    return {
        **dict(playlist),
        "tracks": tracks,
    }

@router.post("/playlists/{playlist_id}/tracks")
async def add_track_to_playlist(playlist_id: int, payload: AddTrackRequest):
    """Add a track to a playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ?", (playlist_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("SELECT id FROM tracks WHERE id = ?", (payload.track_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Track not found")

        cursor.execute("SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
        next_pos = cursor.fetchone()["next_pos"]

        cursor.execute("""
            INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
            VALUES (?, ?, ?)
        """, (playlist_id, payload.track_id, next_pos))

        cursor.execute("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (playlist_id,))

    return {"status": "added", "playlist_id": playlist_id, "track_id": payload.track_id}

@router.delete("/playlists/{playlist_id}/tracks/{track_id}")
async def remove_track_from_playlist(playlist_id: int, track_id: int):
    """Remove a track from a playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", (playlist_id, track_id))
        cursor.execute("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (playlist_id,))

    return {"status": "removed", "playlist_id": playlist_id, "track_id": track_id}

@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: int):
    """Delete a playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
    return {"status": "deleted", "id": playlist_id}
