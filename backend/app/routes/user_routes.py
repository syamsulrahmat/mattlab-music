import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user
from app.routes.library import make_cover_url

router = APIRouter(prefix="/users", tags=["User Profiles & Activity"])

# In-memory store for active playback presence:
# user_id -> { "track_id": int, "is_playing": bool, "updated_at": float }
ACTIVE_USER_PLAYBACK: Dict[int, Dict[str, Any]] = {}

class NowPlayingHeartbeatRequest(BaseModel):
    track_id: Optional[int] = None
    is_playing: bool = False

@router.get("")
def list_users(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List registered users for quick search and selection in Command Palette and Bulletin."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, role, display_name, avatar_url, created_at, last_login
            FROM users
            ORDER BY (role = 'admin') DESC, username ASC
        """)
        users = [dict(r) for r in cursor.fetchall()]

        # Attach active playing flag to user list
        now = time.time()
        for u in users:
            uid = u["id"]
            active = ACTIVE_USER_PLAYBACK.get(uid)
            u["is_listening"] = bool(active and (now - active["updated_at"] < 45) and active.get("is_playing"))

        return {"users": users}

@router.post("/now-playing")
def report_now_playing(
    payload: NowPlayingHeartbeatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Heartbeat reported by player when track or playback state changes."""
    user_id = current_user["id"]
    if payload.track_id:
        ACTIVE_USER_PLAYBACK[user_id] = {
            "track_id": payload.track_id,
            "is_playing": payload.is_playing,
            "updated_at": time.time(),
        }
    elif user_id in ACTIVE_USER_PLAYBACK:
        ACTIVE_USER_PLAYBACK[user_id]["is_playing"] = False
        ACTIVE_USER_PLAYBACK[user_id]["updated_at"] = time.time()
    return {"status": "ok"}

@router.get("/{user_id}/profile")
def get_user_profile(user_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get full public user profile, live playback status, playlists, and listening statistics."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, role, display_name, avatar_url, created_at, last_login
            FROM users
            WHERE id = ?
        """, (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        user_info = dict(user_row)

        # 1. Check live playback or last played track
        now_playing = None
        active_entry = ACTIVE_USER_PLAYBACK.get(user_id)
        is_active = False
        track_to_fetch_id = None
        last_played_at = None

        if active_entry and (time.time() - active_entry["updated_at"] < 45) and active_entry.get("is_playing"):
            is_active = True
            track_to_fetch_id = active_entry["track_id"]
        else:
            # Fallback to most recent track play from database
            cursor.execute("""
                SELECT track_id, played_at
                FROM track_plays
                WHERE user_id = ?
                ORDER BY played_at DESC, id DESC
                LIMIT 1
            """, (user_id,))
            last_play = cursor.fetchone()
            if last_play:
                track_to_fetch_id = last_play["track_id"]
                last_played_at = str(last_play["played_at"])

        if track_to_fetch_id:
            cursor.execute("""
                SELECT 
                    t.id, t.title, t.duration_seconds, t.mtime,
                    a.id as album_id, a.title as album_title, a.cover_path,
                    ar.id as artist_id, ar.name as artist_name
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON t.artist_id = ar.id
                WHERE t.id = ?
            """, (track_to_fetch_id,))
            t_row = cursor.fetchone()
            if t_row:
                now_playing = {
                    "id": t_row["id"],
                    "title": t_row["title"],
                    "duration_seconds": t_row["duration_seconds"],
                    "album_id": t_row["album_id"],
                    "album_title": t_row["album_title"],
                    "artist_id": t_row["artist_id"],
                    "artist_name": t_row["artist_name"],
                    "cover_url": make_cover_url(t_row["album_id"], t_row["cover_path"]),
                    "stream_url": f"/api/stream/{t_row['id']}?v={int(t_row['mtime']) if t_row['mtime'] else 1}",
                    "is_active": is_active,
                    "played_at": str(last_played_at) if last_played_at else None,
                }

        # 2. Fetch playlists created by this user
        cursor.execute("""
            SELECT 
                p.id, p.name, p.description, p.created_at, p.updated_at,
                COUNT(DISTINCT pt.id) as track_count,
                COALESCE(SUM(t.duration_seconds), 0) as total_duration
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
            LEFT JOIN tracks t ON pt.track_id = t.id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC, p.id DESC
        """, (user_id,))
        playlist_rows = [dict(r) for r in cursor.fetchall()]

        # Attach 2x2 cover collages
        for pl in playlist_rows:
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
            pl["covers"] = [f"/api/covers/{r['album_id']}" for r in cursor.fetchall()]

        # 3. Overall listening stats
        cursor.execute("SELECT COUNT(*) as play_count FROM track_plays WHERE user_id = ?", (user_id,))
        total_plays = cursor.fetchone()["play_count"]

        return {
            "user": user_info,
            "now_playing": now_playing,
            "playlists": playlist_rows,
            "stats": {
                "total_plays": total_plays,
                "playlist_count": len(playlist_rows),
            },
            "is_self": (user_id == current_user["id"]),
        }
