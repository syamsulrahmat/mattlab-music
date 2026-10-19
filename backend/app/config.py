import os
from pathlib import Path

MUSIC_DIR = Path(os.getenv("MUSIC_DIR", "/music"))
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "music.db")))
COVERS_DIR = Path(os.getenv("COVERS_DIR", str(DATA_DIR / "covers")))
AVATARS_DIR = Path(os.getenv("AVATARS_DIR", str(DATA_DIR / "avatars")))
TRANSCODES_DIR = Path(os.getenv("TRANSCODES_DIR", str(DATA_DIR / "transcodes")))
VISUALIZERS_DIR = Path(os.getenv("VISUALIZERS_DIR", str(DATA_DIR / "visualizers")))

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav"}
COVER_FILENAMES = {"cover.jpg", "cover.png", "cover.jpeg", "folder.jpg", "folder.png", "front.jpg", "front.png"}

# Ensure required directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
COVERS_DIR.mkdir(parents=True, exist_ok=True)
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
TRANSCODES_DIR.mkdir(parents=True, exist_ok=True)
VISUALIZERS_DIR.mkdir(parents=True, exist_ok=True)
