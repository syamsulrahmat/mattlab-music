#!/usr/bin/env python3
import io
import re
import sys
import time
import sqlite3
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from mutagen.id3 import ID3, APIC, TALB, ID3NoHeaderError

from app.config import MUSIC_DIR, COVERS_DIR, DB_PATH
from app.scanner import save_cover_image, get_album_hash
from app.routes.spotify_sync import fetch_track_metadata, clean_search_term

def get_all_banner_hashes():
    """Identify all raw and resized md5 hashes of playlist banner artwork."""
    base = Path("/music/Spotify Downloads")
    banner_hashes = set()
    if base.exists():
        for f in base.glob("*/*"):
            if f.is_file() and f.name.lower() in ("folder.jpg", "cover.jpg"):
                raw = f.read_bytes()
                banner_hashes.add(hashlib.md5(raw).hexdigest())
                try:
                    img = Image.open(io.BytesIO(raw))
                    img = img.convert("RGB")
                    img.thumbnail((600, 600), Image.Resampling.LANCZOS)
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=85, optimize=True)
                    banner_hashes.add(hashlib.md5(buf.getvalue()).hexdigest())
                except Exception:
                    pass
    print(f"[BANNER-DETECT] Identified {len(banner_hashes)} unique playlist banner hashes.")
    return banner_hashes

def strip_banner_apic_if_present(mp3_path: Path, banner_hashes: set) -> bool:
    """Strip APIC frame if it matches a playlist banner hash."""
    if not mp3_path.exists() or not mp3_path.is_file():
        return False
    try:
        tags = ID3(mp3_path)
    except Exception:
        return False

    changed = False
    new_apics = []
    for apic in tags.getall("APIC"):
        h = hashlib.md5(apic.data).hexdigest()
        if h in banner_hashes:
            changed = True
        else:
            new_apics.append(apic)
            
    if changed:
        tags.delall("APIC")
        for a in new_apics:
            tags.add(a)
        tags.save(mp3_path, v2_version=3)
        return True
    return False

def lookup_track_worker(track_info):
    """Worker function for concurrent Deezer/iTunes metadata lookup."""
    t_id, title, artist = track_info
    meta = fetch_track_metadata(title, artist)
    
    # Try extra clean title if nothing found
    if not meta.get("album") or not meta.get("cover_bytes"):
        clean_t = re.sub(r'[\（\(\[\{【].*?[\）\)\]\}】]', ' ', title)
        clean_t = re.sub(r'[★☆!！?？"\'“”‘’\<\>|/\\\\:\*\+~～`]', ' ', clean_t).strip()
        if clean_t and clean_t != title:
            meta2 = fetch_track_metadata(clean_t, artist)
            if meta2.get("album"):
                meta["album"] = meta2["album"]
            if meta2.get("cover_bytes"):
                meta["cover_bytes"] = meta2["cover_bytes"]
                
    return t_id, meta

