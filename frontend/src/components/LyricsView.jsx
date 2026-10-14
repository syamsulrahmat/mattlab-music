import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Mic2, Music, RefreshCw, X, ArrowDownCircle, MicOff, Mic, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

// Multi-format LRC Parser supporting [m:ss], [mm:ss.xx], [mm:ss.xxx], multiple timestamps per line
const parseLrc = (lrcString) => {
  if (!lrcString) return [];
  const lines = lrcString.split(/\r?\n/);
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip metadata headers like [ti:Title], [ar:Artist], etc.
    if (/^\[[a-zA-Z]+:/.test(line)) continue;

    let match;
    const timestamps = [];
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3] || '0';
      const fraction = parseFloat(`0.${fractionStr}`);
      timestamps.push(minutes * 60 + seconds + fraction);
    }

    if (timestamps.length > 0) {
      const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      if (text) {
        for (const time of timestamps) {
          parsed.push({ time, text });
        }
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
};

// Formats plain lyrics that may have word-by-word tokenized line breaks
const formatPlainLyrics = (text) => {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return '';

  const totalWords = nonEmpty.reduce((acc, l) => acc + l.trim().split(/\s+/).length, 0);
  const avgWords = totalWords / nonEmpty.length;
  const hasTrailingSpaces = nonEmpty.some((l) => l.endsWith(' '));

  if (nonEmpty.length > 10 && (avgWords <= 2.3 || hasTrailingSpaces)) {
    const reconstructed = [];
    let current = [];
    for (const l of lines) {
      const stripped = l.trim();
      if (!stripped) {
        if (current.length > 0) {
          reconstructed.push(current.join(' '));
          current = [];
        }
        if (reconstructed.length > 0 && reconstructed[reconstructed.length - 1] !== '') {
          reconstructed.push('');
        }
        continue;
      }
      current.push(stripped);
      if (stripped.endsWith('.') || stripped.endsWith('!') || stripped.endsWith('?') || current.length >= 9 || (!l.endsWith(' ') && current.length >= 6)) {
        reconstructed.push(current.join(' '));
        current = [];
      }
    }
    if (current.length > 0) reconstructed.push(current.join(' '));
    return reconstructed.join('\n');
  }

  return normalized;
};

export const LyricsView = ({ onClose }) => {
  const { 
    currentTrack, 
    currentTime, 
    duration, 
    seek,
    isKaraokeMode,
    toggleKaraoke,
    karaokeStemStatus,
    isGeneratingStems,
    generateKaraokeStems
  } = usePlayer();
  const [lyricsData, setLyricsData] = useState(() => {
    if (currentTrack?.id) {
      try {
        const cached = localStorage.getItem(`lyrics_cache_${currentTrack.id}`);
        if (cached) return JSON.parse(cached);
      } catch (_) {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const userScrollTimeoutRef = useRef(null);

  const fetchLyrics = useCallback(async (trackId, forceRefresh = false) => {
    if (!trackId) return;

    const cacheKey = `lyrics_cache_${trackId}`;
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setLyricsData(parsed);
          // If cached data is present, no need to show loading spinner
          return;
        }
      } catch (_) {}
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/lyrics/${trackId}`);
      const data = await res.json();
      setLyricsData(data);
      if (data && !data.error) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {}
      }
    } catch (err) {
      console.error('Failed to fetch lyrics:', err);
      setLyricsData({ notFound: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // When current track changes, immediately load from local cache or fetch
  useEffect(() => {
    if (currentTrack?.id) {
      setIsUserScrolled(false);
      setActiveLineIdx(-1);
      const cacheKey = `lyrics_cache_${currentTrack.id}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setLyricsData(JSON.parse(cached));
        } else {
          setLyricsData(null);
        }
      } catch (_) {
        setLyricsData(null);
      }
      fetchLyrics(currentTrack.id);
    } else {
      setLyricsData(null);
    }
  }, [currentTrack?.id, fetchLyrics]);

  const parsedLines = useMemo(() => {
    if (lyricsData?.syncedLyrics) {
      return parseLrc(lyricsData.syncedLyrics);
    }
    return [];
  }, [lyricsData?.syncedLyrics]);

  // Determine active synced line based on currentTime
  useEffect(() => {
    if (parsedLines.length === 0) {
      setActiveLineIdx(-1);
      return;
    }

    let foundIdx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time - 0.25) {
        foundIdx = i;
      } else {
        break;
      }
    }
    setActiveLineIdx(foundIdx);
  }, [currentTime, parsedLines]);

  const animFrameRef = useRef(null);

  // Smooth cubic easing scroll animation (60fps / 120fps vsync)
  const smoothScrollTo = useCallback((targetY, durationMs = 650) => {
    const container = containerRef.current;
    if (!container) return;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const startY = container.scrollTop;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) return;

    const startTime = performance.now();

    // Ease-out-cubic: 1 - (1 - t)^3
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease = 1 - Math.pow(1 - progress, 3);

      container.scrollTop = startY + diff * ease;

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Precision center container scroll for synced lyrics
  useEffect(() => {
    if (isUserScrolled) return;
    if (activeLineIdx < 0) return;

    const container = containerRef.current;
    const activeEl = lineRefs.current[activeLineIdx];
    if (container && activeEl) {
      const targetScroll = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
      smoothScrollTo(Math.max(0, targetScroll), 700);
    }
  }, [activeLineIdx, isUserScrolled, smoothScrollTo]);

  // Proportional smooth scroll for plain unsynced lyrics based on audio playback progress
  useEffect(() => {
    if (isUserScrolled) return;
    if (parsedLines.length > 0 || !lyricsData?.plainLyrics) return;
    if (!duration || duration <= 0) return;

    const container = containerRef.current;
    if (container) {
      const progress = Math.min(1, Math.max(0, currentTime / duration));
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll > 0) {
        smoothScrollTo(progress * maxScroll, 800);
      }
    }
  }, [currentTime, duration, parsedLines.length, lyricsData?.plainLyrics, isUserScrolled, smoothScrollTo]);

  // Detect manual user scrolling to avoid auto-scroll fighting user touch/mouse
  const handleContainerScroll = () => {
    // If a programmatic animation was running, stop it so user has immediate 100% control
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setIsUserScrolled(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    // Auto-resume sync after 6 seconds of user inactivity
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolled(false);
    }, 6000);
  };

  const handleResumeSync = () => {
    setIsUserScrolled(false);
    if (activeLineIdx >= 0 && lineRefs.current[activeLineIdx] && containerRef.current) {
      const container = containerRef.current;
      const activeEl = lineRefs.current[activeLineIdx];
      const targetScroll = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
      smoothScrollTo(Math.max(0, targetScroll), 600);
    }
  };

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#b3b3b3]">
        <Mic2 size={48} className="mb-4 text-[#444]" />
        <h3 className="text-lg font-bold text-white mb-1">No track playing</h3>
        <p className="text-xs text-[#777]">Play a song to view live lyrics.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#1e1e1e] to-[#121212] overflow-hidden select-none relative">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#121212]/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3.5 truncate">
          <img
            src={currentTrack.cover_url || '/api/covers/0'}
            alt=""
            className="w-11 h-11 rounded-md object-cover shadow bg-[#222] shrink-0"
          />
          <div className="truncate">
            <h3 className="text-sm font-bold text-white truncate">{currentTrack.title}</h3>
            <p className="text-xs text-[#b3b3b3] truncate">{currentTrack.artist_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Karaoke Mode Pill */}
          <div className="flex items-center gap-2 bg-[#1f1f1f]/90 border border-white/10 rounded-full px-2.5 py-1 text-xs text-white">
            <button
              onClick={toggleKaraoke}
              className={`flex items-center gap-1.5 transition font-semibold ${
                isKaraokeMode ? 'text-brand-500' : 'text-[#aaa] hover:text-white'
              }`}
              title={
                isKaraokeMode 
                  ? 'Karaoke Active (Click to restore vocals)' 
                  : karaokeStemStatus[currentTrack?.id]?.exists
                  ? 'Click to play Studio Instrumental'
                  : 'Generate Studio Instrumental with AI'
              }
            >
              <MicOff size={14} className={isKaraokeMode ? 'text-brand-500' : ''} />
              <span className="hidden sm:inline">Karaoke</span>
            </button>

            {/* Stem Badge or Generate Button */}
            {currentTrack && (
              karaokeStemStatus[currentTrack.id]?.exists ? (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <Mic size={10} className="text-brand-400" />
                  Studio
                </span>
              ) : (
                <button
                  onClick={() => generateKaraokeStems(currentTrack.id)}
                  disabled={isGeneratingStems || karaokeStemStatus[currentTrack.id]?.status === 'queued' || karaokeStemStatus[currentTrack.id]?.status === 'processing'}
                  className="flex items-center gap-1 text-[10px] font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50 transition px-1"
                  title="Generate pristine studio stems with server Demucs"
                >
                  {isGeneratingStems || karaokeStemStatus[currentTrack.id]?.status === 'processing' || karaokeStemStatus[currentTrack.id]?.status === 'queued' ? (
                    <>
                      <Loader2 size={10} className="animate-spin text-brand-500" />
                      <span>Separating (~1.5 min)...</span>
                    </>
                  ) : (
                    <span>Generate Instrumental</span>
                  )}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => fetchLyrics(currentTrack.id, true)}
            disabled={isLoading}
            className="p-2 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
            title="Refresh Lyrics"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-brand-500' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
              title="Close Lyrics"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Lyrics Content Container */}
      <div 
        ref={containerRef}
        onWheel={handleContainerScroll}
        onTouchMove={handleContainerScroll}
        className="flex-1 overflow-y-auto px-6 sm:px-12 md:px-20 py-16 space-y-6 text-center md:text-left relative"
      >
        {isLoading && !lyricsData ? (
          <div className="flex flex-col items-center justify-center h-full py-24 text-[#b3b3b3] gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
            <p className="text-xs font-medium">Fetching synchronized lyrics...</p>
          </div>
        ) : parsedLines.length > 0 ? (
          /* Synchronized Karaoke Lyrics */
          <div className="max-w-3xl mx-auto space-y-6 py-12">
            {parsedLines.map((line, idx) => {
              const isActive = idx === activeLineIdx;
              const isPast = idx < activeLineIdx;
              return (
                <p
                  key={`${line.time}-${idx}`}
                  ref={(el) => (lineRefs.current[idx] = el)}
                  onClick={() => seek(line.time)}
                  className={`transition-all duration-300 font-black cursor-pointer leading-relaxed ${
                    isActive
                      ? 'text-white text-2xl sm:text-3xl md:text-4xl scale-105 origin-left drop-shadow-md text-brand-500'
                      : isPast
                      ? 'text-white/60 text-lg sm:text-xl md:text-2xl hover:text-white'
                      : 'text-white/30 text-lg sm:text-xl md:text-2xl hover:text-white/70'
                  }`}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : lyricsData?.plainLyrics ? (
          /* Plain Unsynced Lyrics */
          <div className="max-w-2xl mx-auto py-12 whitespace-pre-line text-white/80 font-medium text-base sm:text-lg leading-loose text-center">
            {formatPlainLyrics(lyricsData.plainLyrics)}
          </div>
        ) : (
          /* Empty / Not Found State */
          <div className="flex flex-col items-center justify-center h-full py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-[#1f1f1f] flex items-center justify-center text-[#666] mb-4">
              <Music size={28} />
            </div>
            <h4 className="text-lg font-bold text-white mb-1.5">No lyrics available</h4>
            <p className="text-xs text-[#888] max-w-sm mb-6">
              We couldn't find lyrics for "{currentTrack.title}" by {currentTrack.artist_name} on LRCLIB or locally as a .lrc file.
            </p>
            <button
              onClick={() => fetchLyrics(currentTrack.id, true)}
              className="bg-[#1f1f1f] hover:bg-[#282828] text-white font-semibold text-xs px-4 py-2 rounded-full border border-white/10 transition flex items-center gap-2"
            >
              <RefreshCw size={13} />
              Try Searching Again
            </button>
          </div>
        )}
      </div>

      {/* Floating Resume Auto-Scroll Pill when User Scrolled Away */}
      {isUserScrolled && (parsedLines.length > 0 || lyricsData?.plainLyrics) && (
        <button
          onClick={handleResumeSync}
          className="absolute bottom-6 right-6 bg-brand-500 hover:bg-brand-400 text-black font-bold text-xs px-3.5 py-2 rounded-full shadow-2xl transition-all duration-200 active:scale-95 flex items-center gap-1.5 z-20 animate-bounce"
        >
          <ArrowDownCircle size={15} />
          <span>Resume Auto-scroll</span>
        </button>
      )}
    </div>
  );
};
