import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Mic2, Music, RefreshCw, X, ArrowDownCircle, MicOff, Mic, Loader2, Edit3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { parseLrc, formatPlainLyrics } from '../utils/lyrics';
import { LYRICS_CONFIG } from '../config/lyricsConfig';
import { DESIGN_TOKENS } from '../config/designTokens';
import { EditLyricsModal } from './EditLyricsModal';

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
        const cached = localStorage.getItem(`lyrics_cache_v2_${currentTrack.id}`) || localStorage.getItem(`lyrics_cache_${currentTrack.id}`);
        if (cached) return JSON.parse(cached);
      } catch (_) {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [romanizationMode, setRomanizationMode] = useState(() => {
    try {
      return localStorage.getItem('lyrics_romanization_mode') || 'both';
    } catch (_) {
      return 'both';
    }
  });

  const handleSetRomanizationMode = (mode) => {
    setRomanizationMode(mode);
    try {
      localStorage.setItem('lyrics_romanization_mode', mode);
    } catch (_) {}
  };

  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const userScrollTimeoutRef = useRef(null);

  const fetchLyrics = useCallback(async (trackId, forceRefresh = false) => {
    if (!trackId) return;

    const cacheKey = `lyrics_cache_v2_${trackId}`;
    let hasValidCache = false;
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey) || localStorage.getItem(`lyrics_cache_${trackId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed) {
            setLyricsData(parsed);
            hasValidCache = true;
          }
        }
      } catch (_) {}
    }

    if (!hasValidCache) {
      setIsLoading(true);
    }

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
      if (!hasValidCache) {
        setLyricsData({ notFound: true });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // When current track changes, immediately load from local cache or fetch
  useEffect(() => {
    if (currentTrack?.id) {
      setIsUserScrolled(false);
      setActiveLineIdx(-1);
      const cacheKey = `lyrics_cache_v2_${currentTrack.id}`;
      try {
        const cached = localStorage.getItem(cacheKey) || localStorage.getItem(`lyrics_cache_${currentTrack.id}`);
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

  const hasRomanization = Boolean(
    lyricsData?.hasRomanization && (lyricsData?.romanizedSynced || lyricsData?.romanizedPlain)
  );

  const parsedLines = useMemo(() => {
    if (!lyricsData?.syncedLyrics) return [];
    const orig = parseLrc(lyricsData.syncedLyrics);
    if (!lyricsData?.romanizedSynced) return orig;

    const rom = parseLrc(lyricsData.romanizedSynced);
    return orig.map((line, idx) => ({
      ...line,
      romanized: rom[idx]?.text || null,
    }));
  }, [lyricsData?.syncedLyrics, lyricsData?.romanizedSynced]);

  const plainLines = useMemo(() => {
    if (!lyricsData?.plainLyrics) return [];
    const origLines = formatPlainLyrics(lyricsData.plainLyrics).split('\n');
    const romLines = lyricsData?.romanizedPlain
      ? formatPlainLyrics(lyricsData.romanizedPlain).split('\n')
      : [];
    return origLines.map((line, idx) => ({
      text: line,
      romanized: romLines[idx] || null,
    }));
  }, [lyricsData?.plainLyrics, lyricsData?.romanizedPlain]);

  // Determine active synced line based on currentTime
  useEffect(() => {
    if (parsedLines.length === 0) {
      setActiveLineIdx(-1);
      return;
    }

    let foundIdx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time - LYRICS_CONFIG.timing.leadInOffsetSec) {
        foundIdx = i;
      } else {
        break;
      }
    }
    setActiveLineIdx(foundIdx);
  }, [currentTime, parsedLines]);

  const animFrameRef = useRef(null);

  // Smooth cubic easing scroll animation (60fps / 120fps vsync)
  const smoothScrollTo = useCallback((targetY, durationMs = LYRICS_CONFIG.animation.scrollDurationMs) => {
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
      smoothScrollTo(Math.max(0, targetScroll), LYRICS_CONFIG.animation.scrollDurationMs);
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
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-content-secondary">
        <Mic2 size={48} className="mb-4 text-content-subtle" />
        <h3 className="text-lg font-bold text-content-primary mb-1">No track playing</h3>
        <p className="text-xs text-content-muted">Play a song to view live lyrics.</p>
      </div>
    );
  }

  return (
    <div 
      data-dev-component="LyricsView"
      data-dev-file="src/components/LyricsView.jsx"
      data-dev-desc="Full-screen synchronized lyrics immersion canvas with auto-scrolling and karaoke vocal removal"
      className="h-full flex flex-col bg-gradient-to-b from-surface-elevated to-surface-island overflow-hidden select-none relative"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-island/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3.5 truncate">
          <img
            src={currentTrack.cover_url || '/api/covers/0'}
            alt=""
            className="w-11 h-11 rounded-md object-cover shadow bg-surface-elevated shrink-0"
          />
          <div className="truncate">
            <h3 className="text-sm font-bold text-content-primary truncate">{currentTrack.title}</h3>
            <p className="text-xs text-content-secondary truncate">{currentTrack.artist_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Karaoke Mode Pill */}
          <div className="flex items-center gap-2 bg-surface-elevated/90 border border-border-medium rounded-full px-2.5 py-1 text-xs text-content-primary">
            <button
              onClick={toggleKaraoke}
              className={`flex items-center gap-1.5 transition font-semibold ${
                isKaraokeMode ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'
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

          {/* Romanization 3-Way Pill (Option C: Original | Both | Romaji) */}
          {hasRomanization && (
            <div className="flex items-center bg-surface-elevated/90 border border-border-medium rounded-full p-0.5 text-xs text-content-secondary shadow-sm">
              <button
                onClick={() => handleSetRomanizationMode('original')}
                className={`px-2.5 py-1 rounded-full font-medium transition text-xs ${
                  romanizationMode === 'original'
                    ? 'bg-brand-500 text-black font-bold shadow'
                    : 'hover:text-white text-content-secondary'
                }`}
                title="Original script only (Hangul / Kanji)"
              >
                Original
              </button>
              <button
                onClick={() => handleSetRomanizationMode('both')}
                className={`px-2.5 py-1 rounded-full font-medium transition text-xs ${
                  romanizationMode === 'both'
                    ? 'bg-brand-500 text-black font-bold shadow'
                    : 'hover:text-white text-content-secondary'
                }`}
                title="Karaoke dual lines: original with romanized subtitle"
              >
                Both
              </button>
              <button
                onClick={() => handleSetRomanizationMode('romaji')}
                className={`px-2.5 py-1 rounded-full font-medium transition text-xs ${
                  romanizationMode === 'romaji'
                    ? 'bg-brand-500 text-black font-bold shadow'
                    : 'hover:text-white text-content-secondary'
                }`}
                title="Romanized pronunciation only"
              >
                Romaji
              </button>
            </div>
          )}

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="p-2 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary transition"
            title="Edit or Paste Lyrics"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => fetchLyrics(currentTrack.id, true)}
            disabled={isLoading}
            className="p-2 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary transition"
            title="Refresh Lyrics"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-brand-500' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary transition"
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
          <div className="flex flex-col items-center justify-center h-full py-24 text-content-secondary gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
            <p className="text-xs font-medium">Fetching synchronized lyrics...</p>
          </div>
        ) : parsedLines.length > 0 ? (
          /* Synchronized Karaoke Lyrics */
          <div className="max-w-3xl mx-auto space-y-6 py-12">
            {parsedLines.map((line, idx) => {
              const isActive = idx === activeLineIdx;
              const isPast = idx < activeLineIdx;
              const hasRom = Boolean(
                line.romanized &&
                line.romanized.toLowerCase().trim() !== line.text.toLowerCase().trim()
              );
              const displayText =
                romanizationMode === 'romaji' && hasRom ? line.romanized : line.text;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={(el) => (lineRefs.current[idx] = el)}
                  onClick={() => seek(line.time)}
                  className={`transition-all duration-300 cursor-pointer leading-relaxed ${
                    isActive
                      ? `${LYRICS_CONFIG.colors.activeClass} ${LYRICS_CONFIG.typography.activeWeightClass} text-2xl sm:text-3xl md:text-4xl scale-105 origin-left drop-shadow-md`
                      : isPast
                      ? `${LYRICS_CONFIG.colors.pastClass} ${LYRICS_CONFIG.typography.pastWeightClass} text-lg sm:text-xl md:text-2xl hover:text-content-primary`
                      : `${LYRICS_CONFIG.colors.idleClass} ${LYRICS_CONFIG.typography.upcomingWeightClass} text-lg sm:text-xl md:text-2xl hover:text-content-primary/70`
                  }`}
                >
                  <p>{displayText}</p>
                  {romanizationMode === 'both' && hasRom && (
                    <p
                      className={`text-sm sm:text-base md:text-lg font-normal tracking-wide mt-1 transition-all duration-300 ${
                        isActive
                          ? 'text-brand-300/90 font-medium'
                          : isPast
                          ? 'text-content-subtle/80'
                          : 'text-content-muted/70'
                      }`}
                    >
                      {line.romanized}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : plainLines.length > 0 ? (
          /* Plain Unsynced Lyrics */
          <div className="max-w-2xl mx-auto py-12 space-y-4 text-center">
            {plainLines.map((line, idx) => {
              const hasRom = Boolean(
                line.romanized &&
                line.romanized.toLowerCase().trim() !== line.text.toLowerCase().trim()
              );
              const displayText =
                romanizationMode === 'romaji' && hasRom ? line.romanized : line.text;
              return (
                <div key={idx} className="leading-relaxed">
                  <p className="text-content-primary/90 font-medium text-base sm:text-lg">
                    {displayText}
                  </p>
                  {romanizationMode === 'both' && hasRom && (
                    <p className="text-xs sm:text-sm text-content-muted mt-0.5 tracking-wide">
                      {line.romanized}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : lyricsData?.plainLyrics ? (
          /* Plain Unsynced Fallback */
          <div className="max-w-2xl mx-auto py-12 whitespace-pre-line text-content-primary/80 font-normal text-base sm:text-lg leading-loose text-center">
            {formatPlainLyrics(lyricsData.plainLyrics)}
          </div>
        ) : (
          /* Empty / Not Found State */
          <div className="flex flex-col items-center justify-center h-full py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center text-content-subtle mb-4">
              <Music size={28} />
            </div>
            <h4 className="text-lg font-bold text-content-primary mb-1.5">No lyrics available</h4>
            <p className="text-xs text-content-muted max-w-sm mb-6">
              We couldn't find lyrics for "{currentTrack.title}" by {currentTrack.artist_name} on LRCLIB or locally as a .lrc file.
            </p>
            <div className="flex items-center gap-2.5 flex-wrap justify-center">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="bg-brand-500 hover:bg-brand-400 text-black font-bold text-xs px-4 py-2 rounded-full transition flex items-center gap-1.5 shadow"
              >
                <Edit3 size={13} />
                <span>Add / Paste Lyrics</span>
              </button>
              <button
                onClick={() => fetchLyrics(currentTrack.id, true)}
                className="bg-surface-elevated hover:bg-surface-hover text-content-primary font-semibold text-xs px-4 py-2 rounded-full border border-border-medium transition flex items-center gap-2"
              >
                <RefreshCw size={13} />
                <span>Try Searching Again</span>
              </button>
            </div>
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

      {/* Edit / Paste Lyrics Modal */}
      <EditLyricsModal
        isOpen={isEditModalOpen}
        track={currentTrack}
        initialLyrics={lyricsData}
        onClose={() => setIsEditModalOpen(false)}
        onLyricsSaved={(savedData) => {
          setLyricsData(savedData);
          setIsUserScrolled(false);
          setActiveLineIdx(-1);
          if (currentTrack?.id && savedData) {
            try {
              localStorage.setItem(`lyrics_cache_v2_${currentTrack.id}`, JSON.stringify(savedData));
            } catch (_) {}
          }
        }}
      />
    </div>
  );
};
