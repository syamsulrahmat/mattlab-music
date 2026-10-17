import os
import re
import json
import time
import logging
import threading
import subprocess
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any, List

import mutagen
from mutagen.flac import FLAC
from mutagen.mp4 import MP4

from app.config import DATA_DIR
from app.database import get_db, sync_track_to_lyrics_fts, remove_track_from_lyrics_fts

logger = logging.getLogger("lyrics_fetcher")
logger.setLevel(logging.INFO)

LYRICS_DIR = DATA_DIR / "lyrics"
LYRICS_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = "MattLabMusic/1.0.0 (https://github.com/syamsulrahmat/mattlab-music; self-hosted)"


def clean_title_for_search(title: Optional[str]) -> str:
    """Strip feat, version, remix, remastered, and bonus tags for higher lyric hit rates."""
    if not title:
        return ""
    cleaned = re.sub(
        r"\s*[\(\[](?:feat\.?|ft\.?|featuring|deluxe|remaster(?:ed)?|bonus|expanded|edition|version|official|from\s+[\"'][^\"']+[\"']|live|acoustic|karaoke\s+version)[^\)\]]*[\)\]]",
        "",
        title,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\s*-\s*(?:remaster(?:ed)?(?:\s*\d{4})?|single|ep|bonus\s*track|deluxe(?:\s*edition)?|voice\s*memos?).*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip() or title.strip()


def clean_artist_for_search(artist: Optional[str]) -> str:
    """Extract primary artist, stripping featured artists and collaboration suffixes."""
    if not artist:
        return ""
    a = re.sub(r"\s*[\(\[](?:feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]", "", artist, flags=re.IGNORECASE)
    parts = re.split(r"\s*(?:\b(?:feat\.?|ft\.?|featuring|vs\.?)\b|[/,&])\s*", a, flags=re.IGNORECASE)
    cleaned = parts[0].strip() if parts else artist.strip()
    return cleaned or artist.strip()


def clean_album_for_search(album: Optional[str]) -> str:
    """Strip deluxe, anniversary, and bonus tags from album titles."""
    if not album:
        return ""
    cleaned = re.sub(
        r"\s*[\(\[](?:deluxe|bonus|expanded|edition|remaster(?:ed)?|anniversary)[^\)\]]*[\)\]]",
        "",
        album,
        flags=re.IGNORECASE,
    )
    return cleaned.strip() or album.strip()


def fetch_ovh_lyrics(artist: str, title: str) -> Optional[str]:
    """Fetch plain text lyrics from free public api.lyrics.ovh fallback."""
    if not artist or not title:
        return None
    try:
        url = f"https://api.lyrics.ovh/v1/{urllib.parse.quote(artist)}/{urllib.parse.quote(title)}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            lyrics = data.get("lyrics")
            if lyrics and str(lyrics).strip():
                return str(lyrics).strip()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception:
        raise
    return None



def sanitize_lyrics_text(plain_text: Optional[str]) -> Optional[str]:
    """Sanitize and format plain lyric lines."""
    if not plain_text:
        return None
    text = plain_text.replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = text.split("\n")
    non_empty = [l for l in raw_lines if l.strip()]
    if not non_empty:
        return None

    total_words = sum(len(l.split()) for l in non_empty)
    avg_words = total_words / len(non_empty)
    has_trailing_space = any(l.endswith(" ") for l in non_empty)

    # Detect word-tokenized lyrics (e.g. 1-2 words per line or trailing spaces before \n)
    if len(non_empty) > 12 and (avg_words <= 2.3 or has_trailing_space):
        reconstructed = []
        current_line = []
        for l in raw_lines:
            stripped = l.strip()
            if not stripped:
                if current_line:
                    reconstructed.append(" ".join(current_line))
                    current_line = []
                if reconstructed and reconstructed[-1] != "":
                    reconstructed.append("")
                continue

            current_line.append(stripped)
            if stripped.endswith((".", "!", "?")) or len(current_line) >= 9 or (not l.endswith(" ") and len(current_line) >= 6):
                reconstructed.append(" ".join(current_line))
                current_line = []
        if current_line:
            reconstructed.append(" ".join(current_line))
        return "\n".join(reconstructed).strip()

    return text.strip()


def extract_embedded_lyrics_text(audio_path: Path) -> Optional[Dict[str, Any]]:
    """Inspect audio file tags (ID3 USLT/SYLT, Vorbis LYRICS, MP4 lyr) for embedded lyrics."""
    try:
        audio = mutagen.File(str(audio_path))
        if audio is None:
            return None

        # 1. FLAC / OGG Vorbis
        if isinstance(audio, FLAC) or hasattr(audio, "tags") and isinstance(audio.tags, dict):
            for key in ["lyrics", "unsyncedlyrics", "unsynced lyrics", "lyric"]:
                val = audio.get(key)
                if val:
                    text = str(val[0] if isinstance(val, list) else val).strip()
                    if text:
                        is_synced = "[" in text and "]" in text and any(f"[{i:02d}:" in text for i in range(10))
                        return {
                            "syncedLyrics": text if is_synced else None,
                            "plainLyrics": None if is_synced else sanitize_lyrics_text(text),
                            "source": "embedded_tag",
                        }

        # 2. MP4 / M4A
        if isinstance(audio, MP4) and audio.tags:
            cov = audio.tags.get("\xa9lyr")
            if cov and len(cov) > 0:
                text = str(cov[0]).strip()
                if text:
                    is_synced = "[" in text and "]" in text and any(f"[{i:02d}:" in text for i in range(10))
                    return {
                        "syncedLyrics": text if is_synced else None,
                        "plainLyrics": None if is_synced else sanitize_lyrics_text(text),
                        "source": "embedded_tag",
                    }

        # 3. ID3 tags (MP3, etc.)
        if hasattr(audio, "tags") and audio.tags:
            for key in audio.tags.keys():
                if key.startswith("USLT") or key.startswith("SYLT"):
                    frame = audio.tags[key]
                    text = getattr(frame, "text", "")
                    if text and str(text).strip():
                        t_str = str(text).strip()
                        is_synced = key.startswith("SYLT") or ("[" in t_str and "]" in t_str and any(f"[{i:02d}:" in t_str for i in range(10)))
                        return {
                            "syncedLyrics": t_str if is_synced else None,
                            "plainLyrics": None if is_synced else sanitize_lyrics_text(t_str),
                            "source": "embedded_tag",
                        }
    except Exception as e:
        logger.debug(f"Could not parse embedded lyrics from {audio_path.name}: {e}")

    return None


class LyricsBackgroundFetcher:
    """
    Polite, resilient background crawler for library lyrics.
    Guarantees zero IP blocks by strictly enforcing:
    1. Local-first check (local .lrc file and embedded tags require 0 network calls)
    2. Conservative rate limit: 2.5 seconds sleep between outbound API queries
    3. Negative caching: 404 responses are cached permanently so songs are never re-queried
    4. HTTP 429 adaptive backoff: pauses for Retry-After + 15 seconds safety buffer
    5. Circuit breaker: 3 consecutive network failures trigger a 15-minute sleep
    6. Priority queue: actively playing songs bypass the backlog queue immediately
    """

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.worker_thread: Optional[threading.Thread] = None

        self.queue_lock = threading.Lock()
        self.high_priority_queue: List[int] = []
        self.backlog_queue: List[int] = []

        self.current_track_name: Optional[str] = None
        self.last_network_request_time: float = 0.0
        self.consecutive_network_errors: int = 0
        self.circuit_breaker_until: float = 0.0
        self.telegram_notified: bool = False

        self.min_request_interval: float = 2.5  # 2.5 seconds between remote HTTP requests

    def start(self):
        """Start the background daemon worker."""
        if self.worker_thread and self.worker_thread.is_alive():
            return

        self.is_running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="LyricsFetcherWorker")
        self.worker_thread.start()
        logger.info("[LyricsFetcher] Background auto-fetcher worker started.")

    def pause(self):
        """Pause background auto-fetching."""
        self.is_paused = True
        logger.info("[LyricsFetcher] Background worker paused by user.")

    def resume(self):
        """Resume background auto-fetching."""
        self.is_paused = False
        logger.info("[LyricsFetcher] Background worker resumed by user.")

    def enqueue_tracks(self, track_ids: List[int], high_priority: bool = False):
        """Enqueue track IDs for processing."""
        with self.queue_lock:
            if high_priority:
                # Add to high priority without duplicates
                for tid in track_ids:
                    if tid not in self.high_priority_queue:
                        self.high_priority_queue.insert(0, tid)
            else:
                existing_set = set(self.backlog_queue) | set(self.high_priority_queue)
                for tid in track_ids:
                    if tid not in existing_set:
                        self.backlog_queue.append(tid)

    def rescan_missing_tracks(self):
        """Refill backlog queue with all tracks currently missing lyrics."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id FROM tracks 
                WHERE lyrics_status IS NULL OR lyrics_status = 'pending' OR lyrics_status = 'not_found'
                ORDER BY id ASC
            """)
            missing_ids = [row["id"] for row in cursor.fetchall()]

        self.enqueue_tracks(missing_ids, high_priority=False)
        self.telegram_notified = False
        logger.info(f"[LyricsFetcher] Enqueued {len(missing_ids)} missing tracks for background retrieval.")

    def reset_unmatched_tracks(self) -> int:
        """
        Reset tracks previously marked 'not_found' due to 503/network errors.
        Deletes stale negative cache files and enqueues them for fresh retrieval.
        """
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM tracks WHERE lyrics_status = 'not_found' ORDER BY id ASC")
            rows = cursor.fetchall()
            reset_ids = [r["id"] for r in rows]

            if reset_ids:
                conn.execute("UPDATE tracks SET lyrics_status = 'pending' WHERE lyrics_status = 'not_found'")

        # Delete negative cache files
        deleted_count = 0
        for tid in reset_ids:
            remove_track_from_lyrics_fts(tid)
            cache_file = LYRICS_DIR / f"{tid}.json"
            if cache_file.exists():
                try:
                    data = json.loads(cache_file.read_text(encoding="utf-8"))
                    if data.get("notFound") is True or (not data.get("syncedLyrics") and not data.get("plainLyrics")):
                        cache_file.unlink()
                        deleted_count += 1
                except Exception:
                    try:
                        cache_file.unlink()
                        deleted_count += 1
                    except Exception:
                        pass

        # Enqueue back into backlog queue
        if reset_ids:
            self.enqueue_tracks(reset_ids, high_priority=False)
            self.telegram_notified = False
            logger.info(f"[LyricsFetcher] Reset {len(reset_ids)} 'not_found' tracks (deleted {deleted_count} negative cache files).")

        return len(reset_ids)

    def save_custom_lyrics(self, track_id: int, lyrics_text: str, is_synced: Optional[bool] = None) -> Dict[str, Any]:
        """Save user-edited or custom pasted lyrics for a track."""
        text = lyrics_text.strip()
        if not text:
            raise ValueError("Lyrics text cannot be empty")

        if is_synced is None:
            # Auto-detect LRC timestamp format like [00:12.34] or [01:23]
            is_synced = bool(re.search(r"\[\d{2}:\d{2}", text))

        cache_file = LYRICS_DIR / f"{track_id}.json"
        result = {
            "track_id": track_id,
            "syncedLyrics": text if is_synced else None,
            "plainLyrics": None if is_synced else sanitize_lyrics_text(text),
            "source": "manual",
            "updated_at": int(time.time()),
        }
        cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

        status = "synced" if is_synced else "plain"
        self._update_db_lyrics_status(track_id, status)
        sync_track_to_lyrics_fts(track_id, text)

        # Attempt to save .lrc sidecar file next to audio file on disk
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT file_path FROM tracks WHERE id = ?", (track_id,))
                row = cursor.fetchone()
            if row and row["file_path"]:
                audio_path = Path(row["file_path"])
                if audio_path.exists():
                    lrc_path = audio_path.with_suffix(".lrc")
                    lrc_path.write_text(text, encoding="utf-8", errors="ignore")
                    logger.info(f"[LyricsFetcher] Saved .lrc sidecar file for track {track_id} to {lrc_path}")
        except Exception as e:
            logger.warning(f"[LyricsFetcher] Could not write .lrc sidecar for track {track_id}: {e}")

        return result

    def _wait_for_rate_limit(self):
        """Enforce polite 2.5s delay between outbound network requests."""
        elapsed = time.time() - self.last_network_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
        self.last_network_request_time = time.time()

    def fetch_single_track(self, track_id: int, force: bool = False) -> Dict[str, Any]:
        """
        Fetch lyrics for a single track following the multi-tier waterfall:
        1. Local cache in /data/lyrics/{track_id}.json
        2. Local .lrc sidecar file next to audio file
        3. Embedded audio tags in file (FLAC, MP3, MP4)
        4. Outbound LRCLIB API (Exact match & Fuzzy clean match)
        5. Public Lyrics.ovh API fallback (plain text)
        """
        cache_file = LYRICS_DIR / f"{track_id}.json"

        # Check existing cached JSON file
        if not force and cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                if cached_data.get("plainLyrics"):
                    cached_data["plainLyrics"] = sanitize_lyrics_text(cached_data["plainLyrics"])
                return cached_data
            except Exception:
                pass

        # Query track metadata from database
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    t.id, t.title, t.duration_seconds, t.file_path,
                    a.title AS album_title,
                    ar.name AS artist_name
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON t.artist_id = ar.id
                WHERE t.id = ?
            """, (track_id,))
            track = cursor.fetchone()

        if not track:
            return {"track_id": track_id, "syncedLyrics": None, "plainLyrics": None, "source": "none", "notFound": True}

        audio_path = Path(track["file_path"])

        # ─── TIER 1: Local .lrc Sidecar File (0 network calls) ───────────────
        lrc_cand = audio_path.with_suffix(".lrc")
        if lrc_cand.exists() and lrc_cand.is_file():
            try:
                lrc_text = lrc_cand.read_text(encoding="utf-8", errors="ignore").strip()
                if lrc_text:
                    result = {
                        "track_id": track_id,
                        "syncedLyrics": lrc_text,
                        "plainLyrics": None,
                        "source": "local_lrc",
                    }
                    cache_file.write_text(json.dumps(result), encoding="utf-8")
                    self._update_db_lyrics_status(track_id, "synced")
                    sync_track_to_lyrics_fts(track_id, lrc_text)
                    return result
            except Exception as e:
                logger.debug(f"Error reading local .lrc for {track_id}: {e}")

        # ─── TIER 2: Embedded Audio Tags (0 network calls) ───────────────────
        if audio_path.exists():
            embedded = extract_embedded_lyrics_text(audio_path)
            if embedded and (embedded.get("syncedLyrics") or embedded.get("plainLyrics")):
                result = {
                    "track_id": track_id,
                    "syncedLyrics": embedded.get("syncedLyrics"),
                    "plainLyrics": embedded.get("plainLyrics"),
                    "source": "embedded_tag",
                }
                cache_file.write_text(json.dumps(result), encoding="utf-8")
                status = "synced" if embedded.get("syncedLyrics") else "plain"
                self._update_db_lyrics_status(track_id, status)
                sync_track_to_lyrics_fts(track_id, embedded.get("syncedLyrics") or embedded.get("plainLyrics"))
                return result

        # ─── TIER 3 & 4: Outbound APIs (LRCLIB & Lyrics.ovh) ─────────────────
        if time.time() < self.circuit_breaker_until:
            cooldown_rem = int(self.circuit_breaker_until - time.time())
            logger.warning(f"[LyricsFetcher] Circuit breaker active. Cooling down for {cooldown_rem}s.")
            return {
                "track_id": track_id,
                "syncedLyrics": None,
                "plainLyrics": None,
                "source": "none",
                "notFound": False,
                "transient": True,
            }

        raw_title = track["title"] or ""
        raw_artist = track["artist_name"] or ""
        raw_album = track["album_title"] or ""
        duration_sec = int(track["duration_seconds"] or 0)

        cleaned_title = clean_title_for_search(raw_title)
        cleaned_artist = clean_artist_for_search(raw_artist)
        cleaned_album = clean_album_for_search(raw_album)

        lrclib_data = None
        has_transient_error = False

        # Step 3a: Exact match via LRCLIB /api/get
        try:
            self._wait_for_rate_limit()
            params = {
                "artist_name": cleaned_artist or raw_artist,
                "track_name": cleaned_title or raw_title,
                "album_name": cleaned_album or raw_album,
                "duration": duration_sec,
            }
            url = f"https://lrclib.net/api/get?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=5) as response:
                lrclib_data = json.loads(response.read().decode("utf-8"))
            self.consecutive_network_errors = 0
        except urllib.error.HTTPError as http_err:
            if http_err.code == 429:
                self._handle_rate_limit(http_err)
                has_transient_error = True
            elif http_err.code in (500, 502, 503, 504):
                has_transient_error = True
                self._handle_network_error(http_err)
            elif http_err.code != 404:
                self._handle_network_error(http_err)
        except Exception as e:
            has_transient_error = True
            self._handle_network_error(e)

        # Step 3b: Search fallback on LRCLIB if exact match had no synced lyrics
        if (not lrclib_data or not lrclib_data.get("syncedLyrics")) and time.time() >= self.circuit_breaker_until:
            try:
                self._wait_for_rate_limit()
                query = f"{cleaned_artist} {cleaned_title}".strip()
                url = f"https://lrclib.net/api/search?q={urllib.parse.quote(query)}"
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=5) as response:
                    items = json.loads(response.read().decode("utf-8"))
                    if items and isinstance(items, list):
                        synced_match = next((it for it in items if it.get("syncedLyrics")), None)
                        if synced_match:
                            lrclib_data = synced_match
                        elif not lrclib_data and items:
                            plain_match = next((it for it in items if it.get("plainLyrics")), None)
                            if plain_match:
                                lrclib_data = plain_match
                self.consecutive_network_errors = 0
            except urllib.error.HTTPError as http_err:
                if http_err.code == 429:
                    self._handle_rate_limit(http_err)
                    has_transient_error = True
                elif http_err.code in (500, 502, 503, 504):
                    has_transient_error = True
                    self._handle_network_error(http_err)
                elif http_err.code != 404:
                    self._handle_network_error(http_err)
            except Exception as e:
                has_transient_error = True
                self._handle_network_error(e)

        # If lyrics found on LRCLIB
        if lrclib_data and (lrclib_data.get("syncedLyrics") or lrclib_data.get("plainLyrics")):
            result = {
                "track_id": track_id,
                "syncedLyrics": lrclib_data.get("syncedLyrics"),
                "plainLyrics": sanitize_lyrics_text(lrclib_data.get("plainLyrics")),
                "source": "lrclib",
            }
            cache_file.write_text(json.dumps(result), encoding="utf-8")
            status = "synced" if lrclib_data.get("syncedLyrics") else "plain"
            self._update_db_lyrics_status(track_id, status)
            sync_track_to_lyrics_fts(track_id, lrclib_data.get("syncedLyrics") or lrclib_data.get("plainLyrics"))
            return result

        # ─── TIER 4: Secondary Provider Fallback: Lyrics.ovh (Plain) ─────────
        if time.time() >= self.circuit_breaker_until:
            try:
                self._wait_for_rate_limit()
                ovh_lyrics = fetch_ovh_lyrics(cleaned_artist or raw_artist, cleaned_title or raw_title)
                if ovh_lyrics:
                    sanitized_ovh = sanitize_lyrics_text(ovh_lyrics)
                    if sanitized_ovh:
                        result = {
                            "track_id": track_id,
                            "syncedLyrics": None,
                            "plainLyrics": sanitized_ovh,
                            "source": "lyrics_ovh",
                        }
                        cache_file.write_text(json.dumps(result), encoding="utf-8")
                        self._update_db_lyrics_status(track_id, "plain")
                        sync_track_to_lyrics_fts(track_id, sanitized_ovh)
                        return result
            except urllib.error.HTTPError as http_err:
                if http_err.code in (500, 502, 503, 504):
                    has_transient_error = True
                elif http_err.code != 404:
                    logger.debug(f"Lyrics.ovh HTTP {http_err.code} for track {track_id}")
            except Exception as e:
                logger.debug(f"Lyrics.ovh request failed for track {track_id}: {e}")

        # If transient network error occurred (503 / timeout), DO NOT negative cache!
        if has_transient_error:
            logger.warning(f"[LyricsFetcher] Transient network error for track {track_id} ({raw_artist} - {raw_title}). Will retry later.")
            return {
                "track_id": track_id,
                "syncedLyrics": None,
                "plainLyrics": None,
                "source": "none",
                "notFound": False,
                "transient": True,
            }

        # Negative Caching (Only when affirmatively 404 across providers)
        not_found_result = {
            "track_id": track_id,
            "syncedLyrics": None,
            "plainLyrics": None,
            "source": "none",
            "notFound": True,
        }
        try:
            cache_file.write_text(json.dumps(not_found_result), encoding="utf-8")
        except Exception:
            pass

        self._update_db_lyrics_status(track_id, "not_found")
        return not_found_result

    def _handle_rate_limit(self, http_err):
        """Adaptive 429 backoff handling."""
        retry_after = 10
        try:
            retry_header = http_err.headers.get("Retry-After")
            if retry_header:
                retry_after = int(retry_header)
        except Exception:
            pass

        cooldown = retry_after + 15
        logger.warning(f"[LyricsFetcher] HTTP 429 received. Backing off for {cooldown} seconds.")
        time.sleep(cooldown)

    def _handle_network_error(self, err):
        """Circuit breaker increment."""
        self.consecutive_network_errors += 1
        logger.warning(f"[LyricsFetcher] Network error: {err} (consecutive: {self.consecutive_network_errors})")
        if self.consecutive_network_errors >= 3:
            # Trip circuit breaker for 15 minutes
            self.circuit_breaker_until = time.time() + 900
            logger.error("[LyricsFetcher] 3 consecutive errors! Trip circuit breaker for 15 minutes.")

    def _update_db_lyrics_status(self, track_id: int, status: str):
        """Update tracks.lyrics_status in SQLite."""
        try:
            with get_db() as conn:
                conn.execute("UPDATE tracks SET lyrics_status = ? WHERE id = ?", (status, track_id))
        except Exception as e:
            logger.debug(f"Failed to update lyrics_status for track {track_id}: {e}")

    def _worker_loop(self):
        """Background crawl thread loop."""
        # Warmup delay: wait 15 seconds after server boot before crawling
        time.sleep(15)

        while self.is_running:
            try:
                # Handle user pause
                if self.is_paused:
                    self.current_track_name = None
                    time.sleep(1.0)
                    continue

                # Handle circuit breaker
                if time.time() < self.circuit_breaker_until:
                    self.current_track_name = "Cooling down (Circuit breaker active)"
                    time.sleep(5.0)
                    continue

                # 1. Check High Priority Queue (Actively Playing / User Opened)
                next_track_id = None
                with self.queue_lock:
                    if self.high_priority_queue:
                        next_track_id = self.high_priority_queue.pop(0)

                # 2. Check Backlog Queue
                if not next_track_id:
                    with self.queue_lock:
                        if self.backlog_queue:
                            next_track_id = self.backlog_queue.pop(0)

                # 3. Refill Backlog from Database if Empty
                if not next_track_id:
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute("""
                            SELECT id, title FROM tracks
                            WHERE lyrics_status IS NULL OR lyrics_status = 'pending'
                            ORDER BY id ASC
                            LIMIT 100
                        """)
                        rows = cursor.fetchall()

                    if rows:
                        with self.queue_lock:
                            for r in rows:
                                if r["id"] not in self.backlog_queue:
                                    self.backlog_queue.append(r["id"])
                            if self.backlog_queue:
                                next_track_id = self.backlog_queue.pop(0)

                # 4. If entirely finished, check for Telegram Notification
                if not next_track_id:
                    self.current_track_name = None
                    self._check_completion_notification()
                    time.sleep(10.0)  # Sleep when all tracks processed
                    continue

                # Process the track
                self._process_queued_track(next_track_id)

            except Exception as e:
                logger.error(f"[LyricsFetcher] Uncaught error in worker loop: {e}", exc_info=True)
                time.sleep(3.0)

    def _process_queued_track(self, track_id: int):
        """Process a single queued track."""
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT t.title, ar.name as artist 
                    FROM tracks t
                    JOIN artists ar ON t.artist_id = ar.id
                    WHERE t.id = ?
                """, (track_id,))
                row = cursor.fetchone()

            if row:
                self.current_track_name = f"{row['artist']} - {row['title']}"

            # Fetch lyrics (handles local files, tags, LRCLIB with 2.5s pacing)
            self.fetch_single_track(track_id)

        except Exception as e:
            logger.debug(f"[LyricsFetcher] Error processing track {track_id}: {e}")

    def _check_completion_notification(self):
        """Send automated Telegram notification once when library backlog finishes."""
        if self.telegram_notified:
            return

        status = self.get_status()
        total = status["total_tracks"]
        pending = status["pending_count"]

        # Only notify if we have tracks and pending is zero
        if total > 0 and pending == 0:
            synced = status["synced_count"]
            plain = status["plain_count"]
            not_found = status["not_found_count"]
            percent = round((synced / total) * 100, 1) if total > 0 else 0

            msg = (
                f"🎉 Lyrics Auto-Search Complete on MattLab Music!\n\n"
                f"• Total Library Tracks: {total:,}\n"
                f"• Synced Karaoke Lyrics: {synced:,} ({percent}%)\n"
                f"• Plain Lyrics: {plain:,}\n"
                f"• Unmatched / Instrumental: {not_found:,}\n\n"
                f"All future added songs will be auto-indexed on import."
            )

            try:
                subprocess.run(["/usr/local/bin/tg-notify", msg], check=False, timeout=10)
                logger.info("[LyricsFetcher] Dispatched completion notification to Telegram.")
            except Exception as e:
                logger.warning(f"[LyricsFetcher] Could not dispatch tg-notify: {e}")

            self.telegram_notified = True

    def get_status(self) -> Dict[str, Any]:
        """Return comprehensive status for frontend Settings dashboard."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) AS total FROM tracks")
            total = cursor.fetchone()["total"]

            cursor.execute("SELECT COUNT(*) AS c FROM tracks WHERE lyrics_status = 'synced'")
            synced = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(*) AS c FROM tracks WHERE lyrics_status = 'plain'")
            plain = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(*) AS c FROM tracks WHERE lyrics_status = 'not_found'")
            not_found = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(*) AS c FROM tracks WHERE lyrics_status IS NULL OR lyrics_status = 'pending'")
            pending = cursor.fetchone()["c"]

        processed = total - pending
        progress_pct = round((processed / total) * 100, 1) if total > 0 else 100.0

        is_circuit_broken = time.time() < self.circuit_breaker_until
        circuit_cooldown_rem = max(0, int(self.circuit_breaker_until - time.time()))

        with self.queue_lock:
            q_size = len(self.high_priority_queue) + len(self.backlog_queue)

        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "is_circuit_broken": is_circuit_broken,
            "circuit_cooldown_seconds": circuit_cooldown_rem,
            "total_tracks": total,
            "processed_tracks": processed,
            "synced_count": synced,
            "plain_count": plain,
            "not_found_count": not_found,
            "pending_count": pending,
            "progress_percent": progress_pct,
            "current_track": self.current_track_name,
            "queue_size": q_size,
        }


# Global singleton instance
lyrics_fetcher = LyricsBackgroundFetcher()


def start_background_lyrics_fetcher():
    """Startup hook to begin background fetching."""
    lyrics_fetcher.start()
