from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.lyrics_fetcher import lyrics_fetcher

router = APIRouter(tags=["Lyrics"])


class LyricsControlRequest(BaseModel):
    action: str  # "pause", "resume", "rescan_missing"


@router.get("/lyrics/status")
async def get_lyrics_crawler_status():
    """Retrieve current background lyrics crawler status, progress and statistics."""
    return lyrics_fetcher.get_status()


@router.post("/lyrics/control")
async def control_lyrics_crawler(body: LyricsControlRequest, request: Request):
    """Pause, resume, or force rescan of library lyrics (Admin only)."""
    user = getattr(request.state, "user", {})
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
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


@router.get("/lyrics/{track_id}")
async def get_track_lyrics(track_id: int, force: bool = Query(False)):
    """
    Retrieve timed/synced or plain lyrics for a track.
    Checks:
    1. Cached lyrics in /data/lyrics/{track_id}.json
    2. Local .lrc sidecar file next to audio file
    3. Embedded audio tags (FLAC, MP3, MP4)
    4. LRCLIB public lyrics service (free, open source)
    """
    res = lyrics_fetcher.fetch_single_track(track_id, force=force)
    return res