def prefetch_metadata_batch(track_list, max_workers=6):
    """Concurrently prefetch metadata for a batch of tracks."""
    results = {}
    total = len(track_list)
    print(f"  [METADATA-PREFETCH] Querying APIs concurrently for {total} tracks ({max_workers} threads)...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(lookup_track_worker, tr): tr[0] for tr in track_list}
        done_cnt = 0
        for f in as_completed(futures):
            t_id, meta = f.result()
            results[t_id] = meta
            done_cnt += 1
            if done_cnt % 20 == 0 or done_cnt == total:
                print(f"    Fetched {done_cnt}/{total} track metadatas...")
                
    return results

def fix_naruto_tracks(conn, cursor, banner_hashes: set):
    """Process Naruto tracks: fetch authentic album metadata or cleanly fallback."""
    print("\n==========================================")
    print(">>> Processing 'NARUTO all songs' (Playlist 11)...")
    print("==========================================")
    
    cursor.execute("""
        SELECT t.id, t.title, ar.id as artist_id, ar.name as artist_name, t.file_path, a.id as old_album_id
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        JOIN artists ar ON t.artist_id = ar.id
        JOIN albums a ON t.album_id = a.id
        WHERE pt.playlist_id = 11 OR LOWER(a.title) = 'naruto all songs'
        ORDER BY pt.position ASC
    """)
    tracks = cursor.fetchall()
    print(f"Total Naruto tracks found: {len(tracks)}")
    
    # 1. Prefetch metadata concurrently
    lookup_items = [(tr["id"], tr["title"], tr["artist_name"]) for tr in tracks]
    meta_cache = prefetch_metadata_batch(lookup_items, max_workers=6)
    
    # 2. Sequential disk & database updates
    updated_with_cover = 0
    fallback_no_cover = 0
    
    for idx, tr in enumerate(tracks, start=1):
        t_id = tr["id"]
        t_title = tr["title"]
        a_id = tr["artist_id"]
        a_name = tr["artist_name"]
        f_path = Path(tr["file_path"])
        old_album_id = tr["old_album_id"]
        
        # Strip banner APIC from MP3
        strip_banner_apic_if_present(f_path, banner_hashes)
        
        meta = meta_cache.get(t_id, {})
        real_album = meta.get("album")
        cover_bytes = meta.get("cover_bytes")
        
        if real_album and cover_bytes:
            real_album = real_album.strip()
            real_hash = get_album_hash(a_name, real_album)
            saved_cover_path = save_cover_image(cover_bytes, real_hash)
            
            if f_path.exists():
                try:
                    try:
                        tags = ID3(f_path)
                    except ID3NoHeaderError:
                        tags = ID3()
                    tags.delall("TALB")
                    tags.add(TALB(encoding=3, text=real_album))
                    tags.delall("APIC")
                    tags.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=cover_bytes))
                    tags.save(f_path, v2_version=3)
                except Exception:
                    pass
                    
            cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (real_album, a_id))
            row = cursor.fetchone()
            if row:
                new_album_id = row["id"]
                if saved_cover_path:
                    cursor.execute("UPDATE albums SET cover_path = ? WHERE id = ?", (saved_cover_path, new_album_id))
            else:
                cursor.execute("INSERT OR IGNORE INTO albums (title, artist_id, cover_path) VALUES (?, ?, ?)", (real_album, a_id, saved_cover_path))
                cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (real_album, a_id))
                r = cursor.fetchone()
                new_album_id = r["id"] if r else old_album_id
                
            cursor.execute("UPDATE tracks SET album_id = ? WHERE id = ?", (new_album_id, t_id))
            conn.commit()
            updated_with_cover += 1
            print(f"  [{idx}/{len(tracks)}] ✅ {a_name} - {t_title} -> '{real_album}' (Authentic Cover)")
        else:
            # Fallback: cover_path = NULL (renders default vinyl SVG placeholder)
            album_fallback = (real_album or f"{t_title} - Single").strip()
            if f_path.exists():
                try:
                    try:
                        tags = ID3(f_path)
                    except ID3NoHeaderError:
                        tags = ID3()
                    tags.delall("TALB")
                    tags.add(TALB(encoding=3, text=album_fallback))
                    tags.delall("APIC")
                    tags.save(f_path, v2_version=3)
                except Exception:
                    pass
                    
            cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (album_fallback, a_id))
            row = cursor.fetchone()
            if row:
                new_album_id = row["id"]
            else:
                cursor.execute("INSERT OR IGNORE INTO albums (title, artist_id, cover_path) VALUES (?, ?, NULL)", (album_fallback, a_id))
                cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (album_fallback, a_id))
                r = cursor.fetchone()
                new_album_id = r["id"] if r else old_album_id
                
            cursor.execute("UPDATE tracks SET album_id = ? WHERE id = ?", (new_album_id, t_id))
            conn.commit()
            fallback_no_cover += 1
            print(f"  [{idx}/{len(tracks)}] ⚪ {a_name} - {t_title} -> '{album_fallback}' (Fallback Vinyl Placeholder)")
            
    print(f"\nFinished Naruto: {updated_with_cover} with authentic covers, {fallback_no_cover} fallen back to default placeholder.")

