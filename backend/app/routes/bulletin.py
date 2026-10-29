from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/bulletin", tags=["bulletin"])

class CreateBroadcastRequest(BaseModel):
    title: str
    content: str
    track_id: Optional[int] = None
    is_pinned: bool = False

class CreateCommentRequest(BaseModel):
    content: str

class ToggleReactionRequest(BaseModel):
    emoji: str

@router.get("")
def get_bulletin(request: Request, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch all broadcasts with author info, attached track info, comments, and reactions."""
    user_id = current_user["id"]

    with get_db() as conn:
        cursor = conn.cursor()

        # Get user's last read broadcast ID
        cursor.execute("SELECT last_read_broadcast_id FROM broadcast_reads WHERE user_id = ?", (user_id,))
        read_row = cursor.fetchone()
        last_read_id = read_row["last_read_broadcast_id"] if read_row else 0

        # Count unread broadcasts
        cursor.execute("SELECT COUNT(*) as count FROM broadcasts WHERE id > ?", (last_read_id,))
        unread_row = cursor.fetchone()
        unread_count = unread_row["count"] if unread_row else 0

        # Fetch all broadcasts (pinned first, then newest first)
        cursor.execute("""
            SELECT 
                b.id, b.author_id, b.title, b.content, b.track_id, b.is_pinned, b.created_at, b.updated_at,
                u.username as author_username, u.display_name as author_display_name, u.avatar_url as author_avatar_url, u.role as author_role,
                t.title as track_title, t.duration_seconds as track_duration, t.album_id as track_album_id,
                ar.name as track_artist_name,
                al.title as track_album_title, al.cover_path as track_cover_path
            FROM broadcasts b
            JOIN users u ON b.author_id = u.id
            LEFT JOIN tracks t ON b.track_id = t.id
            LEFT JOIN artists ar ON t.artist_id = ar.id
            LEFT JOIN albums al ON t.album_id = al.id
            ORDER BY b.is_pinned DESC, b.created_at DESC, b.id DESC
        """)
        rows = cursor.fetchall()

        broadcasts = []
        broadcast_ids = [row["id"] for row in rows]

        if not broadcast_ids:
            return {"unread_count": 0, "broadcasts": []}

        # Fetch all comments for these broadcasts
        placeholders = ",".join("?" for _ in broadcast_ids)
        cursor.execute(f"""
            SELECT 
                c.id, c.broadcast_id, c.user_id, c.content, c.created_at,
                u.username, u.display_name, u.avatar_url, u.role
            FROM broadcast_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.broadcast_id IN ({placeholders})
            ORDER BY c.created_at ASC, c.id ASC
        """, broadcast_ids)
        comment_rows = cursor.fetchall()
        comments_by_bid: Dict[int, List[Dict[str, Any]]] = {bid: [] for bid in broadcast_ids}
        for crow in comment_rows:
            bid = crow["broadcast_id"]
            comments_by_bid[bid].append({
                "id": crow["id"],
                "content": crow["content"],
                "created_at": str(crow["created_at"]),
                "user": {
                    "id": crow["user_id"],
                    "username": crow["username"],
                    "display_name": crow["display_name"] or crow["username"],
                    "avatar_url": crow["avatar_url"],
                    "role": crow["role"],
                }
            })

        # Fetch all reactions
        cursor.execute(f"""
            SELECT broadcast_id, user_id, emoji
            FROM broadcast_reactions
            WHERE broadcast_id IN ({placeholders})
        """, broadcast_ids)
        reaction_rows = cursor.fetchall()

        # Group reactions by broadcast_id -> emoji -> count & reacted_by_current_user
        reactions_by_bid: Dict[int, Dict[str, Dict[str, Any]]] = {bid: {} for bid in broadcast_ids}
        for rrow in reaction_rows:
            bid = rrow["broadcast_id"]
            em = rrow["emoji"]
            if em not in reactions_by_bid[bid]:
                reactions_by_bid[bid][em] = {"emoji": em, "count": 0, "reacted": False}
            reactions_by_bid[bid][em]["count"] += 1
            if rrow["user_id"] == user_id:
                reactions_by_bid[bid][em]["reacted"] = True

        for row in rows:
            bid = row["id"]
            # Track object if attached
            track_obj = None
            if row["track_id"] and row["track_title"]:
                track_obj = {
                    "id": row["track_id"],
                    "title": row["track_title"],
                    "artist_name": row["track_artist_name"] or "Unknown Artist",
                    "album_title": row["track_album_title"] or "Unknown Album",
                    "album_id": row["track_album_id"],
                    "duration_seconds": row["track_duration"] or 0,
                    "cover_url": f"/api/covers/{row['track_album_id']}" if row["track_album_id"] else "/api/covers/0",
                }

            b_reactions = list(reactions_by_bid[bid].values())

            broadcasts.append({
                "id": bid,
                "title": row["title"],
                "content": row["content"],
                "is_pinned": bool(row["is_pinned"]),
                "created_at": str(row["created_at"]),
                "updated_at": str(row["updated_at"]),
                "author": {
                    "id": row["author_id"],
                    "username": row["author_username"],
                    "display_name": row["author_display_name"] or row["author_username"],
                    "avatar_url": row["author_avatar_url"],
                    "role": row["author_role"],
                },
                "track": track_obj,
                "comments": comments_by_bid[bid],
                "reactions": b_reactions,
            })

        return {
            "unread_count": unread_count,
            "broadcasts": broadcasts,
        }

@router.get("/unread-count")
def get_unread_count(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fast check for unread broadcast notifications."""
    user_id = current_user["id"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT last_read_broadcast_id FROM broadcast_reads WHERE user_id = ?", (user_id,))
        read_row = cursor.fetchone()
        last_read_id = read_row["last_read_broadcast_id"] if read_row else 0

        cursor.execute("SELECT COUNT(*) as count FROM broadcasts WHERE id > ?", (last_read_id,))
        unread_row = cursor.fetchone()
        count = unread_row["count"] if unread_row else 0
        return {"unread_count": count}

@router.post("")
def create_broadcast(payload: CreateBroadcastRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Create a new broadcast announcement. Only Admins can create broadcasts."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can post broadcasts."
        )

    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title and content are required."
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO broadcasts (author_id, title, content, track_id, is_pinned)
            VALUES (?, ?, ?, ?, ?)
        """, (current_user["id"], title, content, payload.track_id, 1 if payload.is_pinned else 0))
        broadcast_id = cursor.lastrowid

        # Mark as read for the author
        cursor.execute("""
            INSERT INTO broadcast_reads (user_id, last_read_broadcast_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                last_read_broadcast_id = MAX(last_read_broadcast_id, excluded.last_read_broadcast_id),
                last_read_at = CURRENT_TIMESTAMP
        """, (current_user["id"], broadcast_id))

        return {"status": "ok", "broadcast_id": broadcast_id}

@router.delete("/{broadcast_id}")
def delete_broadcast(broadcast_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a broadcast. Allowed for author or admin."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT author_id FROM broadcasts WHERE id = ?", (broadcast_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Broadcast not found.")

        if row["author_id"] != current_user["id"] and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized to delete this broadcast.")

        cursor.execute("DELETE FROM broadcasts WHERE id = ?", (broadcast_id,))
        return {"status": "ok", "deleted_id": broadcast_id}

@router.post("/{broadcast_id}/comments")
def add_comment(broadcast_id: int, payload: CreateCommentRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Add a feedback comment / reply to a broadcast."""
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty.")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM broadcasts WHERE id = ?", (broadcast_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Broadcast not found.")

        cursor.execute("""
            INSERT INTO broadcast_comments (broadcast_id, user_id, content)
            VALUES (?, ?, ?)
        """, (broadcast_id, current_user["id"], content))
        comment_id = cursor.lastrowid

        return {
            "status": "ok",
            "comment_id": comment_id,
            "comment": {
                "id": comment_id,
                "broadcast_id": broadcast_id,
                "content": content,
                "created_at": "Just now",
                "user": {
                    "id": current_user["id"],
                    "username": current_user["username"],
                    "display_name": current_user.get("display_name") or current_user["username"],
                    "avatar_url": current_user.get("avatar_url"),
                    "role": current_user.get("role"),
                }
            }
        }

@router.delete("/comments/{comment_id}")
@router.delete("/{broadcast_id}/comments/{comment_id}")
def delete_comment(comment_id: int, broadcast_id: Optional[int] = None, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a comment. Allowed for comment author or admin."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM broadcast_comments WHERE id = ?", (comment_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Comment not found.")

        if row["user_id"] != current_user["id"] and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized to delete this comment.")

        cursor.execute("DELETE FROM broadcast_comments WHERE id = ?", (comment_id,))
        return {"status": "ok", "deleted_id": comment_id}

@router.post("/{broadcast_id}/reactions")
def toggle_reaction(broadcast_id: int, payload: ToggleReactionRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Toggle an emoji reaction on a broadcast."""
    emoji = payload.emoji.strip()
    allowed_emojis = {"❤️", "👍", "🔥", "🎵", "🎉", "👏"}
    if emoji not in allowed_emojis:
        raise HTTPException(status_code=400, detail="Invalid reaction emoji.")

    user_id = current_user["id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 1 FROM broadcast_reactions 
            WHERE broadcast_id = ? AND user_id = ? AND emoji = ?
        """, (broadcast_id, user_id, emoji))
        exists = cursor.fetchone()

        if exists:
            cursor.execute("""
                DELETE FROM broadcast_reactions 
                WHERE broadcast_id = ? AND user_id = ? AND emoji = ?
            """, (broadcast_id, user_id, emoji))
            action = "removed"
        else:
            cursor.execute("""
                INSERT INTO broadcast_reactions (broadcast_id, user_id, emoji)
                VALUES (?, ?, ?)
            """, (broadcast_id, user_id, emoji))
            action = "added"

        return {"status": "ok", "action": action, "emoji": emoji}

@router.post("/mark-read")
def mark_bulletin_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Mark all current broadcasts as read for the user."""
    user_id = current_user["id"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COALESCE(MAX(id), 0) as max_id FROM broadcasts")
        max_row = cursor.fetchone()
        max_id = max_row["max_id"] if max_row else 0

        cursor.execute("""
            INSERT INTO broadcast_reads (user_id, last_read_broadcast_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                last_read_broadcast_id = excluded.last_read_broadcast_id,
                last_read_at = CURRENT_TIMESTAMP
        """, (user_id, max_id))

        return {"status": "ok", "last_read_id": max_id}
