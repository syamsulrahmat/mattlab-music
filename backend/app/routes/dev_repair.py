"""
Developer Repair API routes for MattLab Music.
Provides targeted audio re-download, 1400x1400 cover art cascade,
library integrity audit, and background batch healing.
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, Dict, Any

from app.database import get_db
from app.repair_service import (
    repair_track_audio,
    repair_track_cover,
    repair_album_cover,
    audit_library_issues,
    start_batch_repair_background,
    get_repair_status,
)

router = APIRouter(tags=["Developer Repair"])


@router.get("/audit")
def get_repair_audit():
    """Returns total broken audio tracks, missing covers, and detailed lists."""
    audit = audit_library_issues()
    status = get_repair_status()
    return {
        **audit,
        "worker_status": status,
    }


@router.get("/search")
def search_tracks_for_repair(q: str = Query(..., min_length=1)):
    """Search library tracks by title or artist with diagnostic health indicators."""
    query = f"%{q.strip().lower()}%"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.id, t.title, ar.name as artist, al.id as album_id, al.title as album,
                   t.duration_seconds, t.file_size, t.file_format, t.bitrate,
                   al.cover_path
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            JOIN albums al ON t.album_id = al.id
            WHERE LOWER(t.title) LIKE ? OR LOWER(ar.name) LIKE ?
            ORDER BY t.id DESC
            LIMIT 30
        """, (query, query))
        rows = cursor.fetchall()

    results = []
    for r in rows:
        dur = r["duration_seconds"] or 0
        has_cover = bool(r["cover_path"])
        is_suspicious = (179.8 <= dur <= 180.2) or (29.8 <= dur <= 30.2) or (dur > 60 and (r["file_size"] or 0) < 1_000_000)

        results.append({
            "id": r["id"],
            "title": r["title"],
            "artist": r["artist"],
            "album_id": r["album_id"],
            "album": r["album"],
            "duration": dur,
            "file_size": r["file_size"],
            "file_format": r["file_format"],
            "bitrate": r["bitrate"],
            "has_cover": has_cover,
            "cover_url": f"/api/covers/{r['album_id']}" if r["album_id"] else None,
            "is_suspicious": is_suspicious,
        })

    return {"results": results}


@router.post("/track/{track_id}/audio")
def trigger_track_audio_repair(track_id: int):
    """Re-downloads official audio for track using canonical duration verification."""
    res = repair_track_audio(track_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Audio repair failed"))
    return res


@router.post("/track/{track_id}/cover")
def trigger_track_cover_repair(track_id: int):
    """Pulls 1400x1400 album artwork for track and embeds it in file."""
    res = repair_track_cover(track_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Cover repair failed"))
    return res


@router.post("/track/{track_id}/full")
def trigger_track_full_repair(track_id: int):
    """Re-downloads audio AND pulls 1400x1400 cover artwork."""
    audio_res = repair_track_audio(track_id)
    cover_res = repair_track_cover(track_id)
    return {
        "success": audio_res.get("success") or cover_res.get("success"),
        "audio": audio_res,
        "cover": cover_res,
    }


@router.post("/album/{album_id}/cover")
def trigger_album_cover_repair(album_id: int):
    """Pulls 1400x1400 artwork and applies it to album and all its tracks."""
    res = repair_album_cover(album_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Album cover repair failed"))
    return res


@router.post("/batch-audio")
def trigger_batch_audio_repair():
    """Starts background worker to repair all detected damaged audio tracks."""
    started = start_batch_repair_background("audio")
    return {
        "started": started,
        "message": "Batch audio repair started in background" if started else "A repair job is already running",
        "status": get_repair_status(),
    }


@router.post("/batch-covers")
def trigger_batch_covers_repair():
    """Starts background worker to fetch missing 1400x1400 artwork for all albums."""
    started = start_batch_repair_background("covers")
    return {
        "started": started,
        "message": "Batch cover art fetch started in background" if started else "A repair job is already running",
        "status": get_repair_status(),
    }


@router.get("/status")
def get_current_repair_status():
    """Get real-time status and activity logs of the repair worker."""
    return get_repair_status()
