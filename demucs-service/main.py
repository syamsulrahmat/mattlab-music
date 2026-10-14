import os
import sys
import time
import shutil
import logging
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DemucsService] %(message)s"
)
logger = logging.getLogger("demucs")

app = FastAPI(title="Demucs AI Stem Separation Microservice")

KARAOKE_DIR = Path(os.environ.get("KARAOKE_DIR", "/karaoke"))
KARAOKE_DIR.mkdir(parents=True, exist_ok=True)

class SeparationRequest(BaseModel):
    track_id: int
    file_path: str

# In-memory job state: track_id -> dict
# Status: "queued" | "processing" | "completed" | "failed"
jobs: Dict[int, Dict[str, Any]] = {}
queue_lock = asyncio.Lock()
task_queue: asyncio.Queue = asyncio.Queue()

def stems_exist(track_id: int) -> bool:
    track_dir = KARAOKE_DIR / str(track_id)
    inst = track_dir / "instrumental.mp3"
    voc = track_dir / "vocals.mp3"
    return inst.exists() and voc.exists() and inst.stat().st_size > 1024 and voc.stat().st_size > 1024

def process_separation_sync(track_id: int, file_path_str: str):
    """Synchronously run Demucs separation and convert to MP3 stems."""
    input_path = Path(file_path_str)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path_str}")

    target_dir = KARAOKE_DIR / str(track_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    temp_work_dir = Path(f"/tmp/demucs_work_{track_id}_{int(time.time())}")
    temp_work_dir.mkdir(parents=True, exist_ok=True)

    try:
        logger.info(f"Starting Demucs separation for track {track_id}: {input_path.name}")
        start_time = time.time()

        # Run demucs with nice -n 15 for polite CPU scheduling
        cmd = [
            "nice", "-n", "15",
            "demucs",
            "--two-stems=vocals",
            "-d", "cpu",
            "-o", str(temp_work_dir),
            str(input_path)
        ]
        
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=True
        )
        elapsed = time.time() - start_time
        logger.info(f"Demucs inference finished in {elapsed:.1f}s for track {track_id}")

        # Locate output WAV stems
        # Demucs places files at: temp_work_dir/htdemucs/<track_stem>/no_vocals.wav and vocals.wav
        htdemucs_dir = temp_work_dir / "htdemucs"
        found_folders = [f for f in htdemucs_dir.iterdir() if f.is_dir()]
        if not found_folders:
            raise RuntimeError(f"No Demucs output directory found in {htdemucs_dir}")

        stem_folder = found_folders[0]
        no_vocals_wav = stem_folder / "no_vocals.wav"
        vocals_wav = stem_folder / "vocals.wav"

        if not no_vocals_wav.exists() or not vocals_wav.exists():
            raise RuntimeError(f"Missing separated stem files in {stem_folder}")

        # Encode to high-quality 320k MP3
        inst_mp3 = target_dir / "instrumental.mp3"
        voc_mp3 = target_dir / "vocals.mp3"

        ffmpeg_cmd_inst = [
            "ffmpeg", "-y", "-i", str(no_vocals_wav),
            "-b:a", "320k", str(inst_mp3)
        ]
        subprocess.run(ffmpeg_cmd_inst, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        ffmpeg_cmd_voc = [
            "ffmpeg", "-y", "-i", str(vocals_wav),
            "-b:a", "320k", str(voc_mp3)
        ]
        subprocess.run(ffmpeg_cmd_voc, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        logger.info(f"Stems successfully saved for track {track_id} in {target_dir}")
        return True

    finally:
        # Always clean up temporary uncompressed wav files
        shutil.rmtree(temp_work_dir, ignore_errors=True)

async def worker_loop():
    """Background consumer that processes separation tasks one at a time."""
    logger.info("Demucs worker loop started")
    while True:
        try:
            track_id, file_path_str = await task_queue.get()
            jobs[track_id] = {
                "status": "processing",
                "started_at": time.time(),
                "error": None
            }

            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(None, process_separation_sync, track_id, file_path_str)
                jobs[track_id] = {
                    "status": "completed",
                    "completed_at": time.time(),
                    "error": None
                }
            except Exception as e:
                logger.error(f"Separation failed for track {track_id}: {e}", exc_info=True)
                jobs[track_id] = {
                    "status": "failed",
                    "failed_at": time.time(),
                    "error": str(e)
                }
            finally:
                task_queue.task_done()
        except Exception as e:
            logger.error(f"Worker loop error: {e}", exc_info=True)
            await asyncio.sleep(1)

@app.on_event("startup")
async def on_startup():
    asyncio.create_task(worker_loop())

@app.get("/health")
def health():
    return {"status": "ok", "service": "demucs-sidecar"}

@app.get("/status/{track_id}")
def get_status(track_id: int):
    # If files exist on disk, it's completed
    if stems_exist(track_id):
        return {
            "track_id": track_id,
            "exists": True,
            "status": "completed",
            "progress": 100
        }

    job = jobs.get(track_id)
    if not job:
        return {
            "track_id": track_id,
            "exists": False,
            "status": "idle",
            "progress": 0
        }

    return {
        "track_id": track_id,
        "exists": False,
        "status": job.get("status", "idle"),
        "error": job.get("error"),
        "progress": 50 if job.get("status") == "processing" else 0
    }

@app.post("/separate")
async def separate_track(req: SeparationRequest):
    track_id = req.track_id
    if stems_exist(track_id):
        return {
            "track_id": track_id,
            "status": "completed",
            "message": "Stems already exist on disk"
        }

    current_job = jobs.get(track_id)
    if current_job and current_job.get("status") in ("queued", "processing"):
        return {
            "track_id": track_id,
            "status": current_job["status"],
            "message": f"Track is already {current_job['status']}"
        }

    jobs[track_id] = {
        "status": "queued",
        "queued_at": time.time(),
        "error": None
    }
    await task_queue.put((track_id, req.file_path))
    logger.info(f"Enqueued separation for track {track_id}. Queue size: {task_queue.qsize()}")

    return {
        "track_id": track_id,
        "status": "queued",
        "queue_position": task_queue.qsize()
    }
