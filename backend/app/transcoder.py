import asyncio
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Tuple

from app.config import TRANSCODES_DIR

logger = logging.getLogger("transcoder")
logger.setLevel(logging.INFO)

# In-flight locks to ensure only one ffmpeg process runs per track at any given moment
_transcode_locks: Dict[Tuple[int, str], asyncio.Lock] = {}
_lock_management_lock = asyncio.Lock()


async def _get_track_lock(track_id: int, bitrate: str) -> asyncio.Lock:
    key = (track_id, bitrate)
    async with _lock_management_lock:
        if key not in _transcode_locks:
            _transcode_locks[key] = asyncio.Lock()
        return _transcode_locks[key]


async def get_or_create_transcoded_track(
    track_id: int,
    source_path: Path,
    target_bitrate: str = "128k"
) -> Path:
    """
    Retrieve an existing transcoded MP3 for a track, or transcode it on-demand via FFmpeg.
    Returns the Path to the ready-to-stream transcoded MP3.
    """
    TRANSCODES_DIR.mkdir(parents=True, exist_ok=True)
    target_file = TRANSCODES_DIR / f"{track_id}_{target_bitrate}.mp3"
    temp_file = TRANSCODES_DIR / f"{track_id}_{target_bitrate}.tmp"

    # Fast path: already transcoded and non-empty
    if target_file.exists() and target_file.stat().st_size > 1024:
        return target_file

    lock = await _get_track_lock(track_id, target_bitrate)
    async with lock:
        # Check again under lock in case another worker just finished it
        if target_file.exists() and target_file.stat().st_size > 1024:
            return target_file

        if not source_path.exists():
            raise FileNotFoundError(f"Source audio file not found: {source_path}")

        logger.info(f"[Transcoder] Starting on-demand {target_bitrate} transcode for track {track_id}: {source_path.name}")

        def _run_ffmpeg():
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(source_path),
                "-c:a", "libmp3lame",
                "-b:a", target_bitrate,
                "-compression_level", "5",
                "-threads", "4",
                "-map_metadata", "0",
                "-id3v2_version", "3",
                "-f", "mp3",
                str(temp_file),
            ]
            result = subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False
            )
            if result.returncode != 0:
                err_msg = result.stderr.decode("utf-8", errors="replace")
                logger.error(f"[Transcoder] FFmpeg failed on track {track_id}: {err_msg[:300]}")
                if temp_file.exists():
                    temp_file.unlink(missing_ok=True)
                raise RuntimeError(f"FFmpeg transcode failed with return code {result.returncode}")

            temp_file.replace(target_file)
            logger.info(f"[Transcoder] Finished transcode for track {track_id} -> {target_file.name} ({target_file.stat().st_size} bytes)")

        await asyncio.to_thread(_run_ffmpeg)
        return target_file


def get_transcode_cache_stats() -> dict:
    """Return file count, total bytes, and megabytes of current transcode cache."""
    if not TRANSCODES_DIR.exists():
        return {"file_count": 0, "total_bytes": 0, "size_mb": 0.0}

    total_bytes = 0
    file_count = 0
    try:
        for entry in TRANSCODES_DIR.glob("*.mp3"):
            if entry.is_file():
                file_count += 1
                total_bytes += entry.stat().st_size
    except Exception as e:
        logger.warning(f"Error computing transcode cache stats: {e}")

    return {
        "file_count": file_count,
        "total_bytes": total_bytes,
        "size_mb": round(total_bytes / (1024 * 1024), 2),
    }


def clear_transcode_cache() -> dict:
    """Purge all transcoded audio files from server disk cache."""
    if not TRANSCODES_DIR.exists():
        return {"cleared_files": 0, "freed_bytes": 0, "freed_mb": 0.0}

    cleared = 0
    freed_bytes = 0
    for p in list(TRANSCODES_DIR.glob("*.*")):
        try:
            if p.is_file():
                size = p.stat().st_size
                p.unlink()
                cleared += 1
                freed_bytes += size
        except Exception as e:
            logger.warning(f"Could not remove {p}: {e}")

    logger.info(f"[Transcoder] Purged transcode cache: {cleared} files, {freed_bytes / (1024*1024):.2f} MB freed.")
    return {
        "cleared_files": cleared,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
    }
