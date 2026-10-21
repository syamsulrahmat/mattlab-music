from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.database import init_db
from app.auth import get_user_from_request, get_user_count
from app.routes import stream, library, scan, playlists, lyrics, request_music, auth_routes, spotify_sync, karaoke, bug_reports

app = FastAPI(
    title="MattLab Music App API",
    description="Clean, lightweight streaming backend for personal Unraid music library",
    version="1.0.0",
)

# Allow origins for dev and remote PWA access
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",  # Allow any origin with credentials
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    request_music.start_auto_import_watcher()
    spotify_sync.start_scheduled_spotify_watcher()
    from app.lyrics_fetcher import start_background_lyrics_fetcher
    start_background_lyrics_fetcher()
    from app.visualizer_crawler import start_background_visualizer_crawler
    start_background_visualizer_crawler()
    # Pre-wake the music drive on container startup so it's spinning
    # before any client connects (eliminates HDD cold-start delay)
    from app.routes.stream import _wake_drive_sync
    import threading
    threading.Thread(target=_wake_drive_sync, daemon=True, name="StartupDriveWake").start()

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Global API authentication middleware."""
    # Allow non-API routes (static frontend HTML, CSS, JS, favicons, etc.)
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    # Allow CORS preflight requests
    if request.method == "OPTIONS":
        return await call_next(request)

    # Whitelisted public API endpoints
    public_paths = {
        "/api/auth/status",
        "/api/auth/setup",
        "/api/auth/login",
        "/api/client-error",
        "/api/covers-sample",
        "/api/wake",
    }
    if (
        request.url.path in public_paths
        or request.url.path.startswith("/api/avatars/")
        or request.url.path.startswith("/api/covers/")
        or request.url.path.startswith("/api/visualizers/")
        or request.url.path.endswith("/visualizer.mp4")
    ):
        return await call_next(request)

    # Check authentication
    user = get_user_from_request(request)
    if not user:
        if get_user_count() == 0:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Initial setup required", "setup_required": True},
            )
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Authentication required", "authenticated": False},
        )

    # Store user in request state
    request.state.user = user

    # Restrict system management endpoints to Admin
    if request.url.path.startswith("/api/scan") and user.get("role") != "admin":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Admin privileges required"},
        )

    if request.url.path.startswith("/api/request") and user.get("role") != "admin":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Admin privileges required to manage music downloads"},
        )

    if request.url.path.startswith("/api/lyrics/control") and user.get("role") != "admin":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Admin privileges required to manage lyrics background crawler"},
        )

    return await call_next(request)

# Mount routers
app.include_router(auth_routes.router, prefix="/api")
app.include_router(auth_routes.avatar_router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(scan.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(lyrics.router, prefix="/api")
app.include_router(request_music.router, prefix="/api")
app.include_router(spotify_sync.router, prefix="/api")
app.include_router(karaoke.router, prefix="/api")
app.include_router(bug_reports.router, prefix="/api")

class ClientError(BaseModel):
    type: str = ""
    message: str = ""
    stack: str = ""

@app.post("/api/client-error")
def client_error_endpoint(data: ClientError):
    print(f"\n🔥🔥🔥 [BROWSER ERROR] Type: {data.type}\nMessage: {data.message}\nStack: {data.stack}\n", flush=True)
    return {"status": "ok"}

FRONTEND_DIST = Path("/app/frontend_dist")
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/")
    def index():
        return {"status": "ok", "app": "MattLab Music App API", "frontend": "run dev server on port 3000"}