def sweep_and_clean_all_banner_albums(conn, cursor, banner_hashes: set):
    """Find ALL albums currently carrying banner hashes and resolve authentic covers or fallback."""
    print("\n==========================================")
    print(">>> Global Banner Purge & Fallback Sweep...")
    print("==========================================")
    
    cursor.execute("SELECT id, title, artist_id, cover_path FROM albums WHERE cover_path IS NOT NULL")
    albums = cursor.fetchall()
    
    banner_album_ids = []
    for a in albums:
        p = Path(a["cover_path"])
        if p.exists():
            h = hashlib.md5(p.read_bytes()).hexdigest()
            if h in banner_hashes:
                banner_album_ids.append(a["id"])
                
    print(f"Found {len(banner_album_ids)} albums currently using playlist banner artwork.")
    
    if not banner_album_ids:
        print("No albums found using banner artwork! Everything is clean.")
        return
        
    # Collect all tracks in these banner albums
    placeholders = ",".join("?" * len(banner_album_ids))
    cursor.execute(f"""
        SELECT t.id, t.title, ar.id as artist_id, ar.name as artist_name, t.file_path, a.id as old_album_id, a.title as album_title
        FROM tracks t
        JOIN artists ar ON t.artist_id = ar.id
        JOIN albums a ON t.album_id = a.id
        WHERE t.album_id IN ({placeholders})
    """, banner_album_ids)
    tracks = cursor.fetchall()
    print(f"Total tracks in banner albums to resolve: {len(tracks)}")
    
    if not tracks:
        # Just nullify the banner covers on empty albums
        cursor.execute(f"UPDATE albums SET cover_path = NULL WHERE id IN ({placeholders})", banner_album_ids)
        conn.commit()
        return

    # Prefetch metadata concurrently
    lookup_items = [(tr["id"], tr["title"], tr["artist_name"]) for tr in tracks]
    meta_cache = prefetch_metadata_batch(lookup_items, max_workers=6)
    
    # Process updates
    fixed_count = 0
    fallback_count = 0
    
    for idx, tr in enumerate(tracks, start=1):
        t_id = tr["id"]
        t_title = tr["title"]
        art_id = tr["artist_id"]
        art_name = tr["artist_name"]
        f_path = Path(tr["file_path"])
        old_a_id = tr["old_album_id"]
        
        strip_banner_apic_if_present(f_path, banner_hashes)
        
        meta = meta_cache.get(t_id, {})
        real_album = meta.get("album")
        cover_bytes = meta.get("cover_bytes")
        
        if real_album and cover_bytes:
            real_album = real_album.strip()
            real_hash = get_album_hash(art_name, real_album)
            saved_cover_path = save_cover_image(cover_bytes, real_hash)
            
            if f_path.exists():
                try:
                    tags = ID3(f_path)
                    tags.delall("TALB")
                    tags.add(TALB(encoding=3, text=real_album))
                    tags.delall("APIC")
                    tags.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=cover_bytes))
                    tags.save(f_path, v2_version=3)
                except Exception:
                    pass
                    
            cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (real_album, art_id))
            row = cursor.fetchone()
            if row:
                new_album_id = row["id"]
                if saved_cover_path:
                    cursor.execute("UPDATE albums SET cover_path = ? WHERE id = ?", (saved_cover_path, new_album_id))
            else:
                cursor.execute("INSERT OR IGNORE INTO albums (title, artist_id, cover_path) VALUES (?, ?, ?)", (real_album, art_id, saved_cover_path))
                cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (real_album, art_id))
                r = cursor.fetchone()
                new_album_id = r["id"] if r else old_a_id
                
            cursor.execute("UPDATE tracks SET album_id = ? WHERE id = ?", (new_album_id, t_id))
            conn.commit()
            fixed_count += 1
            print(f"  [{idx}/{len(tracks)}] ✅ {art_name} - {t_title} -> '{real_album}' (Authentic Cover)")
        else:
            clean_alb = (real_album or tr["album_title"]).strip()
            if f_path.exists():
                try:
                    tags = ID3(f_path)
                    tags.delall("TALB")
                    tags.add(TALB(encoding=3, text=clean_alb))
                    tags.delall("APIC")
                    tags.save(f_path, v2_version=3)
                except Exception:
                    pass
                    
            cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (clean_alb, art_id))
            row = cursor.fetchone()
            if row:
                new_album_id = row["id"]
            else:
                cursor.execute("INSERT OR IGNORE INTO albums (title, artist_id, cover_path) VALUES (?, ?, NULL)", (clean_alb, art_id))
                cursor.execute("SELECT id FROM albums WHERE LOWER(title) = LOWER(?) AND artist_id = ?", (clean_alb, art_id))
                r = cursor.fetchone()
                new_album_id = r["id"] if r else old_a_id
                
            cursor.execute("UPDATE tracks SET album_id = ? WHERE id = ?", (new_album_id, t_id))
            conn.commit()
            fallback_count += 1
            print(f"  [{idx}/{len(tracks)}] ⚪ {art_name} - {t_title} -> '{clean_alb}' (Fallback Vinyl Placeholder)")

    # Nullify any remaining banner album covers
    cursor.execute(f"UPDATE albums SET cover_path = NULL WHERE id IN ({placeholders})", banner_album_ids)
    conn.commit()
    print(f"\nSweep complete: {fixed_count} fixed with authentic covers, {fallback_count} set to clean vinyl placeholder.")

