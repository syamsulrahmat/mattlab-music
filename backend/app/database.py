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

        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
        CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_spotify_sync_playlist ON spotify_sync_tracks(playlist_id, position);
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

        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)")
        except Exception:
            pass
