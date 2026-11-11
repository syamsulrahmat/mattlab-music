#!/usr/bin/env python3
"""
MattLab Music - Whole Library Audio Normalization CLI.
Scans tracks in SQLite lacking loudness metadata, runs FFmpeg ebur128 analysis,
and stores lufs_i, gain_db, and true_peak in tracks table.
"""

import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, "/app")

from app.database import get_db
from app.audio_normalizer import analyze_audio_loudness

BATCH_SIZE = 25
MAX_WORKERS = 6

def process_track(track_info):
    track_id, file_path = track_info
    try:
        norm = analyze_audio_loudness(file_path, timeout_seconds=45)
        return track_id, norm
    except Exception as e:
        return track_id, None

def run_normalization():
    print("=" * 60)
    print("🎵 MattLab Music - Audio Normalization Engine (EBU R128)")
    print(f"Target Loudness: -14.0 LUFS (Spotify / YouTube Music Standard)")
    print("=" * 60)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tracks")
        total_tracks = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM tracks WHERE gain_db IS NOT NULL")
        already_normalized = cursor.fetchone()[0]

        cursor.execute("SELECT id, file_path FROM tracks WHERE gain_db IS NULL ORDER BY id ASC")
        unscanned = cursor.fetchall()

    remaining_count = len(unscanned)
    print(f"Total Tracks in Library: {total_tracks}")
    print(f"Already Normalized:      {already_normalized}")
    print(f"Pending Analysis:        {remaining_count}")
    print("-" * 60)

    if remaining_count == 0:
        print("✅ All tracks are already normalized!")
        return

    processed_count = 0
    updated_count = 0
    error_count = 0
    start_time = time.time()

    # Process in chunks with thread pool and commit every BATCH_SIZE
    for chunk_start in range(0, remaining_count, BATCH_SIZE):
        chunk = [(r["id"], r["file_path"]) for r in unscanned[chunk_start:chunk_start + BATCH_SIZE]]
        updates = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [executor.submit(process_track, item) for item in chunk]
            for future in as_completed(futures):
                t_id, norm_data = future.result()
                processed_count += 1
                if norm_data:
                    updates.append((norm_data["lufs_i"], norm_data["gain_db"], norm_data["true_peak"], t_id))
                    updated_count += 1
                else:
                    error_count += 1

                if processed_count % 10 == 0 or processed_count == remaining_count:
                    elapsed = time.time() - start_time
                    rate = processed_count / elapsed if elapsed > 0 else 0
                    percent = (processed_count / remaining_count) * 100
                    eta_sec = (remaining_count - processed_count) / rate if rate > 0 else 0
                    print(f"[{processed_count}/{remaining_count}] {percent:5.1f}% | "
                          f"Speed: {rate:4.1f} trk/s | ETA: {int(eta_sec//60)}m{int(eta_sec%60)}s | "
                          f"Normalized: {updated_count}", end="\r", flush=True)

        if updates:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.executemany("""
                    UPDATE tracks
                    SET lufs_i = ?, gain_db = ?, true_peak = ?
                    WHERE id = ?
                """, updates)
                conn.commit()

    print()
    total_elapsed = time.time() - start_time
    print("=" * 60)
    print(f"🎉 Library normalization scan completed in {int(total_elapsed//60)}m{int(total_elapsed%60)}s!")
    print(f"Successfully Normalized: {updated_count}")
    if error_count > 0:
        print(f"Skipped / Errors:        {error_count}")
    print("=" * 60)

if __name__ == "__main__":
    run_normalization()
