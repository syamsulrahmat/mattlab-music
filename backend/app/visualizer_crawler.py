import os
import time
import logging
import threading
import subprocess
import urllib.request
import collections
from pathlib import Path
from typing import Optional, Dict, Any

import yt_dlp

from app.config import VISUALIZERS_DIR
from app.database import get_db

logger = logging.getLogger("visualizer_crawler")
logger.setLevel(logging.INFO)


def download_canvas_clip(track_id: int, canvas_url: str) -> bool:
    """Download and cache a Spotify Canvas MP4 directly (~500KB-900KB)."""
    VISUALIZERS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = VISUALIZERS_DIR / f"{track_id}.mp4"
    tmp_file = VISUALIZERS_DIR / f"{track_id}.tmp.mp4"
    if out_file.exists() and out_file.stat().st_size > 10000:
        return True
    try:
        req = urllib.request.Request(canvas_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            if len(data) > 10000:
                tmp_file.write_bytes(data)
                tmp_file.replace(out_file)
                logger.info(f"[Visualizer] Downloaded and cached Spotify Canvas for track {track_id} ({len(data)} bytes)")
                return True
    except Exception as e:
        logger.warning(f"[Visualizer] Failed to download Canvas for track {track_id}: {e}")
        if tmp_file.exists():
            try:
                tmp_file.unlink()
            except Exception:
                pass
    return False


def download_youtube_clip(track_id: int, youtube_id: str) -> bool:
    """Download and cache a 12-second lightweight H.264 MP4 snippet from YouTube (~1.2MB)."""
    VISUALIZERS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = VISUALIZERS_DIR / f"{track_id}.mp4"
    tmp_file = VISUALIZERS_DIR / f"{track_id}.tmp.mp4"
    if out_file.exists() and out_file.stat().st_size > 10000:
        return True
    try:
        ydl_opts = {
            "format": "bestvideo[height<=720][vcodec^=avc1][ext=mp4]/bestvideo[height<=720][ext=mp4]/best[ext=mp4]/best",
            "download_ranges": yt_dlp.utils.download_range_func(None, [(35, 47)]),
            "outtmpl": str(tmp_file),
            "force_overwrites": True,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={youtube_id}"])
        if tmp_file.exists() and tmp_file.stat().st_size > 10000:
            tmp_file.replace(out_file)
            logger.info(f"[Visualizer] Downloaded and cached YouTube clip for track {track_id} ({out_file.stat().st_size} bytes)")
            return True
    except Exception as e:
        logger.warning(f"[Visualizer] Failed to download YouTube clip for track {track_id} ({youtube_id}): {e}")
        if tmp_file.exists():
            try:
                tmp_file.unlink()
            except Exception:
                pass
    return False


class VisualizerBackgroundCrawler:
    """Background service that indexes and caches looping MP4 visualizers for all library tracks."""

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.worker_thread: Optional[threading.Thread] = None
        self.high_priority_queue = collections.deque()
        self.backlog_queue = collections.deque()
        self.queue_lock = threading.Lock()
        self.current_track_name = ""
        self.telegram_notified = False

    def start(self):
        """Start the background crawler worker thread."""
        if self.is_running:
            return
        self.is_running = True
        self._populate_backlog()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="VisualizerCrawler")
        self.worker_thread.start()
        logger.info("[VisualizerCrawler] Background worker started.")

    def stop(self):
        """Gracefully stop crawler thread."""
        self.is_running = False
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=3)

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def queue_high_priority(self, track_id: int):
        """Queue a track with high priority (e.g. currently playing song)."""
        clip_file = VISUALIZERS_DIR / f"{track_id}.mp4"
        if clip_file.exists() and clip_file.stat().st_size > 10000:
            return
        with self.queue_lock:
            if track_id not in self.high_priority_queue:
                self.high_priority_queue.appendleft(track_id)

    def _populate_backlog(self):
        """Find all tracks in database that do not yet have a cached visualizer clip."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT t.id
                FROM tracks t
                ORDER BY t.id ASC
            """)
            rows = cursor.fetchall()

        with self.queue_lock:
            self.backlog_queue.clear()
            for row in rows:
                tid = row["id"]
                clip_path = VISUALIZERS_DIR / f"{tid}.mp4"
                if not clip_path.exists() or clip_path.stat().st_size < 10000:
                    self.backlog_queue.append(tid)

        logger.info(f"[VisualizerCrawler] Populated backlog queue with {len(self.backlog_queue)} tracks.")

    def _worker_loop(self):
        """Continuous background worker loop processing visualizer discovery and downloads."""
        from app.routes.stream import resolve_track_visual, get_spotify_sp_dc

        while self.is_running:
            if self.is_paused:
                time.sleep(1)
                continue

            track_id = None
            with self.queue_lock:
                if self.high_priority_queue:
                    track_id = self.high_priority_queue.popleft()
                elif self.backlog_queue:
                    track_id = self.backlog_queue.popleft()

            if track_id is None:
                # Library backlog complete
                self._check_completion_notification()
                time.sleep(15)
                # Re-check if any new songs were added to library
                self._populate_backlog()
                continue

            # Process single track
            try:
                self._process_track(track_id)
            except Exception as e:
                logger.warning(f"[VisualizerCrawler] Unexpected error on track {track_id}: {e}")

    def _process_track(self, track_id: int):
        """Process visualizer discovery and MP4 caching for one track."""
        from app.routes.stream import resolve_track_visual, get_spotify_sp_dc

        clip_file = VISUALIZERS_DIR / f"{track_id}.mp4"
        if clip_file.exists() and clip_file.stat().st_size > 10000:
            return

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT t.id, t.title, ar.name AS artist_name
                FROM tracks t
                JOIN artists ar ON t.artist_id = ar.id
                WHERE t.id = ?
            """, (track_id,))
            track = cursor.fetchone()

            if not track:
                return

            self.current_track_name = f"{track['artist_name']} - {track['title']}"

            # Check if visualizer info is already resolved in DB
            cursor.execute("SELECT * FROM track_videos WHERE track_id = ?", (track_id,))
            cached = cursor.fetchone()

        sp_dc = get_spotify_sp_dc()
        visual_type = None
        canvas_url = None
        youtube_id = None
        spotify_track_id = None
        video_title = None
        channel_name = None
        duration_seconds = 0.0

        if cached and cached["available"] == 1:
            visual_type = cached["visual_type"]
            canvas_url = cached["canvas_url"]
            youtube_id = cached["youtube_id"]
            spotify_track_id = cached["spotify_track_id"] if "spotify_track_id" in cached.keys() else None
            video_title = cached["video_title"]
            channel_name = cached["channel_name"]
            duration_seconds = cached["duration_seconds"]
        elif cached and cached["available"] == 0:
            # Already checked and neither Canvas nor YouTube found
            return
        else:
            # Perform discovery lookup
            result = resolve_track_visual(track["artist_name"], track["title"], sp_dc)
            if result and (result.get("canvas_url") or result.get("youtube_id")):
                visual_type = result.get("visual_type", "youtube")
                canvas_url = result.get("canvas_url")
                youtube_id = result.get("youtube_id")
                spotify_track_id = result.get("spotify_track_id")
                video_title = result.get("video_title")
                channel_name = result.get("channel_name")
                duration_seconds = result.get("duration_seconds", 0.0)

                with get_db() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO track_videos 
                        (track_id, visual_type, canvas_url, spotify_track_id, youtube_id, video_title, channel_name, duration_seconds, available)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """, (
                        track_id,
                        visual_type,
                        canvas_url,
                        spotify_track_id,
                        youtube_id,
                        video_title,
                        channel_name,
                        duration_seconds
                    ))
            else:
                with get_db() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO track_videos 
                        (track_id, visual_type, canvas_url, spotify_track_id, youtube_id, video_title, channel_name, duration_seconds, available)
                        VALUES (?, 'none', NULL, NULL, NULL, NULL, NULL, 0.0, 0)
                    """, (track_id,))
                time.sleep(0.3)
                return

        # Download and cache visualizer MP4
        if visual_type == "canvas" and canvas_url:
            success = download_canvas_clip(track_id, canvas_url)
            time.sleep(0.5)  # Fast pacing for CDN download
        elif youtube_id:
            success = download_youtube_clip(track_id, youtube_id)
            time.sleep(3.5)  # Safe 3.5s pacing to prevent YouTube rate-limiting

    def _check_completion_notification(self):
        """Send automated Telegram notification once when library backlog finishes."""
        if self.telegram_notified:
            return

        status = self.get_status()
        total = status["total_tracks"]
        pending = status["pending_count"]

        if total > 0 and pending == 0:
            canvas = status["canvas_count"]
            youtube = status["youtube_count"]
            total_cached = status["cached_clips_count"]
            storage_mb = status["storage_mb"]
            pct = round((total_cached / total) * 100, 1) if total > 0 else 0

            msg = (
                f"🎬 Visualizer Auto-Crawler Complete on MattLab Music!\n\n"
                f"• Total Library Tracks: {total:,}\n"
                f"• Spotify Canvases Cached: {canvas:,}\n"
                f"• YouTube Looping Clips: {youtube:,}\n"
                f"• Total Visualizers Ready: {total_cached:,} ({pct}%)\n"
                f"• Local Video Storage: {storage_mb:,} MB\n\n"
                f"All future added songs will be auto-indexed on import."
            )

            try:
                subprocess.run(["/usr/local/bin/tg-notify", msg], check=False, timeout=10)
                logger.info("[VisualizerCrawler] Dispatched completion notification to Telegram.")
            except Exception as e:
                logger.warning(f"[VisualizerCrawler] Could not dispatch tg-notify: {e}")

            self.telegram_notified = True

    def get_status(self) -> Dict[str, Any]:
        """Return comprehensive status for system monitoring."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) AS total FROM tracks")
            total = cursor.fetchone()["total"]

            cursor.execute("SELECT COUNT(*) AS c FROM track_videos WHERE available = 1 AND visual_type = 'canvas'")
            canvas = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(*) AS c FROM track_videos WHERE available = 1 AND visual_type = 'youtube'")
            youtube = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(*) AS c FROM track_videos WHERE available = 0")
            not_found = cursor.fetchone()["c"]

        # Calculate actual files on disk
        clip_files = list(VISUALIZERS_DIR.glob("*.mp4"))
        cached_count = len([f for f in clip_files if not f.name.endswith(".tmp.mp4")])
        total_bytes = sum(f.stat().st_size for f in clip_files if f.exists())
        storage_mb = round(total_bytes / (1024 * 1024), 1)

        with self.queue_lock:
            pending = len(self.high_priority_queue) + len(self.backlog_queue)

        processed = total - pending
        progress_pct = round((processed / total) * 100, 1) if total > 0 else 100.0

        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "total_tracks": total,
            "processed_tracks": processed,
            "pending_count": pending,
            "canvas_count": canvas,
            "youtube_count": youtube,
            "not_found_count": not_found,
            "cached_clips_count": cached_count,
            "storage_mb": storage_mb,
            "progress_percent": progress_pct,
            "current_track": self.current_track_name,
        }


# Global singleton instance
visualizer_crawler = VisualizerBackgroundCrawler()


def start_background_visualizer_crawler():
    """Startup hook to begin background visualizer indexing."""
    visualizer_crawler.start()
