/**
 * audioPreloader.js
 * Intelligent background preloading service for MattLab Music.
 * 
 * Features:
 * - Preloads up to 3 upcoming songs in queue + album covers using the Cache Storage API & Blob URLs.
 * - Synchronous URL lookup to preserve iOS Safari user-gesture activation frames.
 * - Sliding window with automatic memory revocation (URL.revokeObjectURL) to prevent iOS WebKit memory leaks.
 * - Sequential downloading with AbortController so preloading never stalls current song playback.
 * - Seamless offline playback if connection drops or Unraid server goes offline.
 */

const CACHE_NAME = 'mattlab-audio-preload-v2';
const DEFAULT_PRELOAD_COUNT = 3;

class AudioPreloader {
  constructor() {
    this.preloadedMap = new Map(); // trackId -> { audioUrl, coverUrl, blobSize, timestamp }
    this.activeController = null;
    this.listeners = new Set();
    this.isPreloading = false;
    this.lastQueue = null;
    this.lastCurrentIndex = -1;

    // Load user preload preference from localStorage (0 = disabled, 1..10 = songs)
    let savedCount = DEFAULT_PRELOAD_COUNT;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('mattlab_preload_count');
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
          savedCount = parsed;
        }
      }
    }
    this.maxPreloadCount = savedCount;
    let savedQuality = 'original';
    if (typeof localStorage !== 'undefined') {
      const storedQuality = localStorage.getItem('mattlab_audio_quality');
      if (storedQuality === 'data_saver' || storedQuality === 'original') {
        savedQuality = storedQuality;
      }
    }
    this.audioQuality = savedQuality;
  }

  setAudioQuality(quality) {
    const q = quality === 'data_saver' ? 'data_saver' : 'original';
    if (this.audioQuality !== q) {
      this.audioQuality = q;
      this.clearAll();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const preloadedIds = new Set(this.preloadedMap.keys());
    for (const listener of this.listeners) {
      try {
        listener(preloadedIds);
      } catch (err) {
        console.error('Preload listener error:', err);
      }
    }
  }

  getPreloadedAudio(trackId) {
    if (!trackId) return null;
    return this.preloadedMap.get(trackId)?.audioUrl || null;
  }

  getPreloadedCover(trackId) {
    if (!trackId) return null;
    return this.preloadedMap.get(trackId)?.coverUrl || null;
  }

  isTrackPreloaded(trackId) {
    return this.preloadedMap.has(trackId);
  }

  getPreloadedTrackIds() {
    return new Set(this.preloadedMap.keys());
  }

  getMaxPreloadCount() {
    return this.maxPreloadCount;
  }

  setMaxPreloadCount(count) {
    const parsed = parseInt(count, 10);
    const validCount = isNaN(parsed) ? DEFAULT_PRELOAD_COUNT : Math.max(0, Math.min(10, parsed));
    this.maxPreloadCount = validCount;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mattlab_preload_count', String(validCount));
    }

    if (validCount === 0) {
      if (this.activeController) {
        this.activeController.abort();
        this.activeController = null;
      }
      const currentTrackId = (this.lastQueue && this.lastCurrentIndex >= 0 && this.lastQueue[this.lastCurrentIndex])
        ? this.lastQueue[this.lastCurrentIndex].id
        : null;
      const targetIds = new Set(currentTrackId ? [currentTrackId] : []);
      this.pruneOldTracks(targetIds);
    } else if (this.lastQueue && this.lastCurrentIndex >= 0) {
      this.updateQueue(this.lastQueue, this.lastCurrentIndex);
    }

    return this.maxPreloadCount;
  }

  getTotalPreloadedBytes() {
    let total = 0;
    for (const entry of this.preloadedMap.values()) {
      if (typeof entry.blobSize === 'number') {
        total += entry.blobSize;
      }
    }
    return total;
  }

  /**
   * Update the preload window based on current queue and index.
   * Target tracks: next 1..maxPreloadCount tracks in queue.
   */
  async updateQueue(queue, currentIndex) {
    this.lastQueue = queue;
    this.lastCurrentIndex = currentIndex;

    if (!Array.isArray(queue) || currentIndex < 0 || currentIndex >= queue.length) {
      return;
    }

    if (this.maxPreloadCount <= 0) {
      if (this.activeController) {
        this.activeController.abort();
        this.activeController = null;
      }
      const currentTrack = queue[currentIndex];
      const targetTrackIds = new Set(currentTrack ? [currentTrack.id] : []);
      this.pruneOldTracks(targetTrackIds);
      return;
    }

    // Identify target track IDs (next up to maxPreloadCount songs)
    const upcomingTracks = queue.slice(currentIndex + 1, currentIndex + 1 + this.maxPreloadCount);
    const targetTrackIds = new Set(upcomingTracks.map((t) => t.id));

    // Also keep current track if already cached
    const currentTrack = queue[currentIndex];
    if (currentTrack) {
      targetTrackIds.add(currentTrack.id);
    }

    // 1. Prune tracks outside the target window to free memory
    this.pruneOldTracks(targetTrackIds);

    // 2. Abort any ongoing preload from previous queue state
    if (this.activeController) {
      this.activeController.abort();
    }
    this.activeController = new AbortController();
    const signal = this.activeController.signal;

    // 3. Sequentially preload upcoming tracks that aren't loaded yet
    this.preloadSequentially(upcomingTracks, signal);
  }

  pruneOldTracks(targetTrackIds) {
    let changed = false;
    for (const [trackId, entry] of this.preloadedMap.entries()) {
      if (!targetTrackIds.has(trackId)) {
        // Revoke Object URLs to prevent iOS Safari memory accumulation
        if (entry.audioUrl && entry.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(entry.audioUrl);
        }
        if (entry.coverUrl && entry.coverUrl.startsWith('blob:')) {
          URL.revokeObjectURL(entry.coverUrl);
        }
        this.preloadedMap.delete(trackId);
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  async preloadSequentially(tracks, signal) {
    this.isPreloading = true;

    for (const track of tracks) {
      if (signal.aborted) break;
      if (this.preloadedMap.has(track.id)) continue;

      try {
        await this.preloadSingleTrack(track, signal);
      } catch (err) {
        if (signal.aborted || err?.name === 'AbortError') break;
        console.warn(`[AudioPreloader] Failed to preload track ${track.id} (${track.title}):`, err);
      }
    }

    this.isPreloading = false;
  }

  async preloadSingleTrack(track, signal) {
    const baseStreamUrl = track.stream_url || `/api/stream/${track.id}`;
    const streamUrl = this.audioQuality === 'data_saver'
      ? (baseStreamUrl.includes('?') ? `${baseStreamUrl}&quality=low` : `${baseStreamUrl}?quality=low`)
      : baseStreamUrl;
    let audioBlob = null;

    // Try Cache API if available in browser
    let hasCache = 'caches' in window;
    let cache = null;
    if (hasCache) {
      try {
        cache = await caches.open(CACHE_NAME);
      } catch (e) {
        hasCache = false;
      }
    }

    // Check if already in CacheStorage
    if (cache) {
      try {
        const cachedRes = await cache.match(streamUrl);
        if (cachedRes && cachedRes.ok) {
          audioBlob = await cachedRes.blob();
        }
      } catch (e) {
        // Fall back to fetch
      }
    }

    // If not cached, fetch from network
    if (!audioBlob) {
      if (signal.aborted) return;
      const response = await fetch(streamUrl, {
        signal,
        headers: { Accept: '*/*' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when fetching audio stream`);
      }

      // If cache is enabled, store response
      if (cache && !signal.aborted) {
        try {
          await cache.put(streamUrl, response.clone());
        } catch (e) {
          if (!signal.aborted && e?.name !== 'AbortError') {
            console.warn('[AudioPreloader] Cache.put failed:', e);
          }
        }
      }

      audioBlob = await response.blob();
    }

    if (signal.aborted) return;

    // Create persistent Blob URL
    const audioUrl = URL.createObjectURL(audioBlob);

    // Preload cover art as well
    let coverUrl = track.cover_url || (track.album_id ? `/api/covers/${track.album_id}` : null);
    if (coverUrl && cache) {
      try {
        let coverRes = await cache.match(coverUrl);
        if (!coverRes) {
          coverRes = await fetch(coverUrl, { signal });
          if (coverRes.ok) {
            await cache.put(coverUrl, coverRes.clone());
          }
        }
        if (coverRes && coverRes.ok) {
          const coverBlob = await coverRes.blob();
          coverUrl = URL.createObjectURL(coverBlob);
        }
      } catch (e) {
        // Fall back to original coverUrl string
      }
    }

    this.preloadedMap.set(track.id, {
      audioUrl,
      coverUrl,
      blobSize: audioBlob.size,
      timestamp: Date.now(),
    });

    this.notify();
  }

  /**
   * Clear all preloaded tracks and purge CacheStorage
   */
  async clearAll() {
    if (this.activeController) {
      this.activeController.abort();
    }
    for (const [, entry] of this.preloadedMap.entries()) {
      if (entry.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.audioUrl);
      if (entry.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.coverUrl);
    }
    this.preloadedMap.clear();
    this.notify();

    if ('caches' in window) {
      try {
        await caches.delete(CACHE_NAME);
      } catch (e) {
        console.warn('Failed to clear cache storage:', e);
      }
    }
  }
}

export const audioPreloader = new AudioPreloader();
