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

const CACHE_NAME = 'mattlab-audio-preload-v7-norm';
const DEFAULT_PRELOAD_COUNT = 3;

class AudioPreloader {
  constructor() {
    this.preloadedMap = new Map(); // trackId -> { audioUrl, coverUrl, blobSize, timestamp }
    this.activeController = null;
    this.listeners = new Set();
    this.isPreloading = false;
    this.lastQueue = null;
    this.lastCurrentIndex = -1;
    this.pinnedTrackIds = new Set();

    // Automatically purge legacy CacheStorage namespaces from older buggy builds
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith('mattlab-audio-preload-') && key !== CACHE_NAME) {
            caches.delete(key).catch(() => {});
          }
        }
      }).catch(() => {});
      // Also clear current cache on first initialization after update to eliminate un-normalized audio blobs
      try {
        if (!sessionStorage.getItem('mattlab_preload_purged_v6')) {
          caches.delete(CACHE_NAME).catch(() => {});
          sessionStorage.setItem('mattlab_preload_purged_v6', '1');
        }
      } catch (_) {}
    }

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
    let savedNorm = true;
    if (typeof localStorage !== 'undefined') {
      const storedNorm = localStorage.getItem('mattlab_audio_normalization');
      if (storedNorm !== null) {
        savedNorm = storedNorm === 'true';
      }
    }
    this.audioNormalization = savedNorm;
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

  setAudioNormalization(enabled) {
    const norm = Boolean(enabled);
    if (this.audioNormalization !== norm) {
      this.audioNormalization = norm;
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

  /**
   * Pin a recently played track ID so its audio blob is retained in cache
   * when switching playlists, making cross-playlist "Previous" instant (0ms wait).
   */
  pinRecentTrack(trackId) {
    if (!trackId) return;
    this.pinnedTrackIds.add(trackId);
    // Retain at most 3 recently played tracks in pinned cache
    if (this.pinnedTrackIds.size > 3) {
      const oldest = this.pinnedTrackIds.values().next().value;
      this.pinnedTrackIds.delete(oldest);
    }
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
   *
   * Note: The active/current track is streamed directly by the native <audio>
   * element. We intentionally avoid fetching a duplicate full-file blob for the
   * current track to preserve 100% of network bandwidth for immediate playback.
   * Background preloading targets upcoming tracks sequentially.
   */
  async updateQueue(queue, currentIndex) {
    this.lastQueue = queue;
    this.lastCurrentIndex = currentIndex;

    if (!Array.isArray(queue) || currentIndex < 0 || currentIndex >= queue.length) {
      return;
    }

    const currentTrack = queue[currentIndex];

    if (this.maxPreloadCount <= 0) {
      if (this.activeController) {
        this.activeController.abort();
        this.activeController = null;
      }
      const targetTrackIds = new Set(currentTrack ? [currentTrack.id] : []);
      this.pruneOldTracks(targetTrackIds);
      return;
    }

    // Identify target track IDs (next up to maxPreloadCount songs)
    const upcomingTracks = queue.slice(currentIndex + 1, currentIndex + 1 + this.maxPreloadCount);
    const targetTrackIds = new Set(upcomingTracks.map((t) => t.id));

    // Keep current track if already cached in memory from earlier preloading
    if (currentTrack) {
      targetTrackIds.add(currentTrack.id);
    }

    // Keep recently played tracks pinned in cache so Previous track starts with 0ms buffering
    for (const pinnedId of this.pinnedTrackIds) {
      targetTrackIds.add(pinnedId);
    }

    // 1. Prune tracks outside the target window to free memory
    this.pruneOldTracks(targetTrackIds);

    // 2. Abort any ongoing preload from previous queue state
    if (this.activeController) {
      this.activeController.abort();
    }
    this.activeController = new AbortController();
    const signal = this.activeController.signal;

    // 3. Sequentially preload upcoming tracks (next 1..N songs in queue)
    const preloadList = upcomingTracks.filter((t) => !this.preloadedMap.has(t.id));
    this.preloadSequentially(preloadList, signal);
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
    const rawBase = track.stream_url || (track.mtime ? `/api/stream/${track.id}?v=${Math.floor(track.mtime)}` : `/api/stream/${track.id}`);
    const cleanBase = rawBase.split('?')[0];
    const vParam = track.mtime ? `v=${Math.floor(track.mtime)}` : '';
    const params = [];
    if (vParam) params.push(vParam);
    if (this.audioQuality === 'data_saver') params.push('quality=low');
    if (this.audioNormalization) params.push('norm=1');
    const streamUrl = params.length > 0 ? `${cleanBase}?${params.join('&')}` : cleanBase;
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
    this.pinnedTrackIds.clear();
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
