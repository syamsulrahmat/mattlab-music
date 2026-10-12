from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routes import stream, library, scan, playlists, lyrics, request_music

app = FastAPI(
    title="MattLab Music App API",
    description="Clean, lightweight streaming backend for personal Unraid music library",
    version="1.0.0",
)

# Allow all origins for dev and remote PWA access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    request_music.start_auto_import_watcher()

# Mount routers
app.include_router(stream.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(scan.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(lyrics.router, prefix="/api")
app.include_router(request_music.router, prefix="/api")

from pydantic import BaseModel

class ClientError(BaseModel):
    type: str = ""
    message: str = ""
    stack: str = ""

@app.post("/api/client-error")
def client_error_endpoint(data: ClientError):
    print(f"\n🔥🔥🔥 [BROWSER ERROR] Type: {data.type}\nMessage: {data.message}\nStack: {data.stack}\n", flush=True)
    return {"status": "ok"}

from pathlib import Path
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path("/app/frontend_dist")
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/")
    def index():
        return {"status": "ok", "app": "MattLab Music App API", "frontend": "run dev server on port 3000"}
