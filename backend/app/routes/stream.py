import os
import re
import json
import asyncio
import logging
import threading
from pathlib import Path
from typing import Generator, Optional

from fastapi import APIRouter, HTTPException, Request, Response, status, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response

from app.database import get_db
from app.config import MUSIC_DIR, VISUALIZERS_DIR

logger = logging.getLogger("stream_routes")

router = APIRouter(tags=["Streaming & Media"])

# ── Drive Wake-up Mechanism ──────────────────────────────────────────────
# On Unraid, the music library resides on a mechanical HDD that spins down
# after idle periods. A cold open() blocks 4-7 seconds while the platters
# spin up. This lightweight endpoint lets the frontend trigger a non-blocking
# wake-up the instant the browser tab opens, giving maximum lead time before
# the user clicks Play.
_drive_wake_lock = threading.Lock()
_drive_last_wake_time = 0.0  # epoch seconds


def _wake_drive_sync():
    """Touch the music directory in a background thread to force HDD spin-up.
    Debounced to at most once every 30 seconds to avoid unnecessary I/O."""
    import time
    global _drive_last_wake_time
    with _drive_wake_lock:
        now = time.time()
        if now - _drive_last_wake_time < 30:
            return  # Already woken recently
        _drive_last_wake_time = now
    try:
        # os.listdir is the lightest syscall that forces the kernel to
        # spin up the drive — it reads the directory inode from disk.
        entries = os.listdir(MUSIC_DIR)
        if entries:
            # Stat the first file to ensure the drive heads actually seek
            first = os.path.join(str(MUSIC_DIR), entries[0])
            os.stat(first)
        logger.info(f"[DriveWake] Music drive wake-up triggered ({len(entries)} top-level entries).")
    except Exception as e:
        logger.warning(f"[DriveWake] Failed to wake music drive: {e}")


@router.get("/wake", summary="Wake the music storage drive")
async def wake_drive():
    """Lightweight endpoint that triggers an HDD spin-up in a background thread.
    Returns immediately (< 5ms) so the frontend is never blocked.
    The actual disk I/O happens asynchronously."""
    threading.Thread(target=_wake_drive_sync, daemon=True, name="DriveWake").start()
    return Response(status_code=204)

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
                "X-Accel-Buffering": "no",
                "Cache-Control": "public, max-age=86400, no-transform",
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
        "X-Accel-Buffering": "no",
        "Cache-Control": "public, max-age=86400, no-transform",
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


def get_spotify_sp_dc() -> Optional[str]:
    """Retrieve configured sp_dc cookie from DB user preferences or environment."""
    env_sp_dc = os.getenv("SPOTIFY_SP_DC", "").strip()
    if env_sp_dc:
        return env_sp_dc
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT preferences FROM users WHERE preferences LIKE '%spotify_sp_dc%' ORDER BY id ASC LIMIT 1")
            row = cursor.fetchone()
            if row and row["preferences"]:
                prefs = json.loads(row["preferences"])
                sp_dc = prefs.get("spotify_sp_dc", "").strip()
                if sp_dc:
                    return sp_dc
    except Exception:
        pass
    return None


def lookup_spotify_canvas(artist: str, title: str, sp_dc: Optional[str] = None) -> Optional[dict]:
    """Search Spotify for track and retrieve official Spotify Canvas MP4 loop."""
    if not sp_dc:
        return None
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient(cookies={"sp_dc": sp_dc})
        clean_art = re.sub(r'[\(\[].*?[\)\]]', '', artist).strip()
        clean_tit = re.sub(r'[\(\[].*?[\)\]]', '', title).strip()
        query = f"{clean_art} {clean_tit}".strip()
        res = client.search(query)
        if res and hasattr(res, "tracks") and res.tracks:
            top_track = res.tracks[0]
            spotify_track_id = top_track.id
            canvas = client.get_canvas(spotify_track_id)
            if canvas and canvas.url:
                artist_name = artist
                if getattr(top_track, "artists", None) and len(top_track.artists) > 0:
                    artist_name = top_track.artists[0].name
                return {
                    "visual_type": "canvas",
                    "canvas_url": canvas.url,
                    "spotify_track_id": spotify_track_id,
                    "youtube_id": None,
                    "video_title": f"{top_track.name} (Spotify Canvas)",
                    "channel_name": artist_name,
                    "duration_seconds": 0.0,
                }
    except Exception as e:
        logger.warning(f"[SpotifyCanvas] Error fetching canvas for '{artist} - {title}': {e}")
    return None


