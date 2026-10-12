import os
import io
import time
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from PIL import Image
import mutagen
from mutagen.flac import FLAC
from mutagen.id3 import ID3, APIC
from mutagen.mp4 import MP4

from app.config import MUSIC_DIR, COVERS_DIR, SUPPORTED_EXTENSIONS, COVER_FILENAMES
from app.database import get_db, init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("music_scanner")

def get_album_hash(artist_name: str, album_title: str) -> str:
    key = f"{artist_name.strip()}::{album_title.strip()}".lower().encode("utf-8")
    return hashlib.sha256(key).hexdigest()[:16]

def save_cover_image(image_bytes: bytes, album_hash: str) -> Optional[str]:
    """Resize and save cover art as JPEG in COVERS_DIR."""
    try:
        cover_path = COVERS_DIR / f"{album_hash}.jpg"
        if cover_path.exists():
            return str(cover_path)

        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            img.thumbnail((600, 600), Image.Resampling.LANCZOS)
            img.save(str(cover_path), format="JPEG", quality=85, optimize=True)
            return str(cover_path)
    except Exception as e:
        logger.debug(f"Failed to process cover image for {album_hash}: {e}")
        return None

def extract_embedded_cover(audio_file: Any) -> Optional[bytes]:
    """Attempt to extract embedded cover artwork bytes from mutagen file object."""
    try:
        # 1. FLAC
        if isinstance(audio_file, FLAC) and audio_file.pictures:
            for pic in audio_file.pictures:
                if pic.type == 3:  # Front cover
                    return pic.data
            return audio_file.pictures[0].data

        # 2. MP3 with ID3 tags
        if hasattr(audio_file, "tags") and audio_file.tags:
            for key in audio_file.tags.keys():
                if key.startswith("APIC"):
                    frame = audio_file.tags[key]
                    if isinstance(frame, APIC):
                        return frame.data

        # 3. M4A / MP4
        if isinstance(audio_file, MP4) and audio_file.tags:
            covr = audio_file.tags.get("covr")
            if covr and len(covr) > 0:
                return bytes(covr[0])
    except Exception as e:
        logger.debug(f"Error extracting embedded cover: {e}")

    return None

def find_folder_cover(file_path: Path) -> Optional[bytes]:
    """Look for cover.jpg, folder.jpg in the track's directory."""
    parent_dir = file_path.parent
    for fname in COVER_FILENAMES:
        cand = parent_dir / fname
        if cand.exists() and cand.is_file():
            try:
                return cand.read_bytes()
            except Exception:
                pass
    return None

