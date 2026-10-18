from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(tags=["Playlists & Favorites"])

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class AddTrackRequest(BaseModel):
    track_id: Optional[int] = None
    track_ids: Optional[List[int]] = None

class ReorderPlaylistsRequest(BaseModel):
    playlist_ids: List[int]

class ReorderTracksRequest(BaseModel):
    track_ids: List[int]

# ==================== FAVORITES ====================

@router.get("/favorites/ids")
async def get_favorite_ids(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return all favorited track IDs for fast frontend matching for current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT track_id FROM favorites WHERE user_id = ?", (current_user["id"],))
        ids = [row["track_id"] for row in cursor.fetchall()]
    return ids

@router.get("/favorites")
async def get_favorites(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return all favorited tracks in reverse chronological order for current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.file_format, t.bitrate,
                a.id AS album_id, a.title AS album_title,
                ar.id AS artist_id, ar.name AS artist_name,
                f.created_at AS favorited_at
            FROM favorites f
            JOIN tracks t ON f.track_id = t.id
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
        """, (current_user["id"],))
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
async def add_favorite(track_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Add a track to favorites for current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tracks WHERE id = ?", (track_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Track not found")

        cursor.execute("INSERT OR IGNORE INTO favorites (user_id, track_id) VALUES (?, ?)", (current_user["id"], track_id))
    return {"status": "added", "track_id": track_id}

@router.delete("/favorites/{track_id}")
async def remove_favorite(track_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Remove a track from favorites for current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE user_id = ? AND track_id = ?", (current_user["id"], track_id))
    return {"status": "removed", "track_id": track_id}


# ==================== PLAYLISTS ====================

@router.get("/playlists")
async def list_playlists(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List all playlists belonging to current user with track count, duration, and sample covers for 2x2 grid."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                p.id, p.name, p.description, p.created_at, p.updated_at, p.position,
                p.spotify_id, p.spotify_url, p.auto_sync, p.last_synced_at, p.sync_status,
                CASE 
                    WHEN p.spotify_id IS NOT NULL THEN (SELECT COUNT(*) FROM spotify_sync_tracks WHERE playlist_id = p.id)
                    ELSE COUNT(pt.id)
                END AS track_count,
                CASE
                    WHEN p.spotify_id IS NOT NULL THEN (SELECT ROUND(COALESCE(SUM(duration_ms), 0) / 1000.0) FROM spotify_sync_tracks WHERE playlist_id = p.id)
                    ELSE COALESCE(SUM(t.duration_seconds), 0)
                END AS total_duration
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
            LEFT JOIN tracks t ON pt.track_id = t.id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.position ASC, p.created_at DESC, p.id DESC
        """, (current_user["id"],))
        playlists = [dict(row) for row in cursor.fetchall()]

        # Attach up to 4 distinct album cover URLs for each playlist for 2x2 collage (first 4 albums by track position)
        for pl in playlists:
            cursor.execute("""
                SELECT a.id AS album_id
                FROM playlist_tracks pt
                JOIN tracks t ON pt.track_id = t.id
                JOIN albums a ON t.album_id = a.id
                WHERE pt.playlist_id = ? AND a.cover_path IS NOT NULL
                GROUP BY a.id
                ORDER BY MIN(pt.position) ASC, MIN(pt.added_at) ASC
                LIMIT 4
            """, (pl["id"],))
            rows = cursor.fetchall()
            pl["covers"] = [f"/api/covers/{r['album_id']}" for r in rows]

    return {"items": playlists}

@router.post("/playlists")
async def create_playlist(payload: PlaylistCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Create a new playlist scoped to current user."""
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Playlist name cannot be empty")

    with get_db() as conn:
        cursor = conn.cursor()
        # Shift existing playlists down so the newly added playlist is placed at the top (position 0)
        cursor.execute("UPDATE playlists SET position = position + 1 WHERE user_id = ?", (current_user["id"],))
        cursor.execute(
            "INSERT INTO playlists (name, description, user_id, position) VALUES (?, ?, ?, 0)",
            (clean_name, payload.description or "", current_user["id"])
        )
        playlist_id = cursor.lastrowid

    return {"id": playlist_id, "name": clean_name, "track_count": 0}

@router.get("/playlists/{playlist_id}")
async def get_playlist_detail(playlist_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get single playlist and its ordered tracks, verifying user ownership."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        playlist = cursor.fetchone()
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.duration_seconds, t.file_format, t.bitrate,
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

        cursor.execute("""
            SELECT a.id AS album_id
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            JOIN albums a ON t.album_id = a.id
            WHERE pt.playlist_id = ? AND a.cover_path IS NOT NULL
            GROUP BY a.id
            ORDER BY MIN(pt.position) ASC, MIN(pt.added_at) ASC
            LIMIT 4
        """, (playlist_id,))
        rows = cursor.fetchall()
        playlist_dict = dict(playlist)
        playlist_dict["covers"] = [f"/api/covers/{r['album_id']}" for r in rows]

    return {
        **playlist_dict,
        "tracks": tracks,
    }

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class BulkRemoveRequest(BaseModel):
    track_ids: List[int]

@router.patch("/playlists/{playlist_id}")
async def update_playlist(playlist_id: int, payload: PlaylistUpdate, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Rename a playlist and/or update its description."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        if payload.name is not None:
            clean_name = payload.name.strip()
            if not clean_name:
                raise HTTPException(status_code=400, detail="Playlist name cannot be empty")
            cursor.execute(
                "UPDATE playlists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (clean_name[:100], playlist_id, current_user["id"]),
            )
        if payload.description is not None:
            cursor.execute(
                "UPDATE playlists SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (payload.description.strip()[:300], playlist_id, current_user["id"]),
            )
        cursor.execute("SELECT id, name, description FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        row = cursor.fetchone()
    return dict(row)

@router.post("/playlists/{playlist_id}/tracks/remove")
async def bulk_remove_tracks(playlist_id: int, payload: BulkRemoveRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Remove several tracks from a playlist in one call (multi-select delete)."""
    if not payload.track_ids:
        return {"status": "removed", "count": 0}
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        placeholders = ",".join("?" for _ in payload.track_ids)
        cursor.execute(
            f"DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id IN ({placeholders})",
            (playlist_id, *payload.track_ids),
        )
        removed = cursor.rowcount
    return {"status": "removed", "count": removed}

@router.post("/playlists/{playlist_id}/tracks")
async def add_track_to_playlist(playlist_id: int, payload: AddTrackRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Add one or more tracks to a playlist, checking for duplicates."""
    target_ids = []
    if payload.track_ids:
        target_ids = [t for t in payload.track_ids if isinstance(t, int)]
    elif payload.track_id is not None:
        target_ids = [payload.track_id]

    if not target_ids:
        raise HTTPException(status_code=400, detail="No track_id or track_ids provided")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        placeholders = ",".join("?" for _ in target_ids)
        cursor.execute(
            f"SELECT id FROM tracks WHERE id IN ({placeholders})",
            (*target_ids,)
        )
        valid_track_ids = {row["id"] for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT track_id FROM playlist_tracks WHERE playlist_id = ? AND track_id IN ({placeholders})",
            (playlist_id, *target_ids)
        )
        existing_in_playlist = {row["track_id"] for row in cursor.fetchall()}

        cursor.execute("SELECT COALESCE(MAX(position), 0) AS max_pos FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
        cur_pos = cursor.fetchone()["max_pos"]

        added_ids = []
        already_exists_ids = []

        for tid in target_ids:
            if tid not in valid_track_ids:
                continue
            if tid in existing_in_playlist:
                already_exists_ids.append(tid)
            else:
                cur_pos += 1
                cursor.execute("""
                    INSERT INTO playlist_tracks (playlist_id, track_id, position)
                    VALUES (?, ?, ?)
                """, (playlist_id, tid, cur_pos))
                added_ids.append(tid)
                existing_in_playlist.add(tid)

        if added_ids:
            cursor.execute("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (playlist_id,))

        cursor.execute("SELECT COUNT(id) AS cnt FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
        new_cnt = cursor.fetchone()["cnt"]

    if len(target_ids) == 1 and not added_ids and already_exists_ids:
        return {
            "status": "exists",
            "already_exists": True,
            "message": "Song is already in this playlist",
            "playlist_id": playlist_id,
            "track_id": target_ids[0],
            "track_count": new_cnt
        }

    return {
        "status": "added" if added_ids else "exists",
        "already_exists": len(added_ids) == 0 and len(already_exists_ids) > 0,
        "playlist_id": playlist_id,
        "track_id": target_ids[0] if target_ids else None,
        "added_count": len(added_ids),
        "already_exists_count": len(already_exists_ids),
        "track_ids": added_ids,
        "track_count": new_cnt
    }

@router.delete("/playlists/{playlist_id}/tracks/{track_id}")
async def remove_track_from_playlist(playlist_id: int, track_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Remove a track from a playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", (playlist_id, track_id))
        cursor.execute("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (playlist_id,))

    return {"status": "removed", "playlist_id": playlist_id, "track_id": track_id}

@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        cursor.execute("DELETE FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
    return {"status": "deleted", "id": playlist_id}

@router.put("/playlists/reorder")
async def reorder_playlists(payload: ReorderPlaylistsRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Reorder playlists in sidebar by setting sequential position for current user."""
    with get_db() as conn:
        cursor = conn.cursor()
        for idx, pl_id in enumerate(payload.playlist_ids):
            cursor.execute("UPDATE playlists SET position = ? WHERE id = ? AND user_id = ?", (idx, pl_id, current_user["id"]))
    return {"status": "success", "count": len(payload.playlist_ids)}

@router.put("/playlists/{playlist_id}/reorder")
async def reorder_playlist_tracks(playlist_id: int, payload: ReorderTracksRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Reorder tracks inside a playlist by setting sequential position."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Playlist not found")

        for idx, trk_id in enumerate(payload.track_ids):
            cursor.execute(
                "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
                (idx + 1, playlist_id, trk_id)
            )
        cursor.execute("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (playlist_id,))
    return {"status": "success", "playlist_id": playlist_id, "count": len(payload.track_ids)}

@router.post("/playlists/from-album/{album_id}")
async def create_playlist_from_album(album_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Create a new playlist from an album and populate all tracks in order."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.title AS album_title, ar.name AS artist_name
            FROM albums a
            JOIN artists ar ON a.artist_id = ar.id
            WHERE a.id = ?
        """, (album_id,))
        album = cursor.fetchone()
        if not album:
            raise HTTPException(status_code=404, detail="Album not found")

        playlist_name = f"{album['artist_name']} - {album['album_title']}"
        
        # Shift existing playlists down so the newly added playlist is placed at the top (position 0)
        cursor.execute("UPDATE playlists SET position = position + 1 WHERE user_id = ?", (current_user["id"],))
        cursor.execute(
            "INSERT INTO playlists (name, description, position, user_id) VALUES (?, ?, 0, ?)",
            (playlist_name, f"Album: {album['album_title']} by {album['artist_name']}", current_user["id"])
        )
        playlist_id = cursor.lastrowid

        cursor.execute("""
            SELECT id FROM tracks
            WHERE album_id = ?
            ORDER BY disc_number ASC, track_number ASC, id ASC
        """, (album_id,))
        tracks = cursor.fetchall()

        for idx, t in enumerate(tracks):
            cursor.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                (playlist_id, t["id"], idx + 1)
            )

    return {
        "status": "created",
        "id": playlist_id,
        "name": playlist_name,
        "track_count": len(tracks)
    }

@router.post("/playlists/{playlist_id}/take-ownership")
async def take_playlist_ownership(playlist_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Convert an imported Spotify playlist into a standard local user-owned playlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, spotify_id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, current_user["id"]))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if not row["spotify_id"]:
            raise HTTPException(status_code=400, detail="Playlist is already a local user-owned playlist")

        # 1. Ensure all matched tracks from spotify_sync_tracks are in playlist_tracks
        cursor.execute("""
            INSERT INTO playlist_tracks (playlist_id, track_id, position)
            SELECT playlist_id, track_id, position
            FROM spotify_sync_tracks
            WHERE playlist_id = ? AND track_id IS NOT NULL
            ON CONFLICT(playlist_id, track_id) DO UPDATE SET position = excluded.position
        """, (playlist_id,))

        # 2. Sever Spotify sync ties and metadata so Lidarr / background sync stops
        cursor.execute("""
            UPDATE playlists
            SET spotify_id = NULL,
                spotify_url = NULL,
                auto_sync = 0,
                sync_status = NULL,
                last_synced_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (playlist_id, current_user["id"]))

        # 3. Clean up sync tracks queue
        cursor.execute("DELETE FROM spotify_sync_tracks WHERE playlist_id = ?", (playlist_id,))

        # 4. Normalize sequential positions (1..N) for smooth reordering
        cursor.execute("""
            SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC, added_at ASC
        """, (playlist_id,))
        p_tracks = cursor.fetchall()
        for idx, pt in enumerate(p_tracks):
            cursor.execute("UPDATE playlist_tracks SET position = ? WHERE id = ?", (idx + 1, pt["id"]))

    return {
        "status": "ok",
        "message": f"Successfully took ownership of playlist '{row['name']}'",
        "playlist_id": playlist_id,
    }


