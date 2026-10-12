import sys
import json
from app.scanner import scan_music_library
from app.database import get_db

def main():
    print("=" * 60)
    print("🎵 Starting Music Library Scan on MattLab")
    print("=" * 60)
    result = scan_music_library()
    print("-" * 60)
    print("📊 Scan Summary:")
    print(f"  • Total Audio Files Found : {result['total_files']}")
    print(f"  • New Tracks Added        : {result['added']}")
    print(f"  • Existing Unchanged      : {result['unchanged']}")
    print(f"  • Tracks Updated          : {result['updated']}")
    print(f"  • Tracks Removed (deleted): {result['deleted']}")
    print(f"  • Tag Errors / Skipped    : {result['errors']}")
    print(f"  • Time Elapsed            : {result['elapsed_seconds']}s")
    print("-" * 60)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS c FROM artists")
        artists_count = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) AS c FROM albums")
        albums_count = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) AS c FROM tracks")
        tracks_count = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) AS c FROM albums WHERE cover_path IS NOT NULL")
        covers_count = cursor.fetchone()["c"]

    print("📚 Database Library Status:")
    print(f"  • Artists : {artists_count}")
    print(f"  • Albums  : {albums_count} ({covers_count} with cover art)")
    print(f"  • Tracks  : {tracks_count}")
    print("=" * 60)

if __name__ == "__main__":
    main()
