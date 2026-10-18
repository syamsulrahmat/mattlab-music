import os
import re
from pathlib import Path
from typing import Generator, Optional

from fastapi import APIRouter, HTTPException, Request, Response, status, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response

from app.database import get_db

router = APIRouter(tags=["Streaming & Media"])

MIME_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "wav": "audio/wav",
}

DEFAULT_SVG_COVER = """<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#282828"/>
  <path d="M150 110 A 30 30 0 0 0 150 170 A 30 30 0 0 0 150 110 Z" fill="#121212"/>
  <circle cx="150" cy="140" r="12" fill="#1DB954"/>
  <path d="M150 70 A 70 70 0 0 0 80 140 A 70 70 0 0 0 150 210 A 70 70 0 0 0 220 140 A 70 70 0 0 0 150 70 Z M150 190 A 50 50 0 1 1 150 90 A 50 50 0 0 1 150 190 Z" fill="#3E3E3E"/>
</svg>"""

def stream_file_chunks(file_path: Path, start: int, length: int, chunk_size: int = 65536) -> Generator[bytes, None, None]:
    """Yield file chunks for streaming range requests."""
    with open(file_path, "rb") as f:
        f.seek(start)
        bytes_left = length
        while bytes_left > 0:
            read_size = min(chunk_size, bytes_left)
            chunk = f.read(read_size)
            if not chunk:
                break
            bytes_left -= len(chunk)
            yield chunk

@router.get("/stream/{track_id}")
async def stream_track(
    track_id: int, 
    request: Request,
    quality: Optional[str] = None
):
    """
    Stream audio file supporting HTTP 206 Partial Content (Range requests)
    for seamless seeking, scrub buffering, and low latency playback.
    Supports ?quality=low / ?quality=data_saver for 128 kbps bandwidth-saving streaming.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, file_format, file_size, bitrate FROM tracks WHERE id = ?", (track_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = Path(row["file_path"])
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    file_size = row["file_size"] or file_path.stat().st_size
    file_format = row["file_format"].lower()
    media_type = MIME_TYPES.get(file_format, "application/octet-stream")

    # Data Saver quality mode: transcode to 128k MP3 if high-bitrate / lossless
    quality_mode = (quality or "").lower().strip()
    is_data_saver = quality_mode in ("low", "data_saver", "128k")

    if is_data_saver:
        raw_bitrate = row["bitrate"] or 0
        # If the file is already an MP3 at <= 192k, stream directly without re-encoding
        if file_format == "mp3" and raw_bitrate > 0 and raw_bitrate <= 192000:
            pass
        else:
            try:
                from app.transcoder import get_or_create_transcoded_track
                transcoded_path = await get_or_create_transcoded_track(track_id, file_path, "128k")
                if transcoded_path.exists() and transcoded_path.stat().st_size > 1024:
                    file_path = transcoded_path
                    file_size = transcoded_path.stat().st_size
                    file_format = "mp3"
                    media_type = "audio/mpeg"
            except Exception:
                # If transcode fails, gracefully fall back to original audio
                pass

    range_header = request.headers.get("Range")
    if not range_header:
        # Standard full stream (client didn't request a range)
        return StreamingResponse(
            stream_file_chunks(file_path, 0, file_size),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Disposition": f'inline; filename="{file_path.name}"',
            },
        )

    # Parse Range: bytes=start-end
    match = re.match(r"^bytes=(\d+)-(\d*)", range_header.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Invalid Range header")

    start_str, end_str = match.groups()
    start = int(start_str)
    end = int(end_str) if end_str else file_size - 1

    if start >= file_size or end >= file_size or start > end:
        return Response(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    content_length = end - start + 1
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": media_type,
    }

    return StreamingResponse(
        stream_file_chunks(file_path, start, content_length),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        headers=headers,
        media_type=media_type,
    )


@router.get("/stream/cache/stats")
async def get_stream_cache_stats():
    """Retrieve disk space and file count for transcoded audio files."""
    from app.transcoder import get_transcode_cache_stats
    return get_transcode_cache_stats()


@router.post("/stream/cache/clear")
async def clear_stream_transcode_cache():
    """Clear all cached transcoded audio files to reclaim disk space."""
    from app.transcoder import clear_transcode_cache
    return clear_transcode_cache()


async def _async_prewarm(track_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, file_format, bitrate FROM tracks WHERE id = ?", (track_id,))
        row = cursor.fetchone()
    if not row:
        return
    file_path = Path(row["file_path"])
    file_format = row["file_format"].lower()
    raw_bitrate = row["bitrate"] or 0
    # Skip if track is already lightweight MP3
    if file_format == "mp3" and raw_bitrate > 0 and raw_bitrate <= 192000:
        return
    if file_path.exists():
        try:
            from app.transcoder import get_or_create_transcoded_track
            await get_or_create_transcoded_track(track_id, file_path, "128k")
        except Exception:
            pass


@router.post("/stream/prewarm/{track_id}")
async def prewarm_track_transcode(track_id: int, background_tasks: BackgroundTasks):
    """Pre-transcode 128k MP3 in the background so switching to LQ is instant (0ms wait)."""
    background_tasks.add_task(_async_prewarm, track_id)
    return {"status": "prewarming", "track_id": track_id}

@router.get("/covers-sample")
async def get_sample_album_covers(limit: int = 30):
    """Retrieve sample album covers for landing/login background grid."""
    safe_limit = max(10, min(limit, 50))
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM albums 
            WHERE cover_path IS NOT NULL AND cover_path != ''
            ORDER BY RANDOM()
            LIMIT ?
        """, (safe_limit,))
        rows = cursor.fetchall()

    album_ids = [r["id"] for r in rows]
    return {
        "covers": [f"/api/covers/{aid}" for aid in album_ids]
    }

@router.get("/covers/{album_id}")
async def get_album_cover(album_id: int):
    """Serve album artwork with disk caching and fallback SVG placeholder."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT cover_path FROM albums WHERE id = ?", (album_id,))
        row = cursor.fetchone()

    if row and row["cover_path"]:
        cover_path = Path(row["cover_path"])
        if cover_path.exists() and cover_path.is_file():
            return FileResponse(
                path=str(cover_path),
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=604800, immutable"},
            )

    # Fallback vinyl SVG placeholder
    return Response(content=DEFAULT_SVG_COVER, media_type="image/svg+xml")

@router.get("/tracks/{track_id}")
async def get_track_detail(track_id: int):
    """Get metadata for a single track."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                t.id, t.title, t.track_number, t.disc_number, t.duration_seconds,
                t.file_format, t.bitrate,
                a.id AS album_id, a.title AS album_title, a.year AS album_year, a.cover_path,
                ar.id AS artist_id, ar.name AS artist_name
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.id = ?
        """, (track_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = dict(row)
    track_dict["cover_url"] = f"/api/covers/{row['album_id']}"
    track_dict["stream_url"] = f"/api/stream/{row['id']}"
    return track_dict
