from fastapi import APIRouter, BackgroundTasks
from app.scanner import scan_music_library
from app.database import get_db

router = APIRouter(tags=["Library Scanner"])

is_scanning = False

def run_scan_worker():
    global is_scanning
    is_scanning = True
    try:
        scan_music_library()
    finally:
        is_scanning = False

@router.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    """Trigger background library scan."""
    global is_scanning
    if is_scanning:
        return {"status": "already_running", "message": "A scan is already in progress"}

    background_tasks.add_task(run_scan_worker)
    return {"status": "started", "message": "Library scan started in background"}

@router.get("/scan/status")
async def get_scan_status():
    """Get the current scan state and latest run info."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1")
        last_run = cursor.fetchone()

    return {
        "is_scanning": is_scanning,
        "latest_run": dict(last_run) if last_run else None,
    }
