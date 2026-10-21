import os
import re
import json
import asyncio
import urllib.request
import urllib.error
from pathlib import Path
from typing import Generator, List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import get_db

router = APIRouter(prefix="/karaoke", tags=["AI Karaoke & Stems"])

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
KARAOKE_DIR = DATA_DIR / "karaoke"
KARAOKE_DIR.mkdir(parents=True, exist_ok=True)

DEMUCS_SERVICE_URL = os.environ.get("DEMUCS_SERVICE_URL", "http://demucs:8000").rstrip("/")

class BatchGenerateRequest(BaseModel):
    track_ids: List[int]

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

def check_stems_exist(track_id: int) -> bool:
    track_dir = KARAOKE_DIR / str(track_id)
    inst = track_dir / "instrumental.mp3"
    voc = track_dir / "vocals.mp3"
    return inst.exists() and voc.exists() and inst.stat().st_size > 1024 and voc.stat().st_size > 1024

def query_demucs_service(endpoint: str, method: str = "GET", payload: Optional[dict] = None) -> Dict[str, Any]:
    url = f"{DEMUCS_SERVICE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    headers = {"Content-Type": "application/json"} if payload else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except Exception as e:
        return {"error": str(e), "status": "unavailable"}

@router.get("/{track_id}/status")
async def get_karaoke_status(track_id: int):
    """
    Check if AI-separated stems are ready on disk, currently processing, or need generation.
    """
    if check_stems_exist(track_id):
        return {
            "track_id": track_id,
            "exists": True,
            "status": "ready",
            "progress": 100
        }

    # Query sidecar service for processing status
    res = await asyncio.to_thread(query_demucs_service, f"/status/{track_id}")
    status_val = res.get("status", "idle")
    if status_val == "completed":
        status_val = "ready"

    return {
        "track_id": track_id,
        "exists": False,
        "status": status_val,
        "progress": res.get("progress", 0),
        "error": res.get("error")
    }

@router.post("/{track_id}/generate")
async def generate_karaoke_stems(track_id: int):
    """
    Queue background AI stem separation for a specific track.
    """
    if check_stems_exist(track_id):
        return {
            "track_id": track_id,
            "exists": True,
            "status": "ready",
            "message": "Stems already generated and ready"
        }

    # Fetch track file path from database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = row["file_path"]

    res = await asyncio.to_thread(
        query_demucs_service,
        "/separate",
        method="POST",
        payload={"track_id": track_id, "file_path": file_path}
    )

    if "error" in res and res.get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=f"Demucs AI service unavailable: {res['error']}")

    return res

@router.post("/batch-generate")
async def batch_generate_karaoke(req: BatchGenerateRequest):
    """
    Queue multiple tracks for background stem separation (e.g. for a playlist).
    """
    queued = []
    already_ready = []

    for track_id in req.track_ids:
        if check_stems_exist(track_id):
            already_ready.append(track_id)
            continue

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
            row = cursor.fetchone()

        if row:
            res = await asyncio.to_thread(
                query_demucs_service,
                "/separate",
                method="POST",
                payload={"track_id": track_id, "file_path": row["file_path"]}
            )
            queued.append(track_id)

    return {
        "queued_count": len(queued),
        "queued_track_ids": queued,
        "already_ready_count": len(already_ready),
        "already_ready_track_ids": already_ready
    }

@router.get("/{track_id}/stream/{stem_type}")
async def stream_karaoke_stem(track_id: int, stem_type: str, request: Request):
    """
    Stream isolated audio stem (instrumental or vocals) with HTTP 206 Partial Content support.
    """
    if stem_type not in ("instrumental", "vocals"):
        raise HTTPException(status_code=400, detail="Invalid stem type. Must be 'instrumental' or 'vocals'")

    stem_file = KARAOKE_DIR / str(track_id) / f"{stem_type}.mp3"
    if not stem_file.exists():
        raise HTTPException(status_code=404, detail=f"Karaoke stem '{stem_type}' not found or not generated yet")

    file_size = stem_file.stat().st_size
    media_type = "audio/mpeg"

    range_header = request.headers.get("Range")
    if not range_header:
        return StreamingResponse(
            stream_file_chunks(stem_file, 0, file_size),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Disposition": f'inline; filename="{stem_file.name}"',
                "X-Accel-Buffering": "no",
                "Cache-Control": "public, max-age=86400, no-transform",
            },
        )

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
        stream_file_chunks(stem_file, start, content_length),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        headers=headers,
        media_type=media_type,
    )
