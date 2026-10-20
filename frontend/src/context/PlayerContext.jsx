import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { audioPreloader } from '../utils/audioPreloader';
import { shuffleArray } from '../utils/shuffle';
import { parseLrc, findActiveLyricIndex } from '../utils/lyrics';
import { useAuth } from './AuthContext';
import { LYRICS_CONFIG } from '../config/lyricsConfig';
import { DESIGN_TOKENS } from '../config/designTokens';

const PlayerContext = createContext(null);

const LAST_PLAYBACK_STATE_KEY = 'mattlab_playback_state';

const loadSavedPlaybackState = () => {
  try {
    const raw = localStorage.getItem(LAST_PLAYBACK_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.track && typeof parsed.track.id === 'number') {
        const rawTime = typeof parsed.currentTime === 'number' && !isNaN(parsed.currentTime) ? parsed.currentTime : 0;
        const dur = typeof parsed.duration === 'number' && !isNaN(parsed.duration) ? parsed.duration : (parsed.track.duration_seconds || 0);
        // If the track was saved at or near the end (within 2 seconds of finishing), reset to 0:00
        const isAtEnd = dur > 5 && rawTime >= dur - 2.0;
        const time = isAtEnd ? 0 : Math.max(0, rawTime);

        const q = Array.isArray(parsed.queue) && parsed.queue.length > 0 ? parsed.queue : [parsed.track];
        const qIdx = typeof parsed.queueIndex === 'number' && parsed.queueIndex >= 0 && parsed.queueIndex < q.length ? parsed.queueIndex : 0;
        return {
          track: parsed.track,
          currentTime: time,
          duration: dur,
          queue: q,
          queueIndex: qIdx,
        };
      }
    }
  } catch (err) {
    console.debug('[PlayerContext] Failed to load saved playback state:', err);
  }
  return null;
};