def parse_audio_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Extract metadata, duration, and cover art from an audio file."""
    try:
        audio = mutagen.File(str(file_path))
        if audio is None:
            return None

        stat = file_path.stat()
        file_ext = file_path.suffix.lower()

        title = None
        artist = None
        album = None
        track_number = 1
        disc_number = 1
        year = None

        duration = getattr(audio.info, "length", 0.0) if audio.info else 0.0
        bitrate = getattr(audio.info, "bitrate", None) if audio.info else None

        # Tags parsing
        if isinstance(audio, FLAC):
            artist = audio.get("artist", [None])[0] or audio.get("albumartist", [None])[0]
            title = audio.get("title", [None])[0]
            album = audio.get("album", [None])[0]
            raw_trkn = audio.get("tracknumber", [None])[0]
            if raw_trkn:
                try:
                    track_number = int(str(raw_trkn).split("/")[0])
                except ValueError:
                    track_number = 1
            raw_disc = audio.get("discnumber", [None])[0]
            if raw_disc:
                try:
                    disc_number = int(str(raw_disc).split("/")[0])
                except ValueError:
                    disc_number = 1
            raw_date = audio.get("date", [None])[0] or audio.get("year", [None])[0]
            if raw_date and len(str(raw_date)) >= 4:
                try:
                    year = int(str(raw_date)[:4])
                except ValueError:
                    pass

        elif isinstance(audio, MP4):
            tags = audio.tags or {}
            title = tags.get("\xa9nam", [None])[0]
            artist = tags.get("\xa9ART", [None])[0] or tags.get("aART", [None])[0]
            album = tags.get("\xa9alb", [None])[0]
            trkn = tags.get("trkn", [(1, 0)])[0]
            track_number = trkn[0] if isinstance(trkn, tuple) else 1
            disc = tags.get("disk", [(1, 0)])[0]
            disc_number = disc[0] if isinstance(disc, tuple) else 1
            raw_date = tags.get("\xa9day", [None])[0]
            if raw_date and len(str(raw_date)) >= 4:
                try:
                    year = int(str(raw_date)[:4])
                except ValueError:
                    pass

        else:
            # ID3 / MP3 / Generic
            tags = getattr(audio, "tags", None)
            if tags:
                # EasyID3 or standard ID3
                title = str(tags.get("TIT2", [tags.get("title", [""])[0]])[0]) if "TIT2" in tags or "title" in tags else None
                artist = str(tags.get("TPE1", [tags.get("artist", [""])[0]])[0]) if "TPE1" in tags or "artist" in tags else None
                album = str(tags.get("TALB", [tags.get("album", [""])[0]])[0]) if "TALB" in tags or "album" in tags else None
                raw_trkn = tags.get("TRCK", [tags.get("tracknumber", ["1"])[0]])[0] if "TRCK" in tags or "tracknumber" in tags else None
                if raw_trkn:
                    try:
                        track_number = int(str(raw_trkn).split("/")[0])
                    except ValueError:
                        track_number = 1
                raw_disc = tags.get("TPOS", [tags.get("discnumber", ["1"])[0]])[0] if "TPOS" in tags or "discnumber" in tags else None
                if raw_disc:
                    try:
                        disc_number = int(str(raw_disc).split("/")[0])
                    except ValueError:
                        disc_number = 1
                raw_year = tags.get("TDRC", [tags.get("TYER", [tags.get("date", [""])])[0]])[0] if any(k in tags for k in ["TDRC", "TYER", "date"]) else None
                if raw_year and len(str(raw_year)) >= 4:
                    try:
                        year = int(str(raw_year)[:4])
                    except ValueError:
                        pass

        # Clean fallback values
        if not title or not str(title).strip():
            title = file_path.stem
        else:
            title = str(title).strip()

        if not artist or not str(artist).strip():
            # Use parent directory name if artist tag is missing
            artist = file_path.parent.parent.name if file_path.parent.parent != MUSIC_DIR else file_path.parent.name
            if not artist or artist == "." or artist == "Music":
                artist = "Unknown Artist"
        else:
            artist = str(artist).strip()

        if not album or not str(album).strip():
            album = file_path.parent.name
            if not album or album == "." or album == "Music":
                album = "Unknown Album"
        else:
            album = str(album).strip()

        # Cover image
        album_hash = get_album_hash(artist, album)
        cover_path = COVERS_DIR / f"{album_hash}.jpg"
        cover_str = str(cover_path) if cover_path.exists() else None

        if not cover_str:
            img_bytes = extract_embedded_cover(audio) or find_folder_cover(file_path)
            if img_bytes:
                cover_str = save_cover_image(img_bytes, album_hash)

        return {
            "title": title,
            "artist": artist,
            "album": album,
            "track_number": track_number,
            "disc_number": disc_number,
            "year": year,
            "duration": round(float(duration), 2),
            "bitrate": int(bitrate) if bitrate else None,
            "file_path": str(file_path),
            "file_format": file_ext.replace(".", ""),
            "file_size": stat.st_size,
            "mtime": stat.st_mtime,
            "cover_path": cover_str,
        }

    except Exception as e:
        logger.warning(f"Error reading {file_path.name}: {e}")
        return None

def scan_music_library() -> Dict[str, Any]:
    """Scan the entire music directory and update SQLite incrementally."""
    init_db()
    start_time = time.time()
    logger.info(f"Starting library scan in: {MUSIC_DIR}")

    with get_db() as conn:
        # Load existing tracks for fast incremental check
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, mtime FROM tracks")
        existing_tracks = {row["file_path"]: row["mtime"] for row in cursor.fetchall()}

        active_file_paths = set()
        added_count = 0
        updated_count = 0
        unchanged_count = 0
        error_count = 0

        # Cache for artist and album IDs during this scan run
        cursor.execute("SELECT id, name FROM artists")
        artist_cache = {row["name"].lower(): row["id"] for row in cursor.fetchall()}

        cursor.execute("SELECT id, title, artist_id FROM albums")
        album_cache = {(row["title"].lower(), row["artist_id"]): row["id"] for row in cursor.fetchall()}
        conn.commit()

        for root, _, files in os.walk(MUSIC_DIR):
            for file in files:
                file_path = Path(root) / file
                if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue

                full_path_str = str(file_path)
                active_file_paths.add(full_path_str)

                try:
                    stat = file_path.stat()
                except OSError:
                    continue

                # Check if file has changed
                if full_path_str in existing_tracks:
                    if abs(stat.st_mtime - existing_tracks[full_path_str]) < 0.01:
                        unchanged_count += 1
                        continue

                # File is new or modified: parse tags
                data = parse_audio_file(file_path)
                if not data:
                    error_count += 1
                    continue

                # 1. Resolve Artist
                artist_key = data["artist"].lower()
                if artist_key in artist_cache:
                    artist_id = artist_cache[artist_key]
                else:
                    cursor.execute("INSERT OR IGNORE INTO artists (name) VALUES (?)", (data["artist"],))
                    cursor.execute("SELECT id FROM artists WHERE name = ? COLLATE NOCASE", (data["artist"],))
                    artist_id = cursor.fetchone()["id"]
                    artist_cache[artist_key] = artist_id

                # 2. Resolve Album
                album_key = (data["album"].lower(), artist_id)
                if album_key in album_cache:
                    album_id = album_cache[album_key]
                    if data["cover_path"]:
                        cursor.execute("UPDATE albums SET cover_path = ? WHERE id = ? AND cover_path IS NULL",
                                       (data["cover_path"], album_id))
                else:
                    cursor.execute("""
                        INSERT INTO albums (title, artist_id, year, cover_path)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(title, artist_id) DO UPDATE SET
                            year = COALESCE(excluded.year, albums.year),
                            cover_path = COALESCE(excluded.cover_path, albums.cover_path)
                    """, (data["album"], artist_id, data["year"], data["cover_path"]))
                    cursor.execute("SELECT id FROM albums WHERE title = ? AND artist_id = ?", (data["album"], artist_id))
                    album_id = cursor.fetchone()["id"]
                    album_cache[album_key] = album_id

                # 3. Upsert Track
                cursor.execute("""
                    INSERT INTO tracks (
                        title, artist_id, album_id, track_number, disc_number,
                        duration_seconds, file_path, file_format, file_size, bitrate, mtime
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(file_path) DO UPDATE SET
                        title = excluded.title,
                        artist_id = excluded.artist_id,
                        album_id = excluded.album_id,
                        track_number = excluded.track_number,
                        disc_number = excluded.disc_number,
                        duration_seconds = excluded.duration_seconds,
                        file_format = excluded.file_format,
                        file_size = excluded.file_size,
                        bitrate = excluded.bitrate,
                        mtime = excluded.mtime
                """, (
                    data["title"], artist_id, album_id, data["track_number"], data["disc_number"],
                    data["duration"], full_path_str, data["file_format"], data["file_size"],
                    data["bitrate"], data["mtime"]
                ))

                if full_path_str in existing_tracks:
                    updated_count += 1
                else:
                    added_count += 1

                if (added_count + updated_count) % 50 == 0:
                    conn.commit()

        # Delete removed files from database
        deleted_count = 0
        missing_paths = set(existing_tracks.keys()) - active_file_paths
        for missing_path in missing_paths:
            cursor.execute("DELETE FROM tracks WHERE file_path = ?", (missing_path,))
            deleted_count += 1

        # Clean up empty albums and artists
        cursor.execute("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)")
        cursor.execute("DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)")

        # Record scan run in history
        elapsed = round(time.time() - start_time, 2)
        cursor.execute("""
            INSERT INTO scan_runs (completed_at, total_files, added_tracks, updated_tracks, deleted_tracks, status)
            VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, 'success')
        """, (len(active_file_paths), added_count, updated_count, deleted_count))

    summary = {
        "total_files": len(active_file_paths),
        "added": added_count,
        "updated": updated_count,
        "unchanged": unchanged_count,
        "deleted": deleted_count,
        "errors": error_count,
        "elapsed_seconds": elapsed,
    }
    logger.info(f"Scan complete in {elapsed}s: {added_count} added, {unchanged_count} unchanged, {updated_count} updated, {deleted_count} removed.")
    return summary
