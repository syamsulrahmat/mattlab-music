import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { audioPreloader } from '../utils/audioPreloader';
import { shuffleArray } from '../utils/shuffle';
import { parseLrc, findActiveLyricIndex } from '../utils/lyrics';
import { useAuth } from './AuthContext';

const PlayerContext = createContext(null);

export const PlayerProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const loadedUserIdRef = useRef(null);
  const debouncePrefTimerRef = useRef(null);

  const audioRef = useRef(null);
  const standbyAudioRef = useRef(null);
  const isCrossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef(null);

  if (!audioRef.current) {
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    audioRef.current = a;
  }
  if (!standbyAudioRef.current) {
    const b = new Audio();
    b.crossOrigin = 'anonymous';
    standbyAudioRef.current = b;
  }

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('music_volume');
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [preloadedTrackIds, setPreloadedTrackIds] = useState(() => audioPreloader.getPreloadedTrackIds());
  const [preloadCount, setPreloadCountState] = useState(() => audioPreloader.getMaxPreloadCount());

  // Karaoke Mode (Pure Demucs AI Instrumental Toggle - starts OFF by default on load/reload)
  const [isKaraokeMode, setIsKaraokeMode] = useState(() => {
    try {
      localStorage.removeItem('music_karaoke_enabled');
    } catch (_) {}
    return false;
  });

  // AI Stem Status: { [trackId]: { exists: boolean, status: string, progress: number } }
  const [karaokeStemStatus, setKaraokeStemStatus] = useState({});
  const [isGeneratingStems, setIsGeneratingStems] = useState(false);

  // Live Lyrics State: { trackId, syncedLyrics, plainLyrics, parsedLines, isLoading, notFound }
  const [lyricsState, setLyricsState] = useState({
    trackId: null,
    syncedLyrics: null,
    plainLyrics: null,
    parsedLines: [],
    isLoading: false,
    notFound: false,
  });

  const fetchTrackLyrics = useCallback(async (trackId, force = false) => {
    if (!trackId) {
      setLyricsState({ trackId: null, syncedLyrics: null, plainLyrics: null, parsedLines: [], isLoading: false, notFound: false });
      return;
    }

    const cacheKey = `lyrics_cache_${trackId}`;
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          const parsedLines = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
          setLyricsState({
            trackId,
            syncedLyrics: data.syncedLyrics || null,
            plainLyrics: data.plainLyrics || data.lyrics || null,
            parsedLines,
            isLoading: false,
            notFound: !data.syncedLyrics && !data.plainLyrics && !data.lyrics,
          });
          return;
        }
      } catch (_) {}
    }

    setLyricsState((prev) => ({ ...prev, trackId, isLoading: true }));
    try {
      const res = await fetch(`/api/lyrics/${trackId}`);
      const data = await res.json();
      if (data && !data.error) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {}
        const parsedLines = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
        setLyricsState({
          trackId,
          syncedLyrics: data.syncedLyrics || null,
          plainLyrics: data.plainLyrics || data.lyrics || null,
          parsedLines,
          isLoading: false,
          notFound: !data.syncedLyrics && !data.plainLyrics && !data.lyrics,
        });
      } else {
        setLyricsState({ trackId, syncedLyrics: null, plainLyrics: null, parsedLines: [], isLoading: false, notFound: true });
      }
    } catch (_) {
      setLyricsState({ trackId, syncedLyrics: null, plainLyrics: null, parsedLines: [], isLoading: false, notFound: true });
    }
  }, []);

  useEffect(() => {
    if (currentTrack?.id) {
      fetchTrackLyrics(currentTrack.id);
    } else {
      setLyricsState({ trackId: null, syncedLyrics: null, plainLyrics: null, parsedLines: [], isLoading: false, notFound: false });
    }
  }, [currentTrack?.id, fetchTrackLyrics]);

  const activeLyricIndex = useMemo(() => {
    return findActiveLyricIndex(lyricsState.parsedLines, currentTime);
  }, [lyricsState.parsedLines, currentTime]);

  const currentLyricLine = useMemo(() => {
    if (activeLyricIndex >= 0 && lyricsState.parsedLines[activeLyricIndex]) {
      return lyricsState.parsedLines[activeLyricIndex].text;
    }
    return null;
  }, [activeLyricIndex, lyricsState.parsedLines]);

  const upcomingLyricLine = useMemo(() => {
    if (activeLyricIndex >= 0 && activeLyricIndex < lyricsState.parsedLines.length - 1) {
      return lyricsState.parsedLines[activeLyricIndex + 1].text;
    }
    if (activeLyricIndex === -1 && lyricsState.parsedLines.length > 1) {
      return lyricsState.parsedLines[1].text;
    }
    return null;
  }, [activeLyricIndex, lyricsState.parsedLines]);

  // In-app Toast Notification System
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((msg, duration = 4000) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  const fetchKaraokeStatus = useCallback(async (trackId) => {
    if (!trackId) return null;
    try {
      const res = await fetch(`/api/karaoke/${trackId}/status`);
      if (res.ok) {
        const data = await res.json();
        setKaraokeStemStatus((prev) => ({
          ...prev,
          [trackId]: data
        }));
        return data;
      }
    } catch (_) {}
    return null;
  }, []);

  const crossfadeToSource = useCallback((targetSrc, targetMode) => {
    const currentAudio = audioRef.current;
    const standbyAudio = standbyAudioRef.current;
    if (!currentTrack || !currentAudio || !standbyAudio) return;

    const baseVolume = isMuted ? 0 : volume;
    const wasPlaying = !currentAudio.paused;
    const currentTimeSnapshot = currentAudio.currentTime;

    // If audio is paused, just switch source directly without crossfade
    if (!wasPlaying) {
      setIsKaraokeMode(targetMode);
      currentAudio.src = targetSrc;
      currentAudio.currentTime = currentTimeSnapshot;
      return;
    }

    // Cancel any running crossfade
    if (crossfadeTimerRef.current) {
      cancelAnimationFrame(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    isCrossfadingRef.current = true;
    setIsKaraokeMode(targetMode);

    // Prepare standby audio
    standbyAudio.src = targetSrc;
    standbyAudio.volume = 0;
    standbyAudio.playbackRate = currentAudio.playbackRate;

    const startCrossfade = async () => {
      try {
        standbyAudio.currentTime = currentAudio.currentTime;
        await standbyAudio.play();
      } catch (err) {
        console.warn('Crossfade play interrupted:', err);
        currentAudio.src = targetSrc;
        currentAudio.currentTime = currentTimeSnapshot;
        currentAudio.volume = baseVolume;
        currentAudio.play().catch(() => {});
        isCrossfadingRef.current = false;
        return;
      }

      const durationMs = 350;
      const startTime = performance.now();

      const crossfadeStep = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));

        // Equal-power crossfade curve: constant perceived loudness
        const outFactor = Math.cos(progress * 0.5 * Math.PI);
        const inFactor = Math.sin(progress * 0.5 * Math.PI);

        currentAudio.volume = Math.max(0, Math.min(1, baseVolume * outFactor));
        standbyAudio.volume = Math.max(0, Math.min(1, baseVolume * inFactor));

        if (progress < 1) {
          crossfadeTimerRef.current = requestAnimationFrame(crossfadeStep);
        } else {
          // Completed crossfade
          currentAudio.pause();
          currentAudio.volume = 0;
          standbyAudio.volume = baseVolume;

          // Swap active audio reference
          audioRef.current = standbyAudio;
          standbyAudioRef.current = currentAudio;

          isCrossfadingRef.current = false;
          crossfadeTimerRef.current = null;
        }
      };

      crossfadeTimerRef.current = requestAnimationFrame(crossfadeStep);
    };

    if (standbyAudio.readyState >= 3) {
      startCrossfade();
    } else {
      let isHandled = false;
      const onReady = () => {
        if (isHandled) return;
        isHandled = true;
        standbyAudio.removeEventListener('canplay', onReady);
        standbyAudio.removeEventListener('seeked', onReady);
        startCrossfade();
      };

      standbyAudio.addEventListener('canplay', onReady, { once: true });
      standbyAudio.addEventListener('seeked', onReady, { once: true });

      setTimeout(() => {
        if (!isHandled) onReady();
      }, 2000);
    }
  }, [currentTrack, volume, isMuted]);

  const generateKaraokeStems = useCallback(async (trackId) => {
    if (!trackId) return;
    setIsGeneratingStems(true);
    setKaraokeStemStatus((prev) => ({
      ...prev,
      [trackId]: { exists: false, status: 'queued', progress: 0 }
    }));

    try {
      const res = await fetch(`/api/karaoke/${trackId}/generate`, { method: 'POST' });
      if (res.ok) {
        const pollTimer = setInterval(async () => {
          const statusRes = await fetch(`/api/karaoke/${trackId}/status`);
          if (statusRes.ok) {
            const data = await statusRes.json();
            setKaraokeStemStatus((prev) => ({
              ...prev,
              [trackId]: data
            }));

            if (data.exists || data.status === 'ready' || data.status === 'failed') {
              clearInterval(pollTimer);
              setIsGeneratingStems(false);

              // If currently playing this track in karaoke mode, seamlessly crossfade to instrumental!
              if ((data.exists || data.status === 'ready') && currentTrack?.id === trackId && isKaraokeMode) {
                crossfadeToSource(`/api/karaoke/${trackId}/stream/instrumental`, true);
              }
            }
          }
        }, 3000);
      } else {
        setIsGeneratingStems(false);
      }
    } catch (err) {
      console.error('Failed to request karaoke stems:', err);
      setIsGeneratingStems(false);
    }
  }, [currentTrack?.id, isKaraokeMode, crossfadeToSource]);

  const batchGenerateKaraoke = useCallback(async (trackIds) => {
    if (!Array.isArray(trackIds) || trackIds.length === 0) return;
    try {
      showToast(`⚡ Pre-caching ${trackIds.length} tracks for Karaoke...`);
      const res = await fetch('/api/karaoke/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids: trackIds })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.queued_count > 0) {
          showToast(`⚡ Queued ${data.queued_count} tracks for Karaoke (${data.already_ready_count} already cached)`);
        } else {
          showToast(`✨ All ${data.already_ready_count} tracks are already cached for Karaoke!`);
        }
        if (currentTrack?.id && trackIds.includes(currentTrack.id)) {
          fetchKaraokeStatus(currentTrack.id);
        }
        return data;
      }
    } catch (err) {
      console.error('Failed to batch generate karaoke stems:', err);
      showToast('⚠️ Failed to queue karaoke stem generation');
    }
  }, [currentTrack?.id, fetchKaraokeStatus, showToast]);

  const toggleKaraoke = useCallback(async () => {
    if (!currentTrack) return;

    let stemInfo = karaokeStemStatus[currentTrack.id];
    if (stemInfo === undefined) {
      stemInfo = await fetchKaraokeStatus(currentTrack.id);
    }

    if (!isKaraokeMode) {
      // User turned Karaoke ON
      if (stemInfo?.exists) {
        crossfadeToSource(`/api/karaoke/${currentTrack.id}/stream/instrumental`, true);
      } else {
        // Stems not ready; start stem separation
        generateKaraokeStems(currentTrack.id);
      }
    } else {
      // User turned Karaoke OFF: restore original track stream
      const preloaded = audioPreloader.getPreloadedAudio(currentTrack.id);
      const originalSrc = preloaded || currentTrack.stream_url || `/api/stream/${currentTrack.id}`;
      crossfadeToSource(originalSrc, false);
    }
  }, [isKaraokeMode, currentTrack, karaokeStemStatus, fetchKaraokeStatus, generateKaraokeStems, crossfadeToSource]);

  const saveUserPreference = useCallback((patch) => {
    if (!isAuthenticated || !user?.id) return;
    if (debouncePrefTimerRef.current) {
      clearTimeout(debouncePrefTimerRef.current);
    }
    debouncePrefTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/auth/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
      } catch (err) {
        console.warn('[PREFERENCES] Failed to save user preference:', err);
      }
    }, 500);
  }, [isAuthenticated, user?.id]);

  const handleSetVolume = useCallback((val) => {
    setVolume((prev) => {
      const nextVol = typeof val === 'function' ? val(prev) : val;
      const clamped = Math.max(0, Math.min(1, nextVol));
      saveUserPreference({ volume: clamped });
      return clamped;
    });
  }, [saveUserPreference]);

  const setPreloadCount = useCallback((count) => {
    const updated = audioPreloader.setMaxPreloadCount(count);
    setPreloadCountState(updated);
    saveUserPreference({ preloadCount: updated });
  }, [saveUserPreference]);

  const clearPreloadCache = useCallback(async () => {
    await audioPreloader.clearAll();
    setPreloadedTrackIds(new Set());
  }, []);

  // Subscribe to audioPreloader events
  useEffect(() => {
    return audioPreloader.subscribe((ids) => {
      setPreloadedTrackIds(new Set(ids));
    });
  }, []);

  // Automatically update the sliding preload window when queue or queueIndex advances
  useEffect(() => {
    if (queue.length > 0 && queueIndex >= 0) {
      audioPreloader.updateQueue(queue, queueIndex);
    }
  }, [queue, queueIndex]);

  // Synchronize favorites and preferences when authenticated user changes
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      if (loadedUserIdRef.current !== user.id) {
        loadedUserIdRef.current = user.id;

        // Apply saved user preferences if available
        const prefs = user.preferences || {};
        if (typeof prefs.volume === 'number' && !isNaN(prefs.volume)) {
          setVolume(prefs.volume);
          if (audioRef.current && !isCrossfadingRef.current) {
            audioRef.current.volume = isMuted ? 0 : prefs.volume;
          }
        }
        if (prefs.repeat && ['off', 'all', 'one'].includes(prefs.repeat)) {
          setRepeatMode(prefs.repeat);
        }
        if (typeof prefs.shuffle === 'boolean') {
          setIsShuffle(prefs.shuffle);
        }
        if (typeof prefs.preloadCount === 'number') {
          const updated = audioPreloader.setMaxPreloadCount(prefs.preloadCount);
          setPreloadCountState(updated);
        }

        // Fetch user-scoped favorites
        fetch('/api/favorites/ids', { credentials: 'include' })
          .then((res) => res.json())
          .then((ids) => {
            if (Array.isArray(ids)) {
              setFavoriteIds(new Set(ids));
            }
          })
          .catch((err) => console.error('Failed to load user favorites:', err));
      }
    } else if (!isAuthenticated) {
      loadedUserIdRef.current = null;
      setFavoriteIds(new Set());
    }
  }, [isAuthenticated, user?.id, user?.preferences, isMuted]);

  // Initialize audio element settings
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !isCrossfadingRef.current) {
      audio.volume = isMuted ? 0 : volume;
    }

    const handleTimeUpdate = (e) => {
      if (e.target !== audioRef.current) return;
      setCurrentTime(e.target.currentTime);
      if (!e.target.paused && e.target.currentTime > 0) {
        setIsBuffering(false);
      }
    };

    const handleLoadedMetadata = (e) => {
      if (e.target !== audioRef.current) return;
      setDuration(e.target.duration || 0);
    };

    const handleEnded = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsBuffering(false);
      handleNextTrackAuto();
    };

    const handlePlay = (e) => {
      if (e.target !== audioRef.current) return;
      setIsPlaying(true);
    };

    const handlePause = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsPlaying(false);
      setIsBuffering(false);
    };

    const handleWaiting = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsBuffering(true);
    };

    const handlePlaying = (e) => {
      if (e.target !== audioRef.current) return;
      setIsBuffering(false);
      setIsPlaying(true);
    };

    const handleLoadStart = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsBuffering(true);
    };

    const handleCanPlay = (e) => {
      if (e.target !== audioRef.current) return;
      if (!e.target.paused && e.target.currentTime > 0) {
        setIsBuffering(false);
      }
    };

    const handleError = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsBuffering(false);
      setIsPlaying(false);
    };

    const elements = [audioRef.current, standbyAudioRef.current].filter(Boolean);
    elements.forEach((el) => {
      el.addEventListener('timeupdate', handleTimeUpdate);
      el.addEventListener('loadedmetadata', handleLoadedMetadata);
      el.addEventListener('ended', handleEnded);
      el.addEventListener('play', handlePlay);
      el.addEventListener('pause', handlePause);
      el.addEventListener('waiting', handleWaiting);
      el.addEventListener('playing', handlePlaying);
      el.addEventListener('loadstart', handleLoadStart);
      el.addEventListener('canplay', handleCanPlay);
      el.addEventListener('error', handleError);
    });

    return () => {
      elements.forEach((el) => {
        el.removeEventListener('timeupdate', handleTimeUpdate);
        el.removeEventListener('loadedmetadata', handleLoadedMetadata);
        el.removeEventListener('ended', handleEnded);
        el.removeEventListener('play', handlePlay);
        el.removeEventListener('pause', handlePause);
        el.removeEventListener('waiting', handleWaiting);
        el.removeEventListener('playing', handlePlaying);
        el.removeEventListener('loadstart', handleLoadStart);
        el.removeEventListener('canplay', handleCanPlay);
        el.removeEventListener('error', handleError);
      });
    };
  }, [queue, queueIndex, repeatMode, isShuffle, isKaraokeMode]);

  // Sync volume to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !isCrossfadingRef.current) {
      audio.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('music_volume', volume.toString());
  }, [volume, isMuted]);

  // Prefetch karaoke stem status whenever current track changes
  useEffect(() => {
    if (currentTrack?.id) {
      fetchKaraokeStatus(currentTrack.id);
    }
  }, [currentTrack?.id, fetchKaraokeStatus]);

  // Pre-buffer alternate audio stream (instrumental or vocal) on standby element for instant 0ms crossfade
  useEffect(() => {
    if (!currentTrack?.id || isCrossfadingRef.current) return;
    const standbyAudio = standbyAudioRef.current;
    if (!standbyAudio) return;

    const stemInfo = karaokeStemStatus[currentTrack.id];
    if (stemInfo?.exists) {
      const preloadedAudio = audioPreloader.getPreloadedAudio(currentTrack.id);
      const standardUrl = preloadedAudio || currentTrack.stream_url || `/api/stream/${currentTrack.id}`;
      const instrumentalUrl = `/api/karaoke/${currentTrack.id}/stream/instrumental`;
      const targetSrc = isKaraokeMode ? standardUrl : instrumentalUrl;

      if (!standbyAudio.src || !standbyAudio.src.includes(targetSrc)) {
        standbyAudio.src = targetSrc;
        standbyAudio.preload = 'auto';
        standbyAudio.volume = 0;
      }
    }
  }, [currentTrack?.id, karaokeStemStatus, isKaraokeMode]);

  // Update Media Session API for iOS / OS lock screen controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      const cover = audioPreloader.getPreloadedCover(currentTrack.id) || currentTrack.cover_url || '/api/covers/0';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist_name,
        album: currentTrack.album_title || '',
        artwork: [
          { src: cover, sizes: '300x300', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
    }
  }, [currentTrack]);

  const playTrack = async (track, newQueue = null) => {
    // Cancel any in-flight crossfade and reset standby audio
    if (crossfadeTimerRef.current) {
      cancelAnimationFrame(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    isCrossfadingRef.current = false;

    if (standbyAudioRef.current) {
      standbyAudioRef.current.pause();
      standbyAudioRef.current.volume = 0;
      standbyAudioRef.current.src = '';
    }

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;

    if (newQueue) {
      if (isShuffle && newQueue.length > 1) {
        const others = newQueue.filter((t) => t.id !== track.id);
        const shuffledOthers = shuffleArray(others);
        setQueue([track, ...shuffledOthers]);
        setQueueIndex(0);
      } else {
        setQueue(newQueue);
        const idx = newQueue.findIndex((t) => t.id === track.id);
        setQueueIndex(idx !== -1 ? idx : 0);
      }
    }

    setCurrentTrack(track);
    setIsBuffering(true);

    // Fetch stem info
    let stemInfo = karaokeStemStatus[track.id];
    if (stemInfo === undefined) {
      fetchKaraokeStatus(track.id).then((info) => {
        if (info?.exists && isKaraokeMode && audio.src && !audio.src.includes(`/api/karaoke/${track.id}/stream/instrumental`)) {
          crossfadeToSource(`/api/karaoke/${track.id}/stream/instrumental`, true);
        }
      });
    }

    const preloadedAudio = audioPreloader.getPreloadedAudio(track.id);
    const standardUrl = preloadedAudio || track.stream_url || `/api/stream/${track.id}`;

    if (isKaraokeMode && stemInfo?.exists) {
      // Studio Stem Mode
      audio.src = `/api/karaoke/${track.id}/stream/instrumental`;
    } else {
      audio.src = standardUrl;
    }

    audio.play().catch((err) => {
      console.warn('Autoplay prevented:', err);
      setIsBuffering(false);
    });

    // Background prefetch lyrics so they render instantly with 0ms delay
    if (track?.id) {
      const cacheKey = `lyrics_cache_${track.id}`;
      if (!localStorage.getItem(cacheKey)) {
        fetch(`/api/lyrics/${track.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && !data.error) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify(data));
              } catch (_) {}
            }
          })
          .catch(() => {});
      }
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      if (queue.length > 0) {
        playTrack(queue[0]);
      }
      return;
    }

    // Determine playback state directly from the authoritative audio element
    const isCurrentlyPlaying = !audio.paused;

    if (isCurrentlyPlaying) {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
      if (isCrossfadingRef.current && standbyAudioRef.current) {
        standbyAudioRef.current.pause();
      }
    } else {
      if (audio.readyState < 3) {
        setIsBuffering(true);
      }
      setIsPlaying(true);
      audio.play().catch((err) => {
        console.warn('Play prevented:', err);
        setIsBuffering(false);
        setIsPlaying(false);
      });
      if (isCrossfadingRef.current && standbyAudioRef.current) {
        standbyAudioRef.current.play().catch(() => {});
      }
    }
  };

  const seek = (time) => {
    const audio = audioRef.current;
    audio.currentTime = time;
    if (isCrossfadingRef.current && standbyAudioRef.current) {
      standbyAudioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const handleNextTrackAuto = () => {
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio.play();
      return;
    }
    nextTrack();
  };

  const nextTrack = () => {
    if (queue.length === 0) return;

    const nextIdx = queueIndex + 1;
    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx);
      playTrack(queue[nextIdx]);
    } else if (repeatMode === 'all') {
      if (isShuffle) {
        const reshuffled = shuffleArray(queue);
        setQueue(reshuffled);
        setQueueIndex(0);
        playTrack(reshuffled[0]);
      } else {
        setQueueIndex(0);
        playTrack(queue[0]);
      }
    } else {
      setIsPlaying(false);
    }
  };

  const prevTrack = () => {
    const audio = audioRef.current;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (queue.length === 0) return;
    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      playTrack(queue[prevIdx]);
    } else {
      audio.currentTime = 0;
    }
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => {
      const next = !prev;
      if (next && queue.length > 1 && queueIndex >= 0) {
        const upcoming = queue.slice(queueIndex + 1);
        if (upcoming.length > 1) {
          const shuffledUpcoming = shuffleArray(upcoming);
          setQueue([...queue.slice(0, queueIndex + 1), ...shuffledUpcoming]);
        }
      }
      saveUserPreference({ shuffle: next });
      return next;
    });
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      let next = 'off';
      if (prev === 'off') next = 'all';
      else if (prev === 'all') next = 'one';
      else next = 'off';
      saveUserPreference({ repeat: next });
      return next;
    });
  };

  const toggleMute = () => setIsMuted((prev) => !prev);

  const toggleFavorite = async (trackId) => {
    if (!trackId) return;
    const isFav = favoriteIds.has(trackId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

    try {
      if (isFav) {
        await fetch(`/api/favorites/${trackId}`, { method: 'DELETE', credentials: 'include' });
      } else {
        await fetch(`/api/favorites/${trackId}`, { method: 'POST', credentials: 'include' });
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const addToQueue = (track) => {
    setQueue((prev) => [...prev, track]);
    if (!currentTrack) {
      playTrack(track);
    }
  };

  const playNextInQueue = (track) => {
    setQueue((prev) => {
      const nextQueue = [...prev];
      const insertIdx = queueIndex >= 0 ? queueIndex + 1 : 0;
      nextQueue.splice(insertIdx, 0, track);
      return nextQueue;
    });
    if (!currentTrack) {
      playTrack(track);
    }
  };

  const reorderQueue = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setQueue((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });

    setQueueIndex((prevIdx) => {
      if (prevIdx === fromIndex) return toIndex;
      if (prevIdx > fromIndex && prevIdx <= toIndex) return prevIdx - 1;
      if (prevIdx < fromIndex && prevIdx >= toIndex) return prevIdx + 1;
      return prevIdx;
    });
  };

  // Document Picture-in-Picture & Canvas Video PiP & Mini Player state
  const [pipWindow, setPipWindow] = useState(null);
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState(false);
  const [isCanvasPiPActive, setIsCanvasPiPActive] = useState(false);

  const canvasRef = useRef(null);
  const pipVideoRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const coverImageCacheRef = useRef({});

  // Helper to draw Spotify-style card on canvas for native OS Video PiP
  const drawPiPCanvas = useCallback((track, time, totalDuration, lyricLine = null) => {
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      canvasRef.current = canvas;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, 640, 360);

    // Subtle dark gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#1e1e1e');
    grad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);

    // Cover art (240x240 on the left)
    const coverUrl = track?.cover_url || '/api/covers/0';
    let cachedImg = coverImageCacheRef.current[coverUrl];
    if (!cachedImg) {
      cachedImg = new Image();
      cachedImg.crossOrigin = 'anonymous';
      cachedImg.src = coverUrl;
      cachedImg.onload = () => {
        coverImageCacheRef.current[coverUrl] = cachedImg;
        drawPiPCanvas(track, time, totalDuration, lyricLine);
      };
      coverImageCacheRef.current[coverUrl] = cachedImg;
    }

    // Helper for rounded rectangle fallback
    const safeRoundRect = (ctx2d, x, y, w, h, r) => {
      if (typeof ctx2d.roundRect === 'function') {
        ctx2d.roundRect(x, y, w, h, r);
      } else {
        ctx2d.rect(x, y, w, h);
      }
    };

    if (cachedImg.complete && cachedImg.naturalWidth > 0) {
      try {
        ctx.save();
        // Rounded rect for cover art
        ctx.beginPath();
        safeRoundRect(ctx, 40, 60, 240, 240, 16);
        ctx.clip();
        ctx.drawImage(cachedImg, 40, 60, 240, 240);
        ctx.restore();
      } catch (_) {
        ctx.fillStyle = '#282828';
        ctx.fillRect(40, 60, 240, 240);
      }
    } else {
      const brandColor = (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()) || '#f59e0b';
      ctx.fillStyle = '#242424';
      ctx.beginPath();
      safeRoundRect(ctx, 40, 60, 240, 240, 16);
      ctx.fill();
      ctx.fillStyle = brandColor;
      ctx.font = '64px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵', 160, 200);
      ctx.textAlign = 'left';
    }

    const brandColor = (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()) || '#f59e0b';

    // Title text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const rawTitle = track?.title || 'No Track Selected';
    const truncatedTitle = rawTitle.length > 22 ? rawTitle.substring(0, 20) + '...' : rawTitle;
    ctx.fillText(truncatedTitle, 310, 130);

    // Artist text
    ctx.fillStyle = '#b3b3b3';
    ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const rawArtist = track?.artist_name || 'MattLab Music';
    const truncatedArtist = rawArtist.length > 26 ? rawArtist.substring(0, 24) + '...' : rawArtist;
    ctx.fillText(truncatedArtist, 310, 165);

    // Live synced lyrics lines (Current sentence + Upcoming sentence)
    if (lyricLine) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const truncatedCurr = lyricLine.length > 30 ? lyricLine.substring(0, 28) + '...' : lyricLine;
      ctx.fillText(`“${truncatedCurr}”`, 310, 210);

      if (upcomingLyricLine) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const truncatedNext = upcomingLyricLine.length > 36 ? upcomingLyricLine.substring(0, 34) + '...' : upcomingLyricLine;
        ctx.fillText(truncatedNext, 310, 235);
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      safeRoundRect(ctx, 310, 195, 120, 32, 16);
      ctx.fill();
      ctx.fillStyle = brandColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('● MATTLAB', 328, 216);
    }

    // Scrubber progress bar at the bottom
    const barWidth = 560;
    const barHeight = 8;
    const barX = 40;
    const barY = 325;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    safeRoundRect(ctx, barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    const progressPct = totalDuration > 0 ? Math.min(1, Math.max(0, time / totalDuration)) : 0;
    if (progressPct > 0) {
      ctx.fillStyle = brandColor;
      ctx.beginPath();
      safeRoundRect(ctx, barX, barY, barWidth * progressPct, barHeight, 4);
      ctx.fill();
    }
  }, []);

  // Continuously update native Canvas Video PiP frame while active
  useEffect(() => {
    if (isCanvasPiPActive) {
      drawPiPCanvas(currentTrack, currentTime, duration, currentLyricLine, upcomingLyricLine);
    }
  }, [isCanvasPiPActive, currentTrack, currentTime, duration, currentLyricLine, upcomingLyricLine, drawPiPCanvas]);

  // Close PiP when main window unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pipWindow) {
        try { pipWindow.close(); } catch (_) {}
      }
      try {
        if (typeof document !== 'undefined' && 'pictureInPictureElement' in document && document.pictureInPictureElement) {
          document.exitPictureInPicture();
        }
      } catch (_) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (pipWindow) {
        try { pipWindow.close(); } catch (_) {}
      }
      try {
        if (typeof document !== 'undefined' && 'pictureInPictureElement' in document && document.pictureInPictureElement) {
          document.exitPictureInPicture();
        }
      } catch (_) {}
    };
  }, [pipWindow]);

  const togglePiP = async () => {
    // 1. If native Document PiP window is open, close it immediately and RETURN
    if (pipWindow) {
      try { pipWindow.close(); } catch (_) {}
      setPipWindow(null);
      return;
    }

    // 2. If native Video Canvas PiP is open, exit it immediately and RETURN
    const pipElem = typeof document !== 'undefined' && 'pictureInPictureElement' in document ? document.pictureInPictureElement : null;
    if (pipElem || isCanvasPiPActive) {
      try {
        if (pipElem && typeof document.exitPictureInPicture === 'function') {
          await document.exitPictureInPicture();
        }
      } catch (_) {}
      setIsCanvasPiPActive(false);
      return;
    }

    // 3. If in-page player is open, close it immediately and RETURN
    if (isMiniPlayerOpen) {
      setIsMiniPlayerOpen(false);
      return;
    }

    // 4. Try native Document Picture-in-Picture window (modern Chrome on HTTPS/localhost)
    if ('documentPictureInPicture' in window) {
      try {
        const savedMode = localStorage.getItem('mini_player_size_mode') || 'lyrics-small';
        let width = 360;
        let height = 140;
        if (savedMode === 'micro') {
          width = 185;
          height = 65;
        } else if (savedMode === 'compact') {
          width = 330;
          height = 105;
        } else if (savedMode === 'expanded') {
          width = 340;
          height = 150;
        } else if (savedMode === 'lyrics' || savedMode === 'lyrics-full') {
          width = 380;
          height = 440;
        } else if (savedMode === 'lyrics-small') {
          width = 360;
          height = 140;
        }

        const pip = await window.documentPictureInPicture.requestWindow({
          width,
          height,
        });

        // Copy styles to PiP window
        [...document.styleSheets].forEach((styleSheet) => {
          try {
            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pip.document.head.appendChild(style);
          } catch (e) {
            if (styleSheet.href) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.type = styleSheet.type;
              link.media = styleSheet.media;
              link.href = styleSheet.href;
              pip.document.head.appendChild(link);
            }
          }
        });

        const links = document.querySelectorAll('link[rel="stylesheet"]');
        links.forEach((link) => {
          try {
            const newLink = document.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.href = link.href;
            pip.document.head.appendChild(newLink);
          } catch (_) {}
        });

        pip.document.title = 'MattLab Music';
        pip.document.documentElement.style.width = '100%';
        pip.document.documentElement.style.height = '100%';
        pip.document.body.style.width = '100%';
        pip.document.body.style.height = '100%';
        pip.document.body.style.backgroundColor = '#121212';
        pip.document.body.style.margin = '0';
        pip.document.body.style.padding = '0';
        pip.document.body.style.overflow = 'hidden';
        pip.document.body.style.color = '#ffffff';
        pip.document.body.style.userSelect = 'none';
        pip.document.body.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        pip.addEventListener('pagehide', () => {
          setPipWindow(null);
        });

        setPipWindow(pip);
        return;
      } catch (err) {
        console.warn('Document Picture-in-Picture request failed:', err);
      }
    }

    // 5. Try Native Video Canvas PiP (Works over standard HTTP / LAN IP in Chrome/Edge/Brave!)
    const hasCanvasPiP =
      (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled) ||
      (typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement?.prototype && 'requestPictureInPicture' in HTMLVideoElement.prototype);
    if (hasCanvasPiP) {
      try {
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          canvasRef.current = canvas;
        }

        drawPiPCanvas(currentTrack, currentTime, duration);

        let video = pipVideoRef.current;
        if (!video) {
          video = document.createElement('video');
          video.muted = true;
          video.autoplay = true;
          video.playsInline = true;
          video.style.position = 'fixed';
          video.style.opacity = '0';
          video.style.pointerEvents = 'none';
          video.style.zIndex = '-9999';
          document.body.appendChild(video);
          pipVideoRef.current = video;

          video.addEventListener('leavepictureinpicture', () => {
            setIsCanvasPiPActive(false);
          });
        }

        const stream = canvas.captureStream ? canvas.captureStream(15) : null;
        if (stream) {
          video.srcObject = stream;
          await video.play();
          await video.requestPictureInPicture();
          setIsCanvasPiPActive(true);
          return;
        }
      } catch (err) {
        console.warn('Native Video Canvas PiP request failed:', err);
      }
    }

    // 6. Final fallback: open in-page floating mini player
    setIsMiniPlayerOpen(true);
  };

  // Smooth Volume Fade Helpers (for 30s song previews)
  const fadePause = useCallback((durationMs = 300) => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        resolve();
        return;
      }

      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      const initialVol = audio.volume;
      const steps = 12;
      const stepTime = durationMs / steps;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const factor = Math.max(0, 1 - currentStep / steps);
        audio.volume = initialVol * factor;

        if (currentStep >= steps) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          audio.pause();
          audio.volume = isMuted ? 0 : volume; // restore volume setting
          resolve();
        }
      }, stepTime);
    });
  }, [volume, isMuted]);

  const fadeResume = useCallback((durationMs = 300) => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio || !currentTrack) {
        resolve();
        return;
      }

      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      const targetVol = isMuted ? 0 : volume;
      audio.volume = 0;
      audio.play().catch(() => {});

      const steps = 12;
      const stepTime = durationMs / steps;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const factor = Math.min(1, currentStep / steps);
        audio.volume = targetVol * factor;

        if (currentStep >= steps) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          audio.volume = targetVol;
          resolve();
        }
      }, stepTime);
    });
  }, [volume, isMuted, currentTrack]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isBuffering,
        currentTime,
        duration,
        volume,
        isMuted,
        queue,
        queueIndex,
        setQueue,
        setQueueIndex,
        isShuffle,
        repeatMode,
        favoriteIds,
        isFavorite: (id) => Boolean(favoriteIds?.has?.(id)),
        toggleFavorite,
        playTrack,
        togglePlay,
        seek,
        setVolume: handleSetVolume,
        saveUserPreference,
        toggleMute,
        nextTrack,
        prevTrack,
        toggleShuffle,
        toggleRepeat,
        addToQueue,
        playNextInQueue,
        reorderQueue,
        preloadedTrackIds,
        isTrackPreloaded: (id) => Boolean(preloadedTrackIds?.has?.(id)),
        preloadCount,
        setPreloadCount,
        clearPreloadCache,
        pipWindow,
        setPipWindow,
        isMiniPlayerOpen,
        setIsMiniPlayerOpen,
        isPiPActive: Boolean(pipWindow) || isCanvasPiPActive || isMiniPlayerOpen,
        togglePiP,
        lyricsState,
        currentLyricLine,
        upcomingLyricLine,
        activeLyricIndex,
        fetchTrackLyrics,
        fadePause,
        fadeResume,
        isKaraokeMode,
        toggleKaraoke,
        karaokeStemStatus,
        isGeneratingStems,
        fetchKaraokeStatus,
        generateKaraokeStems,
        batchGenerateKaraoke,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
};