export const PlayerProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const loadedUserIdRef = useRef(null);
  const debouncePrefTimerRef = useRef(null);

  // Restore saved playback state on initial mount
  const savedState = useMemo(() => loadSavedPlaybackState(), []);
  const initialSeekTimeRef = useRef(savedState?.currentTime || 0);
  const hasRestoredAudioRef = useRef(false);
  const lastSavedTimeRef = useRef(0);
  const debouncePrefSaveRef = useRef(null);

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

  const [currentTrack, setCurrentTrack] = useState(() => savedState?.track || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => savedState?.currentTime || 0);
  const [duration, setDuration] = useState(() => savedState?.duration || 0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('music_volume');
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [queue, setQueue] = useState(() => savedState?.queue || []);
  const [queueIndex, setQueueIndex] = useState(() => (savedState?.track ? (savedState.queueIndex ?? 0) : -1));
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [preloadedTrackIds, setPreloadedTrackIds] = useState(() => audioPreloader.getPreloadedTrackIds());
  const [preloadCount, setPreloadCountState] = useState(() => audioPreloader.getMaxPreloadCount());
  const [audioQuality, setAudioQualityState] = useState(() => {
    try {
      return localStorage.getItem('mattlab_audio_quality') || 'original';
    } catch (_) {
      return 'original';
    }
  });

  const getTrackStreamUrl = useCallback((track, qualityOverride = null) => {
    if (!track?.id) return '';
    const q = qualityOverride || audioQuality;
    const base = `/api/stream/${track.id}`;
    return q === 'data_saver' ? `${base}?quality=low` : base;
  }, [audioQuality]);

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

  const crossfadeToSource = useCallback((targetSrc, targetMode = null) => {
    const currentAudio = audioRef.current;
    const standbyAudio = standbyAudioRef.current;
    if (!currentTrack || !currentAudio || !standbyAudio) return;

    const baseVolume = isMuted ? 0 : volume;
    const wasPlaying = !currentAudio.paused;
    const currentTimeSnapshot = currentAudio.currentTime;

    // If audio is paused, just switch source directly without crossfade
    if (!wasPlaying) {
      if (typeof targetMode === 'boolean') {
        setIsKaraokeMode(targetMode);
      }
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
    if (typeof targetMode === 'boolean') {
      setIsKaraokeMode(targetMode);
    }

    // Prepare standby audio at 0 volume so it can buffer and sync silently
    standbyAudio.src = targetSrc;
    standbyAudio.volume = 0;
    standbyAudio.playbackRate = currentAudio.playbackRate;

    let isHandled = false;

    const beginCrossfade = () => {
      if (isHandled) return;
      isHandled = true;

      const durationMs = 260; // Studio seamless equal-power crossfade
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

    const startStandbyPlayback = async () => {
      if (isHandled) return;
      try {
        await standbyAudio.play();
        // Standby audio is actively decoding and outputting audio at volume 0; now safe to crossfade!
        beginCrossfade();
      } catch (err) {
        console.warn('Standby audio playback failed:', err);
        currentAudio.volume = baseVolume;
        isCrossfadingRef.current = false;
      }
    };

    const onSeeked = () => {
      standbyAudio.removeEventListener('seeked', onSeeked);
      startStandbyPlayback();
    };

    const handleLoadedMetadata = () => {
      standbyAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      const targetTime = currentAudio.currentTime || currentTimeSnapshot;
      try {
        standbyAudio.currentTime = targetTime;
      } catch (_) {}

      // If already at or near targetTime and ready to play, start immediately
      if (Math.abs(standbyAudio.currentTime - targetTime) < 0.1 && standbyAudio.readyState >= 3) {
        startStandbyPlayback();
      } else {
        standbyAudio.addEventListener('seeked', onSeeked, { once: true });
        const onCanPlay = () => {
          if (standbyAudio.currentTime > 0 || targetTime === 0) {
            standbyAudio.removeEventListener('canplay', onCanPlay);
            onSeeked();
          }
        };
        standbyAudio.addEventListener('canplay', onCanPlay);
      }
    };

    if (standbyAudio.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      standbyAudio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
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
      const originalSrc = preloaded || getTrackStreamUrl(currentTrack);
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

  const persistState = useCallback((track, time, dur, q, qIdx) => {
    if (!track || !track.id) return;
    const rawTime = time || 0;
    const trackDur = dur || track.duration_seconds || 0;
    // If the track reached the end (within 1.5s of finishing), reset to 0:00
    const isAtEnd = trackDur > 5 && rawTime >= trackDur - 1.5;
    const cleanTime = isAtEnd ? 0 : Math.max(0, Math.round(rawTime * 10) / 10);

    const stateObj = {
      track: {
        id: track.id,
        title: track.title,
        artist_id: track.artist_id || null,
        artist_name: track.artist_name || track.artist || '',
        album_id: track.album_id || null,
        album_title: track.album_title || '',
        duration_seconds: track.duration_seconds || dur || 0,
        cover_path: track.cover_path || null,
        cover_url: track.cover_url || null,
        file_path: track.file_path || '',
        file_format: track.file_format || null,
        bitrate: track.bitrate || null,
        stream_url: track.stream_url || `/api/stream/${track.id}`,
      },
      currentTime: cleanTime,
      duration: Math.max(0, Math.round((dur || 0) * 10) / 10),
      queue: (q || []).slice(0, 50).map((t) => ({
        id: t.id,
        title: t.title,
        artist_id: t.artist_id || null,
        artist_name: t.artist_name || t.artist || '',
        album_id: t.album_id || null,
        album_title: t.album_title || '',
        duration_seconds: t.duration_seconds || 0,
        cover_url: t.cover_url || null,
        file_format: t.file_format || null,
        bitrate: t.bitrate || null,
        stream_url: t.stream_url || `/api/stream/${t.id}`,
      })),
      queueIndex: typeof qIdx === 'number' ? qIdx : 0,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(LAST_PLAYBACK_STATE_KEY, JSON.stringify(stateObj));
    } catch (_) {}

    if (debouncePrefSaveRef.current) {
      clearTimeout(debouncePrefSaveRef.current);
    }
    debouncePrefSaveRef.current = setTimeout(() => {
      saveUserPreference({ playbackState: stateObj });
    }, 6000);
  }, [saveUserPreference]);

  // Ensure currentTrack has file_format and bitrate metadata for accurate audio quality indicators
  useEffect(() => {
    if (currentTrack?.id && !currentTrack.file_format) {
      let isSubscribed = true;
      fetch(`/api/tracks/${currentTrack.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isSubscribed && data?.file_format) {
            setCurrentTrack((prev) => (prev?.id === currentTrack.id ? { ...prev, file_format: data.file_format, bitrate: data.bitrate } : prev));
          }
        })
        .catch(() => {});
      return () => {
        isSubscribed = false;
      };
    }
  }, [currentTrack?.id, currentTrack?.file_format]);

  // On startup: pre-attach stream URL to audio element and prefetch lyrics if restoring saved track
  useEffect(() => {
    if (!hasRestoredAudioRef.current && savedState?.track) {
      hasRestoredAudioRef.current = true;
      const audio = audioRef.current;
      if (audio && (!audio.src || audio.src === '' || audio.src === window.location.href)) {
        const preloadedAudio = audioPreloader.getPreloadedAudio(savedState.track.id);
        const standardUrl = preloadedAudio || getTrackStreamUrl(savedState.track);
        audio.preload = 'metadata';
        audio.src = standardUrl;
      }
      fetchTrackLyrics(savedState.track.id);
    }
  }, [savedState, fetchTrackLyrics, getTrackStreamUrl]);

  // Flush latest playback position to localStorage when window unloads or pagehides
  useEffect(() => {
    const handleBeforeUnloadState = () => {
      const audio = audioRef.current;
      if (currentTrack && audio) {
        try {
          const rawTime = audio.currentTime || currentTime || 0;
          const trackDur = audio.duration || duration || currentTrack.duration_seconds || 0;
          const isAtEnd = trackDur > 5 && rawTime >= trackDur - 1.5;
          const cleanTime = isAtEnd ? 0 : Math.max(0, rawTime);

          const stateObj = {
            track: currentTrack,
            currentTime: cleanTime,
            duration: trackDur,
            queue: (queue || []).slice(0, 50),
            queueIndex: queueIndex,
            savedAt: Date.now(),
          };
          localStorage.setItem(LAST_PLAYBACK_STATE_KEY, JSON.stringify(stateObj));
        } catch (_) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnloadState);
    window.addEventListener('pagehide', handleBeforeUnloadState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnloadState);
      window.removeEventListener('pagehide', handleBeforeUnloadState);
    };
  }, [currentTrack, currentTime, duration, queue, queueIndex]);

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

  const setAudioQuality = useCallback((mode) => {
    const validated = mode === 'data_saver' ? 'data_saver' : 'original';
    setAudioQualityState(validated);
    try {
      localStorage.setItem('mattlab_audio_quality', validated);
    } catch (_) {}
    saveUserPreference({ audioQuality: validated });
    audioPreloader.setAudioQuality(validated);
    setPreloadedTrackIds(new Set());

    // Seamless gapless on-the-fly crossfade audio stream swap
    const audio = audioRef.current;
    if (currentTrack && audio && !isKaraokeMode) {
      const newUrl = getTrackStreamUrl(currentTrack, validated);
      if (audio.src !== newUrl && !audio.src.endsWith(newUrl)) {
        crossfadeToSource(newUrl, null);
      }
    }
  }, [saveUserPreference, currentTrack, isKaraokeMode, getTrackStreamUrl, crossfadeToSource]);

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
        if (prefs.pipEngine && ['interactive', 'video'].includes(prefs.pipEngine)) {
          setPipEngineState(prefs.pipEngine);
          try {
            localStorage.setItem('music_pip_engine', prefs.pipEngine);
          } catch (_) {}
        }
        if (prefs.audioQuality && ['original', 'data_saver'].includes(prefs.audioQuality)) {
          setAudioQualityState(prefs.audioQuality);
          try {
            localStorage.setItem('mattlab_audio_quality', prefs.audioQuality);
          } catch (_) {}
          audioPreloader.setAudioQuality(prefs.audioQuality);
        }

        // Restore server-saved playback state if client has no current track
        if (!currentTrack && prefs.playbackState && prefs.playbackState.track) {
          const pb = prefs.playbackState;
          setCurrentTrack(pb.track);
          if (typeof pb.currentTime === 'number') {
            setCurrentTime(pb.currentTime);
            initialSeekTimeRef.current = pb.currentTime;
          }
          if (typeof pb.duration === 'number') {
            setDuration(pb.duration);
          }
          if (Array.isArray(pb.queue) && pb.queue.length > 0) {
            setQueue(pb.queue);
            setQueueIndex(typeof pb.queueIndex === 'number' ? pb.queueIndex : 0);
          }
          try {
            localStorage.setItem(LAST_PLAYBACK_STATE_KEY, JSON.stringify(pb));
          } catch (_) {}
          fetchTrackLyrics(pb.track.id);
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

    const updateBufferedTime = (el) => {
      if (!el || !el.buffered || el.buffered.length === 0) {
        setBufferedTime(0);
        return;
      }
      const ct = el.currentTime;
      for (let i = el.buffered.length - 1; i >= 0; i--) {
        try {
          if (el.buffered.start(i) <= ct && ct <= el.buffered.end(i)) {
            setBufferedTime(el.buffered.end(i));
            return;
          }
        } catch (_) {}
      }
      try {
        setBufferedTime(el.buffered.end(el.buffered.length - 1));
      } catch (_) {
        setBufferedTime(0);
      }
    };

    const handleProgress = (e) => {
      if (e.target !== audioRef.current) return;
      updateBufferedTime(e.target);
    };

    const handleTimeUpdate = (e) => {
      if (e.target !== audioRef.current) return;
      // Guard: do not let an uninitialized paused audio element overwrite restored currentTime
      if (initialSeekTimeRef.current > 0 && e.target.paused && e.target.currentTime === 0) {
        return;
      }
      const t = e.target.currentTime;
      setCurrentTime(t);
      updateBufferedTime(e.target);
      if (!e.target.paused && t > 0) {
        setIsBuffering(false);
      }
      // Periodically persist playback position every 2.5s while playing
      if (Math.abs(t - lastSavedTimeRef.current) >= 2.5 && !e.target.paused) {
        lastSavedTimeRef.current = t;
        persistState(currentTrack, t, e.target.duration || duration, queue, queueIndex);
      }
    };

    const handleLoadedMetadata = (e) => {
      if (e.target !== audioRef.current) return;
      const d = e.target.duration || 0;
      if (d > 0) setDuration(d);
      updateBufferedTime(e.target);

      if (initialSeekTimeRef.current > 0) {
        try {
          e.target.currentTime = initialSeekTimeRef.current;
        } catch (_) {}
        initialSeekTimeRef.current = 0;
      }
    };

    const handleEnded = (e) => {
      if (e.target !== audioRef.current || isCrossfadingRef.current) return;
      setIsBuffering(false);
      setCurrentTime(0);
      initialSeekTimeRef.current = 0;
      if (currentTrack) {
        persistState(currentTrack, 0, duration, queue, queueIndex);
      }
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
      if (currentTrack) {
        persistState(currentTrack, e.target.currentTime, duration, queue, queueIndex);
      }
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
      updateBufferedTime(e.target);
      if (initialSeekTimeRef.current > 0) {
        try {
          e.target.currentTime = initialSeekTimeRef.current;
        } catch (_) {}
        initialSeekTimeRef.current = 0;
      }
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
      el.addEventListener('progress', handleProgress);
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
        el.removeEventListener('progress', handleProgress);
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
  }, [queue, queueIndex, repeatMode, isShuffle, isKaraokeMode, currentTrack, duration, persistState]);

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
    setBufferedTime(0);
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
      const standardUrl = preloadedAudio || getTrackStreamUrl(currentTrack);
      const instrumentalUrl = `/api/karaoke/${currentTrack.id}/stream/instrumental`;
      const targetSrc = isKaraokeMode ? standardUrl : instrumentalUrl;

      if (!standbyAudio.src || !standbyAudio.src.includes(targetSrc)) {
        standbyAudio.src = targetSrc;
        standbyAudio.preload = 'auto';
        standbyAudio.volume = 0;
      }
    }
  }, [currentTrack?.id, karaokeStemStatus, isKaraokeMode]);

  // Update Media Session API for iOS / OS lock screen & PiP controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      const cover = audioPreloader.getPreloadedCover(currentTrack.id) || currentTrack.cover_url || '/api/covers/0';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist_name || currentTrack.artist || 'MattLab Music',
        album: currentTrack.album_title || 'MattLab Music',
        artwork: [
          { src: cover, sizes: '512x512', type: 'image/jpeg' },
          { src: cover, sizes: '300x300', type: 'image/jpeg' },
          { src: cover, sizes: '96x96', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
      try {
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          seek(Math.max(0, currentTime - (details.seekOffset || 10)));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          seek(Math.min(duration || 100, currentTime + (details.seekOffset || 10)));
        });
      } catch (_) {}
    }
  }, [currentTrack, currentTime, duration]);

  // Sync Media Session Playback State (enables OS play/pause toggle icons)
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Sync Media Session Position State (enables draggable timeline scrubber in PiP)
  useEffect(() => {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: 1.0,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      } catch (_) {}
    }
  }, [currentTime, duration]);

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

    initialSeekTimeRef.current = 0;
    lastSavedTimeRef.current = 0;
    const activeQueue = newQueue || queue;
    const activeIdx = newQueue ? (isShuffle ? 0 : newQueue.findIndex((t) => t.id === track.id)) : queueIndex;
    persistState(track, 0, track.duration_seconds || 0, activeQueue, activeIdx !== -1 ? activeIdx : 0);

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
    const standardUrl = preloadedAudio || getTrackStreamUrl(track);

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

    // Background pre-warm 128k LQ transcode if running in HQ mode so toggling to LQ is instant (0ms wait)
    if (track?.id && audioQuality === 'original') {
      fetch(`/api/stream/prewarm/${track.id}`, { method: 'POST' }).catch(() => {});
    }

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
      if (!audio.src || audio.src === '' || audio.src === window.location.href) {
        const preloadedAudio = audioPreloader.getPreloadedAudio(currentTrack.id);
        const standardUrl = preloadedAudio || getTrackStreamUrl(currentTrack);
        audio.src = standardUrl;
      }

      // If at or within 1.5s of the end of the song, restart cleanly from 0:00
      const trackDur = audio.duration || duration || 0;
      if (trackDur > 5 && (audio.currentTime >= trackDur - 1.5 || currentTime >= trackDur - 1.5)) {
        try {
          audio.currentTime = 0;
        } catch (_) {}
        setCurrentTime(0);
        initialSeekTimeRef.current = 0;
      } else if (initialSeekTimeRef.current > 0) {
        try {
          audio.currentTime = initialSeekTimeRef.current;
        } catch (_) {}
        initialSeekTimeRef.current = 0;
      } else if (currentTime > 0 && Math.abs(audio.currentTime - currentTime) > 0.5) {
        try {
          audio.currentTime = currentTime;
        } catch (_) {}
      }

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
    if (!audio) return;
    if (!audio.src || audio.src === '' || audio.src === window.location.href) {
      if (currentTrack) {
        const preloadedAudio = audioPreloader.getPreloadedAudio(currentTrack.id);
        const standardUrl = preloadedAudio || getTrackStreamUrl(currentTrack);
        audio.src = standardUrl;
      }
    }
    initialSeekTimeRef.current = 0;
    try {
      audio.currentTime = time;
    } catch (_) {}
    if (isCrossfadingRef.current && standbyAudioRef.current) {
      standbyAudioRef.current.currentTime = time;
    }
    setCurrentTime(time);
    persistState(currentTrack, time, duration, queue, queueIndex);
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
    setQueue((prev) => {
      const nextQueue = [...prev, track];
      if (currentTrack) {
        persistState(currentTrack, currentTime, duration, nextQueue, queueIndex);
      }
      return nextQueue;
    });
    if (!currentTrack) {
      playTrack(track);
    }
  };

  const playNextInQueue = (track) => {
    setQueue((prev) => {
      const nextQueue = [...prev];
      const insertIdx = queueIndex >= 0 ? queueIndex + 1 : 0;
      nextQueue.splice(insertIdx, 0, track);
      if (currentTrack) {
        persistState(currentTrack, currentTime, duration, nextQueue, queueIndex);
      }
      return nextQueue;
    });
    if (!currentTrack) {
      playTrack(track);
    }
  };

  const reorderQueue = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    let nextIdx = queueIndex;
    setQueue((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      if (currentTrack) {
        persistState(currentTrack, currentTime, duration, updated, nextIdx);
      }
      return updated;
    });

    setQueueIndex((prevIdx) => {
      if (prevIdx === fromIndex) nextIdx = toIndex;
      else if (prevIdx > fromIndex && prevIdx <= toIndex) nextIdx = prevIdx - 1;
      else if (prevIdx < fromIndex && prevIdx >= toIndex) nextIdx = prevIdx + 1;
      else nextIdx = prevIdx;
      return nextIdx;
    });
  };

  // Document Picture-in-Picture & Canvas Video PiP & Mini Player state
  const [pipWindow, setPipWindow] = useState(null);
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState(false);
  const [isCanvasPiPActive, setIsCanvasPiPActive] = useState(false);

  // Picture-in-Picture Display Engine ('interactive' = Document PiP [default] | 'video' = YouTube-style 16:9 Video PiP)
  const [pipEngine, setPipEngineState] = useState(() => {
    try {
      return localStorage.getItem('music_pip_engine') || 'interactive';
    } catch (_) {
      return 'interactive';
    }
  });

  const setPipEngine = useCallback((engine) => {
    const validEngine = engine === 'video' ? 'video' : 'interactive';
    setPipEngineState(validEngine);
    try {
      localStorage.setItem('music_pip_engine', validEngine);
    } catch (_) {}
    saveUserPreference({ pipEngine: validEngine });
  }, [saveUserPreference]);

  const canvasRef = useRef(null);
  const pipVideoRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const coverImageCacheRef = useRef({});

  // Helper to draw YouTube/Spotify-style card on canvas for native OS Video PiP (16:9 aspect ratio: 640x360)
  const drawPiPCanvas = useCallback((track, time, totalDuration, lyricLine = null, upcomingLyric = null) => {
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      canvasRef.current = canvas;
    } else if (canvas.width !== 640 || canvas.height !== 360) {
      canvas.width = 640;
      canvas.height = 360;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Helper for rounded rectangle fallback
    const safeRoundRect = (ctx2d, x, y, w, h, r) => {
      if (typeof ctx2d.roundRect === 'function') {
        ctx2d.roundRect(x, y, w, h, r);
      } else {
        ctx2d.rect(x, y, w, h);
      }
    };

    const coverUrl = track?.cover_url || '/api/covers/0';
    let cachedImg = coverImageCacheRef.current[coverUrl];
    if (!cachedImg) {
      cachedImg = new Image();
      cachedImg.crossOrigin = 'anonymous';
      cachedImg.src = coverUrl;
      cachedImg.onload = () => {
        coverImageCacheRef.current[coverUrl] = cachedImg;
        drawPiPCanvas(track, time, totalDuration, lyricLine, upcomingLyric);
      };
      coverImageCacheRef.current[coverUrl] = cachedImg;
    }

    const brandColor = LYRICS_CONFIG.colors.canvasActiveColor;

    // 1. Ambient blurred background or gradient (16:9 aspect ratio: 640x360)
    ctx.clearRect(0, 0, 640, 360);
    if (cachedImg.complete && cachedImg.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.filter = 'blur(28px) brightness(0.22)';
        ctx.drawImage(cachedImg, -40, -40, 720, 440);
        ctx.restore();
      } catch (_) {
        ctx.fillStyle = DESIGN_TOKENS.getCssVar('--surface-island', 'rgb(18, 18, 18)');
        ctx.fillRect(0, 0, 640, 360);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 640, 360);
      grad.addColorStop(0, DESIGN_TOKENS.getCssVar('--surface-elevated', 'rgb(31, 31, 31)'));
      grad.addColorStop(1, DESIGN_TOKENS.getCssVar('--surface-base', 'rgb(0, 0, 0)'));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 360);
    }

    // Semi-transparent overlay to ensure contrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, 640, 360);

    // 2. Cover Art (220x220 on left)
    const coverX = 36;
    const coverY = 55;
    const coverSize = 220;
    if (cachedImg.complete && cachedImg.naturalWidth > 0) {
      try {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
        ctx.beginPath();
        safeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 14);
        ctx.clip();
        ctx.drawImage(cachedImg, coverX, coverY, coverSize, coverSize);
        ctx.restore();
      } catch (_) {
        ctx.fillStyle = DESIGN_TOKENS.getCssVar('--surface-elevated2', 'rgb(36, 36, 36)');
        ctx.fillRect(coverX, coverY, coverSize, coverSize);
      }
    } else {
      ctx.fillStyle = DESIGN_TOKENS.getCssVar('--surface-elevated', 'rgb(31, 31, 31)');
      ctx.beginPath();
      safeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 14);
      ctx.fill();
      ctx.fillStyle = brandColor;
      ctx.font = '60px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵', coverX + coverSize / 2, coverY + coverSize / 2 + 20);
      ctx.textAlign = 'left';
    }

    // 3. Right Content Area (Starts at x=280)
    const textX = 280;

    // Small Brand Tag
    ctx.fillStyle = brandColor;
    ctx.font = `bold 11px ${LYRICS_CONFIG.typography.fontFamily}`;
    ctx.fillText('● MATTLAB MUSIC', textX, 75);

    // Track Title
    ctx.fillStyle = DESIGN_TOKENS.getCssVar('--content-primary', 'rgb(255, 255, 255)');
    ctx.font = `bold 24px ${LYRICS_CONFIG.typography.fontFamily}`;
    const rawTitle = track?.title || 'No Track Selected';
    const truncatedTitle = rawTitle.length > 22 ? rawTitle.substring(0, 20) + '...' : rawTitle;
    ctx.fillText(truncatedTitle, textX, 110);

    // Artist Name
    ctx.fillStyle = DESIGN_TOKENS.getCssVar('--content-secondary', 'rgb(179, 179, 179)');
    ctx.font = `600 16px ${LYRICS_CONFIG.typography.fontFamily}`;
    const rawArtist = track?.artist_name || 'MattLab';
    const truncatedArtist = rawArtist.length > 26 ? rawArtist.substring(0, 24) + '...' : rawArtist;
    ctx.fillText(truncatedArtist, textX, 138);

    // Separator line
    ctx.fillStyle = DESIGN_TOKENS.getCssVar('--border-medium', 'rgba(255, 255, 255, 0.1)');
    ctx.fillRect(textX, 156, 320, 1);

    // Live Synced Lyrics (Current + Next)
    if (lyricLine) {
      // Active line
      ctx.fillStyle = DESIGN_TOKENS.getCssVar('--content-primary', 'rgb(255, 255, 255)');
      ctx.font = `${LYRICS_CONFIG.typography.canvasWeight} 18px ${LYRICS_CONFIG.typography.fontFamily}`;
      const truncatedCurr = lyricLine.length > 30 ? lyricLine.substring(0, 28) + '...' : lyricLine;
      const displayCurr = LYRICS_CONFIG.timing.showQuotesInPiP ? `“${truncatedCurr}”` : truncatedCurr;
      ctx.fillText(displayCurr, textX, 192);

      // Upcoming line
      if (upcomingLyric && LYRICS_CONFIG.timing.showUpcomingLine) {
        ctx.fillStyle = LYRICS_CONFIG.colors.canvasUpcomingColor;
        ctx.font = `${LYRICS_CONFIG.typography.canvasWeight} 14px ${LYRICS_CONFIG.typography.fontFamily}`;
        const truncatedNext = upcomingLyric.length > 36 ? upcomingLyric.substring(0, 34) + '...' : upcomingLyric;
        ctx.fillText(truncatedNext, textX, 222);
      }
    } else {
      // If no lyrics available, show album or clean hint
      const rawAlbum = track?.album_title;
      if (rawAlbum) {
        ctx.fillStyle = DESIGN_TOKENS.getCssVar('--content-secondary', 'rgba(255, 255, 255, 0.5)');
        ctx.font = `${LYRICS_CONFIG.typography.canvasWeight} 14px ${LYRICS_CONFIG.typography.fontFamily}`;
        const truncatedAlbum = rawAlbum.length > 32 ? rawAlbum.substring(0, 30) + '...' : rawAlbum;
        ctx.fillText(`Album: ${truncatedAlbum}`, textX, 192);
      } else {
        ctx.fillStyle = DESIGN_TOKENS.getCssVar('--content-muted', 'rgba(255, 255, 255, 0.3)');
        ctx.font = `italic 14px ${LYRICS_CONFIG.typography.fontFamily}`;
        ctx.fillText('Streaming in high fidelity', textX, 192);
      }
    }

    ctx.textAlign = 'left';
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
    // 1. If native Video Canvas PiP is open, exit it immediately and RETURN
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

    // 2. If native Document PiP window is open, close it immediately and RETURN
    if (pipWindow) {
      try { pipWindow.close(); } catch (_) {}
      setPipWindow(null);
      return;
    }

    // 3. If in-page player is open, close it immediately and RETURN
    if (isMiniPlayerOpen) {
      setIsMiniPlayerOpen(false);
      return;
    }

    // 4. If user configured Video PiP (YouTube-style frameless 16:9 canvas with OS hover controls)
    if (pipEngine === 'video') {
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
          } else if (canvas.width !== 640 || canvas.height !== 360) {
            canvas.width = 640;
            canvas.height = 360;
          }

          drawPiPCanvas(currentTrack, currentTime, duration, currentLyricLine, upcomingLyricLine);

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

          const stream = canvas.captureStream ? canvas.captureStream(25) : (canvas.mozCaptureStream ? canvas.mozCaptureStream(25) : null);
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
    }

    // 5. Fallback: Document Picture-in-Picture window (with disallowReturnToOpener)
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
          disallowReturnToOpener: true,
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
        pip.document.body.style.backgroundColor = DESIGN_TOKENS.getCssVar('--surface-island', 'rgb(18, 18, 18)');
        pip.document.body.style.margin = '0';
        pip.document.body.style.padding = '0';
        pip.document.body.style.overflow = 'hidden';
        pip.document.body.style.color = DESIGN_TOKENS.getCssVar('--content-primary', 'rgb(255, 255, 255)');
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
        bufferedTime,
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
        audioQuality,
        setAudioQuality,
        getTrackStreamUrl,
        pipWindow,
        setPipWindow,
        isMiniPlayerOpen,
        setIsMiniPlayerOpen,
        pipEngine,
        setPipEngine,
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
