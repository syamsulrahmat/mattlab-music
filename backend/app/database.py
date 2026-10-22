import sqlite3
from typing import Generator
from contextlib import contextmanager
from app.config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 60000;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db() -> None:
    """Initialize database tables and indices if they do not exist."""
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            year INTEGER,
            cover_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(title, artist_id)
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            track_number INTEGER DEFAULT 1,
            disc_number INTEGER DEFAULT 1,
            duration_seconds REAL DEFAULT 0.0,
            file_path TEXT UNIQUE NOT NULL,
            file_format TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            bitrate INTEGER,
            mtime REAL NOT NULL,
            lyrics_status TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scan_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            total_files INTEGER DEFAULT 0,
            added_tracks INTEGER DEFAULT 0,
            updated_tracks INTEGER DEFAULT 0,
            deleted_tracks INTEGER DEFAULT 0,
            status TEXT DEFAULT 'running'
        );

        CREATE TABLE IF NOT EXISTS favorites (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, track_id)
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            position INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(playlist_id, track_id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            display_name TEXT,
            avatar_url TEXT DEFAULT NULL,
            preferences TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS spotify_sync_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            spotify_track_id TEXT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            duration_ms INTEGER DEFAULT 0,
            cover_url TEXT,
            position INTEGER DEFAULT 0,
            track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            status TEXT DEFAULT 'pending',
            download_id TEXT,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(playlist_id, spotify_track_id)
        );

        CREATE TABLE IF NOT EXISTS bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT DEFAULT 'bug',
            title TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            priority TEXT DEFAULT 'medium',
            description TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            client_context TEXT DEFAULT '{}',
            admin_notes TEXT DEFAULT '',
            seen_by_user INTEGER DEFAULT 0,
            user_deleted INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS playlist_spotify_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            spotify_id TEXT NOT NULL,
            spotify_url TEXT,
            name TEXT,
            track_count INTEGER DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(playlist_id, spotify_id)
        );

        CREATE TABLE IF NOT EXISTS track_videos (
            track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
            visual_type TEXT DEFAULT 'youtube',
            canvas_url TEXT,
            spotify_track_id TEXT,
            youtube_id TEXT,
            video_title TEXT,
            channel_name TEXT,
            duration_seconds REAL DEFAULT 0.0,
            available BOOLEAN DEFAULT 1,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS track_plays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
        CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_spotify_sync_playlist ON spotify_sync_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_playlist_sources_pl ON playlist_spotify_sources(playlist_id);
        CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
        CREATE INDEX IF NOT EXISTS idx_track_videos_track ON track_videos(track_id);
        CREATE INDEX IF NOT EXISTS idx_track_plays_user ON track_plays(user_id, track_id);
        CREATE INDEX IF NOT EXISTS idx_track_plays_track ON track_plays(track_id);
        """)

        cursor = conn.cursor()

        # Find admin user ID for data migration backfills
        cursor.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
        admin_row = cursor.fetchone()
        admin_id = admin_row["id"] if admin_row else 1

        # Migrations for playlists
        cursor.execute("PRAGMA table_info(playlists)")
        cols = [c["name"] for c in cursor.fetchall()]

        if "user_id" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
                conn.execute("UPDATE playlists SET user_id = ? WHERE user_id IS NULL", (admin_id,))
                conn.execute("CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id)")
            except Exception as e:
                print(f"[DB MIGRATION] Error migrating playlists user_id: {e}")

        if "position" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN position INTEGER DEFAULT 0")
            except Exception:
                pass

        if "spotify_id" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN spotify_id TEXT")
            except Exception:
                pass

        if "spotify_url" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN spotify_url TEXT")
            except Exception:
                pass

        if "auto_sync" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN auto_sync INTEGER DEFAULT 1")
            except Exception:
                pass

        if "last_synced_at" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN last_synced_at TIMESTAMP")
            except Exception:
                pass

        if "sync_status" not in cols:
            try:
                conn.execute("ALTER TABLE playlists ADD COLUMN sync_status TEXT DEFAULT 'idle'")
            except Exception:
                pass

        # Migrations for favorites (composite user_id + track_id primary key)
        cursor.execute("PRAGMA table_info(favorites)")
        fav_cols = [c["name"] for c in cursor.fetchall()]
        if "user_id" not in fav_cols:
            try:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS favorites_new (
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, track_id)
                    )
                """)
                cursor.execute(
                    "INSERT OR IGNORE INTO favorites_new (user_id, track_id, created_at) SELECT ?, track_id, created_at FROM favorites",
                    (admin_id,)
                )
                cursor.execute("DROP TABLE favorites")
                cursor.execute("ALTER TABLE favorites_new RENAME TO favorites")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)")
            except Exception as e:
                print(f"[DB MIGRATION] Error migrating favorites user_id: {e}")

        # Migrations for users preferences
        cursor.execute("PRAGMA table_info(users)")
        user_cols = [c["name"] for c in cursor.fetchall()]
        if "preferences" not in user_cols:
            try:
                conn.execute("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding preferences to users: {e}")

        if "avatar_url" not in user_cols:
            try:
                conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding avatar_url to users: {e}")

        # Migrations for tracks lyrics_status
        cursor.execute("PRAGMA table_info(tracks)")
        track_cols = [c["name"] for c in cursor.fetchall()]
        if "lyrics_status" not in track_cols:
            try:
                conn.execute("ALTER TABLE tracks ADD COLUMN lyrics_status TEXT DEFAULT NULL")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_lyrics_status ON tracks(lyrics_status)")
                _backfill_existing_lyrics_cache(conn)
            except Exception as e:
                print(f"[DB MIGRATION] Error migrating tracks lyrics_status: {e}")
        else:
            try:
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_lyrics_status ON tracks(lyrics_status)")
                _backfill_existing_lyrics_cache(conn)
            except Exception:
                pass

        # Migrations for bug_reports (seen_by_user, user_deleted)
        cursor.execute("PRAGMA table_info(bug_reports)")
        bug_cols = [c["name"] for c in cursor.fetchall()]
        if "seen_by_user" not in bug_cols:
            try:
                conn.execute("ALTER TABLE bug_reports ADD COLUMN seen_by_user INTEGER DEFAULT 0")
                print("[DB MIGRATION] Added seen_by_user column to bug_reports.")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding seen_by_user to bug_reports: {e}")

        if "user_deleted" not in bug_cols:
            try:
                conn.execute("ALTER TABLE bug_reports ADD COLUMN user_deleted INTEGER DEFAULT 0")
                print("[DB MIGRATION] Added user_deleted column to bug_reports.")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding user_deleted to bug_reports: {e}")

        # Migrations for track_videos (visual_type, canvas_url, spotify_track_id)
        cursor.execute("PRAGMA table_info(track_videos)")
        tv_cols = [c["name"] for c in cursor.fetchall()]
        if "visual_type" not in tv_cols:
            try:
                conn.execute("ALTER TABLE track_videos ADD COLUMN visual_type TEXT DEFAULT 'youtube'")
            except Exception:
                pass
        if "canvas_url" not in tv_cols:
            try:
                conn.execute("ALTER TABLE track_videos ADD COLUMN canvas_url TEXT")
            except Exception:
                pass
        if "spotify_track_id" not in tv_cols:
            try:
                conn.execute("ALTER TABLE track_videos ADD COLUMN spotify_track_id TEXT")
            except Exception:
                pass

        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_lyrics_status ON tracks(lyrics_status)")
        except Exception:
            pass

        # Migrations for tracks (popularity, play_count, last_played_at)
        if "popularity" not in track_cols:
            try:
                conn.execute("ALTER TABLE tracks ADD COLUMN popularity INTEGER DEFAULT 0")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_popularity ON tracks(popularity)")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding popularity to tracks: {e}")

        if "play_count" not in track_cols:
            try:
                conn.execute("ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count)")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding play_count to tracks: {e}")

        if "last_played_at" not in track_cols:
            try:
                conn.execute("ALTER TABLE tracks ADD COLUMN last_played_at TIMESTAMP")
            except Exception as e:
                print(f"[DB MIGRATION] Error adding last_played_at to tracks: {e}")

        _init_lyrics_fts(conn)