def lookup_youtube_video(artist: str, title: str) -> Optional[dict]:
    """Search YouTube for the official music video using yt-dlp flat search."""
    import yt_dlp
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "no_warnings": True,
        "socket_timeout": 8,
    }
    # Clean up parenthetical annotations like "(Remastered 2011)" or "[Official Audio]"
    clean_artist = re.sub(r'[\(\[].*?[\)\]]', '', artist).strip()
    clean_title = re.sub(r'[\(\[].*?[\)\]]', '', title).strip()

    queries = [
        f"ytsearch1:{clean_artist} {clean_title} official music video",
        f"ytsearch1:{clean_artist} {clean_title} official video",
        f"ytsearch1:{clean_artist} {clean_title}"
    ]

    for q in queries:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.extract_info(q, download=False)
                if res and "entries" in res and len(res["entries"]) > 0:
                    entry = res["entries"][0]
                    vid_id = entry.get("id")
                    if vid_id and len(vid_id) == 11:
                        return {
                            "visual_type": "youtube",
                            "canvas_url": None,
                            "spotify_track_id": None,
                            "youtube_id": vid_id,
                            "video_title": entry.get("title") or f"{artist} - {title}",
                            "channel_name": entry.get("channel") or entry.get("uploader") or "",
                            "duration_seconds": float(entry.get("duration") or 0.0),
                        }
        except Exception as e:
            logger.warning(f"[VideoLookup] Error searching '{q}': {e}")
            continue
    return None


def resolve_track_visual(artist: str, title: str, sp_dc: Optional[str] = None) -> Optional[dict]:
    """Hybrid visual resolver: Tier 1 Spotify Canvas -> Tier 2 YouTube Official Video."""
    # 1. Tier 1: Spotify Canvas (looping visualizer)
    if sp_dc:
        canvas_result = lookup_spotify_canvas(artist, title, sp_dc)
        if canvas_result:
            return canvas_result

    # 2. Tier 2: YouTube official video (synced visualizer)
    yt_result = lookup_youtube_video(artist, title)
    if yt_result:
        return yt_result

    return None