def strip_all_disk_banner_apics(banner_hashes: set):
    """Sweep all MP3 files on disk and remove any APIC frames matching banner hashes."""
    print("\n==========================================")
    print(">>> Checking all MP3 files on disk for banner APIC frames...")
    print("==========================================")
    base = Path("/music/Spotify Downloads")
    cleaned = 0
    if base.exists():
        for mp3_path in base.glob("**/*.mp3"):
            if strip_banner_apic_if_present(mp3_path, banner_hashes):
                cleaned += 1
    print(f"Purged banner APIC from {cleaned} MP3 files on disk.")

def cleanup_orphaned_albums(conn, cursor):
    """Delete albums that have no tracks pointing to them."""
    cursor.execute("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)")
    deleted = cursor.rowcount
    conn.commit()
    print(f"Deleted {deleted} empty/orphaned albums.")

def verify_all_playlists(conn, cursor, banner_hashes: set):
    """Verify library state and report detailed stats."""
    print("\n==========================================")
    print(">>> Verification & Summary Report...")
    print("==========================================")
    cursor.execute("SELECT id, name FROM playlists ORDER BY id ASC")
    playlists = cursor.fetchall()
    
    total_tracks_with_banner = 0
    total_tracks_with_fallback = 0
    total_tracks_with_genuine = 0
    
    for pl in playlists:
        pl_id = pl["id"]
        pl_name = pl["name"]
        
        cursor.execute("""
            SELECT t.id, t.title, a.id as album_id, a.title as album_title, a.cover_path
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            JOIN albums a ON t.album_id = a.id
            WHERE pt.playlist_id = ?
        """, (pl_id,))
        tracks = cursor.fetchall()
        
        if not tracks:
            continue
            
        banner_cnt = 0
        fallback_cnt = 0
        genuine_cnt = 0
        unique_albums = len(set(t["album_id"] for t in tracks))
        
        for tr in tracks:
            cov = tr["cover_path"]
            if not cov:
                fallback_cnt += 1
            else:
                p = Path(cov)
                if p.exists():
                    h = hashlib.md5(p.read_bytes()).hexdigest()
                    if h in banner_hashes:
                        banner_cnt += 1
                    else:
                        genuine_cnt += 1
                else:
                    fallback_cnt += 1
                    
        total_tracks_with_banner += banner_cnt
        total_tracks_with_fallback += fallback_cnt
        total_tracks_with_genuine += genuine_cnt
        
        print(f"Playlist [{pl_id:2d}] '{pl_name}': {len(tracks)} tracks across {unique_albums} distinct albums "
              f"(Genuine Covers: {genuine_cnt}, Fallbacks: {fallback_cnt}, Banner Covers: {banner_cnt})")
              
    print("\n------------------------------------------")
    print(f"TOTALS: Genuine Covers: {total_tracks_with_genuine} | Fallback Placeholders: {total_tracks_with_fallback} | Banner Art: {total_tracks_with_banner}")
    print("------------------------------------------")
    return total_tracks_with_banner

def main():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    banner_hashes = get_all_banner_hashes()
    
    # 1. Process Naruto tracks
    fix_naruto_tracks(conn, cursor, banner_hashes)
    
    # 2. Sweep all banner albums and fallback
    sweep_and_clean_all_banner_albums(conn, cursor, banner_hashes)
    
    # 3. Strip banner APICs from disk
    strip_all_disk_banner_apics(banner_hashes)
    
    # 4. Clean empty albums
    cleanup_orphaned_albums(conn, cursor)
    
    # 5. Verification
    banner_remaining = verify_all_playlists(conn, cursor, banner_hashes)
    
    conn.close()
    if banner_remaining == 0:
        print("\n🎉 SUCCESS: 0 tracks are using playlist banner covers! All authentic covers & fallbacks set.")
    else:
        print(f"\n⚠️ WARNING: {banner_remaining} tracks still have banner artwork.")

if __name__ == "__main__":
    main()