def _backfill_existing_lyrics_cache(conn: sqlite3.Connection):
    """Scan existing /data/lyrics/*.json files and populate tracks.lyrics_status in SQLite."""
    try:
        import json
        from pathlib import Path
        from app.config import DATA_DIR
        lyrics_dir = DATA_DIR / "lyrics"
        if not lyrics_dir.exists():
            return

        updates = []
        for json_file in lyrics_dir.glob("*.json"):
            stem = json_file.stem
            if not stem.isdigit():
                continue
            track_id = int(stem)
            try:
                data = json.loads(json_file.read_text(encoding="utf-8"))
                if data.get("syncedLyrics"):
                    status = "synced"
                elif data.get("plainLyrics"):
                    status = "plain"
                elif data.get("notFound"):
                    status = "not_found"
                else:
                    status = "none"
                updates.append((status, track_id))
            except Exception:
                continue

        if updates:
            conn.executemany("UPDATE tracks SET lyrics_status = ? WHERE id = ? AND (lyrics_status IS NULL OR lyrics_status = 'pending')", updates)
            print(f"[DB MIGRATION] Backfilled {len(updates)} cached lyrics into tracks.lyrics_status.")
    except Exception as e:
        print(f"[DB MIGRATION] Error backfilling lyrics cache: {e}")


