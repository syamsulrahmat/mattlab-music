import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { audioPreloader } from '../utils/audioPreloader';
import { shuffleArray } from '../utils/shuffle';

const PlayerContext = createContext(null);

export const PlayerProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
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

  const setPreloadCount = useCallback((count) => {
    const updated = audioPreloader.setMaxPreloadCount(count);
    setPreloadCountState(updated);
  }, []);

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

  // Load initial favorites
  useEffect(() => {
    fetch('/api/favorites/ids')
      .then((res) => res.json())
      .then((ids) => {
        if (Array.isArray(ids)) {
          setFavoriteIds(new Set(ids));
        }
      })
      .catch((err) => console.error('Failed to load favorites:', err));
  }, []);

  // Initialize audio element settings
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (!audio.paused && audio.currentTime > 0) {
        setIsBuffering(false);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setIsBuffering(false);
      handleNextTrackAuto();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const handleLoadStart = () => setIsBuffering(true);
    const handleCanPlay = () => {
      if (!audio.paused && audio.currentTime > 0) {
        setIsBuffering(false);
      }
    };
    const handleError = () => {
      setIsBuffering(false);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, [queue, queueIndex, repeatMode, isShuffle]);

  // Sync volume to audio element
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;
    localStorage.setItem('music_volume', volume.toString());
  }, [volume, isMuted]);

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

  const playTrack = (track, newQueue = null) => {
    const audio = audioRef.current;
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
    const preloadedAudio = audioPreloader.getPreloadedAudio(track.id);
    audio.src = preloadedAudio || track.stream_url || `/api/stream/${track.id}`;
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
    if (!currentTrack) {
      if (queue.length > 0) {
        playTrack(queue[0]);
      }
      return;
    }

    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.readyState < 3) {
        setIsBuffering(true);
      }
      audio.play().catch((err) => {
        console.warn('Play prevented:', err);
        setIsBuffering(false);
      });
    }
  };

  const seek = (time) => {
    const audio = audioRef.current;
    audio.currentTime = time;
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
      return next;
    });
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
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
        await fetch(`/api/favorites/${trackId}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/favorites/${trackId}`, { method: 'POST' });
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
  const drawPiPCanvas = useCallback((track, time, totalDuration) => {
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
        drawPiPCanvas(track, time, totalDuration);
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
    ctx.fillText(truncatedTitle, 310, 140);

    // Artist text
    ctx.fillStyle = '#b3b3b3';
    ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const rawArtist = track?.artist_name || 'MattLab Music';
    const truncatedArtist = rawArtist.length > 26 ? rawArtist.substring(0, 24) + '...' : rawArtist;
    ctx.fillText(truncatedArtist, 310, 180);

    // MattLab Branding pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    safeRoundRect(ctx, 310, 220, 120, 32, 16);
    ctx.fill();
    ctx.fillStyle = brandColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('● MATTLAB', 328, 241);

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
      drawPiPCanvas(currentTrack, currentTime, duration);
    }
  }, [isCanvasPiPActive, currentTrack, currentTime, duration, drawPiPCanvas]);

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
        const savedMode = localStorage.getItem('mini_player_size_mode') || 'compact';
        let width = 330;
        let height = 105;
        if (savedMode === 'micro') {
          width = 180;
          height = 65;
        } else if (savedMode === 'expanded') {
          width = 340;
          height = 145;
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
        setVolume,
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
        fadePause,
        fadeResume,
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