@router.get("/tracks/{track_id}/visualizer.mp4")
async def get_visualizer_clip(track_id: int):
    """Serve cached lightweight MP4 visualizer clip for a track."""
    clip_path = VISUALIZERS_DIR / f"{track_id}.mp4"
    if not clip_path.exists() or clip_path.stat().st_size < 1000:
        raise HTTPException(status_code=404, detail="Visualizer clip not available yet")
    return FileResponse(
        str(clip_path),
        media_type="video/mp4",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/visualizers/status")
async def get_visualizer_crawler_status():
    """Retrieve visualizer library auto-crawler progress and storage stats."""
    from app.visualizer_crawler import visualizer_crawler
    return visualizer_crawler.get_status()


@router.get("/tracks/{track_id}/video")
async def get_track_video(track_id: int):
    """Retrieve or discover visualizer (Spotify Canvas loop or YouTube video clip) for a track."""
    from app.visualizer_crawler import visualizer_crawler, download_canvas_clip

    clip_file = VISUALIZERS_DIR / f"{track_id}.mp4"

    # 1. Fast path: clip already cached on disk
    if clip_file.exists() and clip_file.stat().st_size > 10000:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM track_videos WHERE track_id = ?", (track_id,))
            cached = cursor.fetchone()

        v_type = cached["visual_type"] if (cached and cached["visual_type"]) else "clip"
        sp_id = cached["spotify_track_id"] if cached and "spotify_track_id" in cached.keys() else None
        yt_id = cached["youtube_id"] if cached else None
        v_title = cached["video_title"] if cached else None
        ch_name = cached["channel_name"] if cached else None
        dur = cached["duration_seconds"] if cached else 0.0

        return {
            "track_id": track_id,
            "type": v_type,
            "video_url": f"/api/tracks/{track_id}/visualizer.mp4",
            "canvas_url": None,
            "spotify_track_id": sp_id,
            "video_id": yt_id,
            "video_title": v_title,
            "channel_name": ch_name,
            "duration_seconds": dur,
            "available": True,
        }

    # 2. Check database cache
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM track_videos WHERE track_id = ?", (track_id,))
        cached = cursor.fetchone()

        if cached:
            avail = bool(cached["available"])
            if not avail:
                return {
                    "track_id": track_id,
                    "type": "none",
                    "video_url": None,
                    "available": False,
                }

            canvas_url = cached["canvas_url"] if "canvas_url" in cached.keys() else None
            spotify_track_id = cached["spotify_track_id"] if "spotify_track_id" in cached.keys() else None
            youtube_id = cached["youtube_id"]
            visual_type = cached["visual_type"] if "visual_type" in cached.keys() and cached["visual_type"] else ("canvas" if canvas_url else "youtube")

            # If Canvas: download immediately (~0.3s) so it's ready on first hit
            if visual_type == "canvas" and canvas_url:
                loop = asyncio.get_running_loop()
                success = await loop.run_in_executor(None, download_canvas_clip, track_id, canvas_url)
                video_url = f"/api/tracks/{track_id}/visualizer.mp4" if (success or clip_file.exists()) else canvas_url
                return {
                    "track_id": track_id,
                    "type": "canvas",
                    "video_url": video_url,
                    "canvas_url": canvas_url,
                    "spotify_track_id": spotify_track_id,
                    "video_id": None,
                    "video_title": cached["video_title"],
                    "channel_name": cached["channel_name"],
                    "duration_seconds": cached["duration_seconds"],
                    "available": True,
                }
            elif youtube_id:
                # Queue high priority for crawler
                visualizer_crawler.queue_high_priority(track_id)
                return {
                    "track_id": track_id,
                    "type": "clip",
                    "video_url": None,
                    "canvas_url": None,
                    "spotify_track_id": None,
                    "video_id": youtube_id,
                    "video_title": cached["video_title"],
                    "channel_name": cached["channel_name"],
                    "duration_seconds": cached["duration_seconds"],
                    "available": False,
                    "status": "processing",
                }

        # 3. If not in DB, get track metadata and resolve
        cursor.execute("""
            SELECT t.id, t.title, t.duration_seconds, ar.name AS artist_name
            FROM tracks t
            JOIN artists ar ON t.artist_id = ar.id
            WHERE t.id = ?
        """, (track_id,))
        track = cursor.fetchone()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    sp_dc = get_spotify_sp_dc()
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        resolve_track_visual,
        track["artist_name"],
        track["title"],
        sp_dc
    )

    with get_db() as conn:
        if result and (result.get("canvas_url") or result.get("youtube_id")):
            conn.execute("""
                INSERT OR REPLACE INTO track_videos 
                (track_id, visual_type, canvas_url, spotify_track_id, youtube_id, video_title, channel_name, duration_seconds, available)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                track_id,
                result.get("visual_type", "youtube"),
                result.get("canvas_url"),
                result.get("spotify_track_id"),
                result.get("youtube_id"),
                result.get("video_title"),
                result.get("channel_name"),
                result.get("duration_seconds", 0.0)
            ))

            v_type = result.get("visual_type", "youtube")
            canvas_url = result.get("canvas_url")
            youtube_id = result.get("youtube_id")

            if v_type == "canvas" and canvas_url:
                success = await loop.run_in_executor(None, download_canvas_clip, track_id, canvas_url)
                video_url = f"/api/tracks/{track_id}/visualizer.mp4" if (success or clip_file.exists()) else canvas_url
                return {
                    "track_id": track_id,
                    "type": "canvas",
                    "video_url": video_url,
                    "canvas_url": canvas_url,
                    "spotify_track_id": result.get("spotify_track_id"),
                    "video_id": None,
                    "video_title": result.get("video_title"),
                    "channel_name": result.get("channel_name"),
                    "duration_seconds": result.get("duration_seconds", 0.0),
                    "available": True,
                }
            elif youtube_id:
                visualizer_crawler.queue_high_priority(track_id)
                return {
                    "track_id": track_id,
                    "type": "clip",
                    "video_url": None,
                    "canvas_url": None,
                    "spotify_track_id": None,
                    "video_id": youtube_id,
                    "video_title": result.get("video_title"),
                    "channel_name": result.get("channel_name"),
                    "duration_seconds": result.get("duration_seconds", 0.0),
                    "available": False,
                    "status": "processing",
                }
        else:
            conn.execute("""
                INSERT OR REPLACE INTO track_videos 
                (track_id, visual_type, canvas_url, spotify_track_id, youtube_id, video_title, channel_name, duration_seconds, available)
                VALUES (?, 'none', NULL, NULL, NULL, NULL, NULL, 0.0, 0)
            """, (track_id,))
            return {
                "track_id": track_id,
                "type": "none",
                "video_url": None,
                "canvas_url": None,
                "spotify_track_id": None,
                "video_id": None,
                "video_title": None,
                "channel_name": None,
                "duration_seconds": 0.0,
                "available": False,
            }