def _init_lyrics_fts(conn: sqlite3.Connection):
    """Initialize and populate SQLite FTS5 virtual table for lightning-fast lyrics searching."""
    try:
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS tracks_lyrics_fts USING fts5(
                track_id UNINDEXED,
                title,
                artist_name,
                album_title,
                plain_lyrics,
                tokenize="porter unicode61 remove_diacritics 2"
            )
        """)
        cursor = conn.cursor()
        cursor.execute("SELECT track_id FROM tracks_lyrics_fts")
        indexed_ids = set(r["track_id"] for r in cursor.fetchall())

        import re
        import json
        from pathlib import Path
        from app.config import DATA_DIR

        lyrics_dir = DATA_DIR / "lyrics"
        if not lyrics_dir.exists():
            return

        batch = []
        for json_file in lyrics_dir.glob("*.json"):
            if not json_file.stem.isdigit():
                continue
            tid = int(json_file.stem)
            if tid in indexed_ids:
                continue
            try:
                data = json.loads(json_file.read_text(encoding="utf-8"))
                raw = data.get("syncedLyrics") or data.get("plainLyrics")
                if raw and not data.get("notFound"):
                    clean = re.sub(r"\[\d{2}:\d{2}(?:\.\d+)?\]", "", raw).strip()
                    if clean:
                        batch.append((tid, clean))
            except Exception:
                continue

            if batch:
                cursor.execute("""
                    SELECT t.id, t.title, ar.name as artist, a.title as album
                    FROM tracks t
                    JOIN artists ar ON t.artist_id = ar.id
                    JOIN albums a ON t.album_id = a.id
                """)
                meta = {r["id"]: (r["title"], r["artist"], r["album"]) for r in cursor.fetchall()}

                insert_rows = []
                for tid, clean_lyrics in batch:
                    if tid in meta:
                        title, artist, album = meta[tid]
                        insert_rows.append((tid, title, artist, album, clean_lyrics))

                if insert_rows:
                    cursor.executemany("""
                        INSERT INTO tracks_lyrics_fts (track_id, title, artist_name, album_title, plain_lyrics)
                        VALUES (?, ?, ?, ?, ?)
                    """, insert_rows)
                    print(f"[FTS] Successfully indexed {len(insert_rows)} tracks into tracks_lyrics_fts.")
    except Exception as e:
        print(f"[FTS] Error initializing tracks_lyrics_fts: {e}")


def sync_track_to_lyrics_fts(track_id: int, lyrics_text: str):
    """Insert or update track lyrics in the tracks_lyrics_fts virtual table."""
    if not lyrics_text:
        return
    import re
    # Strip timestamp brackets e.g. [01:23.45]
    clean_lyrics = re.sub(r"\[\d{2}:\d{2}(?:\.\d+)?\]", "", lyrics_text).strip()
    if not clean_lyrics:
        return
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT t.title, ar.name AS artist_name, a.title AS album_title
                FROM tracks t
                JOIN artists ar ON t.artist_id = ar.id
                JOIN albums a ON t.album_id = a.id
                WHERE t.id = ?
            """, (track_id,))
            row = cursor.fetchone()
            if not row:
                return
            cursor.execute("DELETE FROM tracks_lyrics_fts WHERE track_id = ?", (track_id,))
            cursor.execute("""
                INSERT INTO tracks_lyrics_fts (track_id, title, artist_name, album_title, plain_lyrics)
                VALUES (?, ?, ?, ?, ?)
            """, (track_id, row["title"], row["artist_name"], row["album_title"], clean_lyrics))
    except Exception as e:
        print(f"[FTS] Error syncing track {track_id} to lyrics index: {e}")


def remove_track_from_lyrics_fts(track_id: int):
    """Remove track from tracks_lyrics_fts virtual table."""
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM tracks_lyrics_fts WHERE track_id = ?", (track_id,))
    except Exception as e:
        print(f"[FTS] Error removing track {track_id} from lyrics index: {e}")


