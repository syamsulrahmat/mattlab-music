from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.lyrics_fetcher import lyrics_fetcher

router = APIRouter(tags=["Lyrics"])


class LyricsControlRequest(BaseModel):
    action: str  # "pause", "resume", "rescan_missing", "reset_unmatched"


class SaveLyricsRequest(BaseModel):
    lyrics: str
    is_synced: Optional[bool] = None


@router.get("/lyrics/status")
async def get_lyrics_crawler_status():
    """Retrieve current background lyrics crawler status, progress and statistics."""
    return lyrics_fetcher.get_status()


@router.post("/lyrics/control")
async def control_lyrics_crawler(body: LyricsControlRequest, request: Request):
    """Pause, resume, or force rescan of library lyrics (Admin only)."""
    user = getattr(request.state, "user", {})
    if not user:
        from app.auth import get_user_from_request
        user = get_user_from_request(request) or {}
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    action = body.action.lower()
    if action == "pause":
        lyrics_fetcher.pause()
        return {"status": "paused", "message": "Lyrics crawler paused"}
    elif action == "resume":
        lyrics_fetcher.resume()
        return {"status": "resumed", "message": "Lyrics crawler resumed"}
    elif action in ("rescan_missing", "rescan_all"):
        lyrics_fetcher.rescan_missing_tracks()
        return {"status": "rescanning", "message": "Enqueued missing tracks for background retrieval"}
    elif action in ("reset_unmatched", "reset_not_found"):
        count = lyrics_fetcher.reset_unmatched_tracks()
        return {"status": "reset", "reset_count": count, "message": f"Successfully reset {count} tracks for re-retrieval"}
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


@router.post("/lyrics/reset-unmatched")
async def reset_unmatched_lyrics(request: Request):
    """Reset all false 'not_found' tracks and enqueue them for re-crawling with multi-source pipeline (Admin only)."""
    user = getattr(request.state, "user", {})
    if not user:
        from app.auth import get_user_from_request
        user = get_user_from_request(request) or {}
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    count = lyrics_fetcher.reset_unmatched_tracks()
    return {"status": "success", "reset_count": count, "message": f"Successfully reset {count} tracks for re-fetching"}


@router.get("/lyrics/{track_id}")
async def get_track_lyrics(track_id: int, force: bool = Query(False)):
    """
    Retrieve timed/synced or plain lyrics for a track.
    Checks:
    1. Cached lyrics in /data/lyrics/{track_id}.json
    2. Local .lrc sidecar file next to audio file
    3. Embedded audio tags (FLAC, MP3, MP4)
    4. LRCLIB public lyrics service (free, open source)
    5. Lyrics.ovh fallback public lyrics service
    """
    res = lyrics_fetcher.fetch_single_track(track_id, force=force)
    if res and not res.get("notFound"):
        try:
            from app.romanization import enrich_lyrics_with_romanization
            res = enrich_lyrics_with_romanization(res)
        except Exception as e:
            pass
    return res


@router.post("/lyrics/{track_id}/save")
async def save_track_lyrics(track_id: int, body: SaveLyricsRequest, request: Request):
    """Save custom or user-edited lyrics for a track (authenticated users)."""
    user = getattr(request.state, "user", {})
    if not user:
        from app.auth import get_user_from_request
        user = get_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    if not body.lyrics or not body.lyrics.strip():
        raise HTTPException(status_code=400, detail="Lyrics content cannot be empty")

    try:
        res = lyrics_fetcher.save_custom_lyrics(
            track_id=track_id,
            lyrics_text=body.lyrics,
            is_synced=body.is_synced,
        )
        if res and not res.get("notFound"):
            try:
                from app.romanization import enrich_lyrics_with_romanization
                res = enrich_lyrics_with_romanization(res)
            except Exception:
                pass
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save lyrics: {e}")

