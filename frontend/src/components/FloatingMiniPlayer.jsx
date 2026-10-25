import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, Pause, SkipBack, SkipForward, X, Maximize2, Minimize2, 
  ExternalLink, PictureInPicture2, MicOff, Mic2, Music, Heart 
} from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';
import { TimelineScrubber } from './TimelineScrubber';
import { LYRICS_CONFIG } from '../config/lyricsConfig';
import { DESIGN_TOKENS } from '../config/designTokens';

const formatTime = (secs) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const FloatingMiniPlayer = ({ isOpen: isOpenProp, onClose: onCloseProp }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    bufferedTime,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    pipWindow,
    isMiniPlayerOpen,
    setIsMiniPlayerOpen,
    togglePiP,
    isKaraokeMode,
    toggleKaraoke,
    lyricsState,
    activeLyricIndex,
    currentLyricLine,
    upcomingLyricLine,
    isFavorite,
    toggleFavorite,
  } = usePlayer();

  const isFav = currentTrack ? isFavorite(currentTrack.id) : false;

  const handleToggleFavorite = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (currentTrack?.id) {
      toggleFavorite(currentTrack.id);
    }
  };

  const isOpen = isOpenProp !== undefined ? isOpenProp : isMiniPlayerOpen;
  const onClose = onCloseProp || (() => setIsMiniPlayerOpen(false));

  // Mode: 'lyrics-small' (2-line lyrics: current sentence + upcoming), 'lyrics-full' (large scrolling), 'compact', 'micro', 'expanded'
  const [sizeMode, setSizeMode] = useState(() => {
    const saved = localStorage.getItem('mini_player_size_mode');
    if (saved === 'lyrics') return 'lyrics-small';
    return saved || 'lyrics-small';
  });

  // Track container dimensions to dynamically scale font size, padding, and UI elements
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        if (pipWindow) {
          return {
            width: pipWindow.innerWidth || 360,
            height: pipWindow.innerHeight || 140,
          };
        }
      } catch (_) {}
    }
    return { width: 360, height: 140 };
  });

  const smallLyricsRef = useRef(null);
  const fullLyricsRef = useRef(null);

  // Draggable position coordinates for in-page mini player
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('mini_player_pos');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return { x: Math.max(20, window.innerWidth - 370), y: Math.max(20, window.innerHeight - 180) };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const containerRef = useRef(null);

  // Full lyrics scrolling refs & state
  const lyricsContainerRef = useRef(null);
  const lineRefs = useRef([]);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const userScrollTimeoutRef = useRef(null);

  // Sync sizeMode to localStorage and update PiP window dimensions if open
  const handleSetSizeMode = (mode) => {
    setSizeMode(mode);
    localStorage.setItem('mini_player_size_mode', mode);
    if (pipWindow) {
      try {
        if (mode === 'micro') {
          pipWindow.resizeTo(185, 65);
          setDimensions({ width: 185, height: 65 });
        } else if (mode === 'compact') {
          pipWindow.resizeTo(330, 105);
          setDimensions({ width: 330, height: 105 });
        } else if (mode === 'expanded') {
          pipWindow.resizeTo(340, 150);
          setDimensions({ width: 340, height: 150 });
        } else if (mode === 'lyrics-small') {
          pipWindow.resizeTo(360, 140);
          setDimensions({ width: 360, height: 140 });
        } else if (mode === 'lyrics-full') {
          pipWindow.resizeTo(380, 440);
          setDimensions({ width: 380, height: 440 });
        }
      } catch (_) {}
    }
  };

  // Cycle between modes: lyrics-small -> lyrics-full -> compact -> micro -> lyrics-small
  const cycleSizeMode = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (sizeMode === 'lyrics-small') handleSetSizeMode('lyrics-full');
    else if (sizeMode === 'lyrics-full') handleSetSizeMode('compact');
    else if (sizeMode === 'compact') handleSetSizeMode('micro');
    else if (sizeMode === 'micro') handleSetSizeMode('expanded');
    else handleSetSizeMode('lyrics-small');
  };

  // Open and focus main MattLab Music web app window from PiP
  const handleOpenWebApp = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      window.focus();
      if (pipWindow && pipWindow.opener) {
        pipWindow.opener.focus();
      }
      return;
    } catch (_) {}
    try {
      window.open(window.location.origin, '_blank');
    } catch (_) {}
  };

  // Listen for native OS window resize events on the PiP window to adapt layout & font scale
  useEffect(() => {
    if (!pipWindow) return;
    const handlePipResize = () => {
      try {
        const w = pipWindow.innerWidth;
        const h = pipWindow.innerHeight;
        setDimensions({ width: w, height: h });

        if (h < 70) {
          if (sizeMode !== 'micro') {
            setSizeMode('micro');
            localStorage.setItem('mini_player_size_mode', 'micro');
          }
        } else if (h >= 70 && h < 220) {
          if (sizeMode !== 'lyrics-small' && sizeMode !== 'compact' && sizeMode !== 'expanded') {
            setSizeMode('lyrics-small');
            localStorage.setItem('mini_player_size_mode', 'lyrics-small');
          }
        } else if (h >= 220) {
          if (sizeMode !== 'lyrics-full') {
            setSizeMode('lyrics-full');
            localStorage.setItem('mini_player_size_mode', 'lyrics-full');
          }
        }
      } catch (_) {}
    };

    handlePipResize();
    pipWindow.addEventListener('resize', handlePipResize);
    return () => {
      try {
        pipWindow.removeEventListener('resize', handlePipResize);
      } catch (_) {}
    };
  }, [pipWindow, sizeMode]);

  // ResizeObserver for in-page mini player or container element
  useEffect(() => {
    const target = smallLyricsRef.current || fullLyricsRef.current || containerRef.current;
    if (!target) return;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setDimensions((prev) => {
              if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
                return prev;
              }
              return { width, height };
            });
          }
        }
      });
      ro.observe(target);
      return () => ro.disconnect();
    }
  }, [sizeMode, pipWindow]);

  // Smooth auto-scroll for full multi-line lyrics container
  useEffect(() => {
    if (sizeMode !== 'lyrics-full' || isUserScrolled) return;
    const container = lyricsContainerRef.current;
    const activeEl = lineRefs.current[activeLyricIndex];
    if (container && activeEl) {
      const targetScroll = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeLyricIndex, isUserScrolled, sizeMode]);

  const handleLyricsScroll = () => {
    setIsUserScrolled(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolled(false);
    }, 4000);
  };

  // Mouse & Touch Dragging Handlers for in-page mini player
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 130, dragRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, dragRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      localStorage.setItem('mini_player_pos', JSON.stringify(position));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, position]);

  if (!currentTrack && !pipWindow) return null;
  if (!isOpen && !pipWindow) return null;
  // Never show in-page floating miniplayer mode on mobile devices (< 768px)
  if (!pipWindow && typeof window !== 'undefined' && window.innerWidth < 768) return null;

  // 1. Small 2-Line Lyrics Mode (Current sentence + Upcoming sentence) with Music Controls
  const renderSmallLyricsContent = (isPiP = false) => {
    const currentSentence = currentLyricLine || (lyricsState?.isLoading ? 'Loading lyrics...' : (lyricsState?.plainLyrics ? '♪ ... ♪' : 'No lyrics available'));
    const upcomingSentence = upcomingLyricLine || (currentLyricLine ? '' : (currentTrack ? `"${currentTrack.title}" • ${currentTrack.artist_name}` : ''));

    const currentLineObj = activeLyricIndex >= 0 ? lyricsState?.parsedLines?.[activeLyricIndex] : null;
    const nextLineObj = activeLyricIndex >= 0 && activeLyricIndex < (lyricsState?.parsedLines?.length || 0) - 1 ? lyricsState?.parsedLines?.[activeLyricIndex + 1] : null;

    // Dynamically scale font size, gaps, and elements based on window/container dimensions
    const currentW = dimensions.width || (pipWindow ? pipWindow.innerWidth : 360);
    const currentH = dimensions.height || (pipWindow ? pipWindow.innerHeight : 140);
    const widthRatio = Math.max(0.48, Math.min(1.4, currentW / 360));
    const heightRatio = Math.max(0.48, Math.min(1.4, currentH / 140));

    // Minimalist layout: when window gets smaller, hide title/artist and duration slider
    const isMinimalLayout = currentH < 118 || currentW < 280;

    // In minimal layout, vertical room is freed up, so we can relax vertical font scale penalty
    const effectiveHScale = isMinimalLayout ? Math.max(0.68, Math.min(1.3, currentH / 110)) : heightRatio;
    const scale = Math.min(widthRatio, effectiveHScale);

    // Fluid font sizes: shrink smoothly as window gets smaller
    const currentLyricFontSize = Math.max(8.5, Math.min(18, Math.round(14 * scale * 10) / 10));
    const upcomingLyricFontSize = Math.max(7.5, Math.min(14, Math.round(11 * scale * 10) / 10));
    const titleFontSize = Math.max(8.5, Math.min(15, Math.round(12 * scale * 10) / 10));
    const artistFontSize = Math.max(7.5, Math.min(12, Math.round(10 * scale * 10) / 10));
    const timeFontSize = Math.max(7, Math.min(11, Math.round(9 * scale * 10) / 10));

    // Dynamic element dimensions
    const coverSize = Math.max(18, Math.min(32, Math.round(28 * Math.max(0.65, scale))));
    const headerIconSize = Math.max(10, Math.min(15, Math.round(13 * scale)));
    const transportIconSize = Math.max(11, Math.min(16, Math.round(13 * (isMinimalLayout ? Math.max(0.9, scale) : scale))));
    const playButtonSize = Math.max(20, Math.min(32, Math.round(24 * (isMinimalLayout ? Math.max(0.95, scale) : scale))));
    const playIconSize = Math.max(10, Math.min(15, Math.round(12 * (isMinimalLayout ? Math.max(0.95, scale) : scale))));

    // Extra compact spacing when window is short (< 115px) or narrow (< 270px)
    const isUltraCompact = currentH < 115 || currentW < 270;
    const containerPadding = isUltraCompact ? 'px-2 py-1' : 'px-3 py-2';

    return (
      <div
        ref={smallLyricsRef}
        className={`relative w-full h-full flex flex-col justify-between bg-surface-island text-content-primary font-sans select-none box-border overflow-hidden ${containerPadding}`}
      >
        {/* Absolute buttons in minimal layout to avoid wasting vertical space */}
        {isMinimalLayout && (
          <>
            {currentTrack && (
              <div className="absolute top-1 left-1.5 z-20 flex items-center">
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`p-1 rounded transition hover:bg-white/10 shrink-0 ${
                    isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
                  }`}
                  title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <Heart size={headerIconSize} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                </button>
              </div>
            )}
            <div className="absolute top-1 right-1.5 z-20 flex items-center gap-0.5">
              {isPiP ? (
                <button
                  type="button"
                  onClick={handleOpenWebApp}
                  className="p-1 text-content-muted hover:text-brand-400 rounded transition hover:bg-white/10 shrink-0"
                  title="Back to tab"
                >
                  <ExternalLink size={headerIconSize} />
                </button>
              ) : (
                onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-content-muted hover:text-content-primary rounded transition hover:bg-white/10"
                    title="Close"
                  >
                    <X size={headerIconSize} />
                  </button>
                )
              )}
            </div>
          </>
        )}

        {/* Standard top row: Track Info & action buttons (only when NOT minimal) */}
        {!isMinimalLayout && (
          <div className="flex items-center justify-between w-full gap-1.5 shrink-0 z-10">
            <div 
              onClick={isPiP ? handleOpenWebApp : undefined}
              className={`flex items-center gap-1.5 truncate flex-1 min-w-0 pr-1 ${isPiP ? 'cursor-pointer group' : ''}`}
              title={isPiP ? 'Back to tab' : undefined}
            >
              <img
                src={resolveCoverUrl(currentTrack)}
                alt=""
                style={{ width: `${coverSize}px`, height: `${coverSize}px` }}
                className="rounded object-cover bg-surface-elevated shrink-0 shadow-sm group-hover:opacity-85 transition"
              />
              <div className="flex-1 min-w-0 truncate">
                <p
                  style={{ fontSize: `${titleFontSize}px` }}
                  className="font-bold text-content-primary truncate leading-tight group-hover:underline"
                >
                  {currentTrack?.title || 'No Track'}
                </p>
                <p
                  style={{ fontSize: `${artistFontSize}px` }}
                  className="text-content-secondary truncate leading-tight"
                >
                  {currentTrack?.artist_name || ''}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              {currentTrack && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`p-1 rounded transition hover:bg-white/10 shrink-0 ${
                    isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
                  }`}
                  title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <Heart size={headerIconSize} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                </button>
              )}
              {isPiP ? (
                <button
                  type="button"
                  onClick={handleOpenWebApp}
                  className="p-1 text-content-muted hover:text-brand-400 rounded transition hover:bg-white/10 shrink-0"
                  title="Back to tab"
                >
                  <ExternalLink size={headerIconSize} />
                </button>
              ) : (
                <>
                  {'documentPictureInPicture' in window && (
                    <button
                      type="button"
                      onClick={togglePiP}
                      className="p-1 text-content-muted hover:text-brand-400 rounded transition hover:bg-white/10"
                      title="Pop out Picture-in-Picture window"
                    >
                      <PictureInPicture2 size={headerIconSize} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-content-muted hover:text-content-primary rounded transition hover:bg-white/10"
                    title="Close"
                  >
                    <X size={headerIconSize} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: The 2 Lines of Lyrics (Current sentence + Upcoming one) */}
        <div
          title={currentTrack ? `${currentTrack.title} • ${currentTrack.artist_name}` : undefined}
          className={`flex flex-col justify-center text-center my-auto py-0.5 space-y-0.5 min-h-0 overflow-hidden flex-1 ${
            isMinimalLayout ? 'px-6' : ''
          }`}
        >
          {/* Line 1: Current Sentence */}
          <p
            onClick={() => currentLineObj && seek(currentLineObj.time)}
            style={{ fontSize: `${currentLyricFontSize}px` }}
            className={`${LYRICS_CONFIG.typography.activeWeightClass} truncate leading-tight cursor-pointer transition-all duration-150 ${
              currentLineObj ? `${LYRICS_CONFIG.colors.activeClass} drop-shadow-sm hover:underline` : 'text-content-primary/80'
            }`}
            title={currentLineObj ? `Current lyric: "${currentSentence}" (Click to rewind)` : currentSentence}
          >
            {currentSentence}
          </p>

          {/* Line 2: Upcoming Sentence */}
          <p
            onClick={() => nextLineObj && seek(nextLineObj.time)}
            style={{ fontSize: `${upcomingLyricFontSize}px` }}
            className={`${LYRICS_CONFIG.typography.upcomingWeightClass} ${LYRICS_CONFIG.colors.upcomingClass} truncate leading-tight transition-all duration-150 ${
              nextLineObj ? 'hover:text-content-primary cursor-pointer hover:underline' : ''
            }`}
            title={nextLineObj ? `Next lyric: "${upcomingSentence}" (Click to seek)` : upcomingSentence}
          >
            {upcomingSentence || '♪'}
          </p>
        </div>

        {/* Bottom row: Scrubber (hidden in minimal) + Controls (centered in minimal) */}
        <div className={`flex items-center ${isMinimalLayout ? 'justify-center' : 'justify-between'} gap-1.5 pt-0.5 shrink-0`}>
          {/* Scrubber progress - only shown in standard mode */}
          {!isMinimalLayout && (
            <div className="flex-1 min-w-0 pr-1">
              <TimelineScrubber
                currentTime={currentTime}
                duration={duration}
                bufferedTime={bufferedTime}
                onSeek={seek}
                disabled={!currentTrack}
                gapClassName="gap-1.5"
                timeClassName="text-content-muted font-mono"
                timeStyle={{ fontSize: `${timeFontSize}px`, minWidth: `${Math.round(24 * scale)}px` }}
              />
            </div>
          )}

          {/* Transport buttons - centered in minimal mode, right-aligned in standard */}
          <div className={`flex items-center ${isMinimalLayout ? 'gap-3.5' : 'gap-1'} shrink-0`}>
            <button
              type="button"
              onClick={prevTrack}
              className="p-1 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Previous"
            >
              <SkipBack size={transportIconSize} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              style={{ width: `${playButtonSize}px`, height: `${playButtonSize}px` }}
              className="rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={playIconSize} className="fill-black" />
              ) : (
                <Play size={playIconSize} className="fill-black ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={nextTrack}
              className="p-1 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Next"
            >
              <SkipForward size={transportIconSize} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 2. Large Multi-Line Scrolling Lyrics Mode
  const renderFullLyricsContent = (isPiP = false) => {
    const currentW = dimensions.width || (pipWindow ? pipWindow.innerWidth : 380);
    const currentH = dimensions.height || (pipWindow ? pipWindow.innerHeight : 440);
    const fullScale = Math.min(
      Math.max(0.55, Math.min(1.3, currentW / 380)),
      Math.max(0.55, Math.min(1.3, currentH / 440))
    );

    const activeFontSize = Math.max(10.5, Math.min(20, Math.round(14 * fullScale * 10) / 10));
    const inactiveFontSize = Math.max(9, Math.min(15, Math.round(12 * fullScale * 10) / 10));
    const headerTitleSize = Math.max(9, Math.min(15, Math.round(12 * fullScale * 10) / 10));
    const headerArtistSize = Math.max(7.5, Math.min(12, Math.round(10 * fullScale * 10) / 10));
    const headerThumbSize = Math.max(22, Math.min(36, Math.round(32 * Math.max(0.7, fullScale))));
    const headerIconSize = Math.max(10, Math.min(15, Math.round(13 * fullScale)));
    const transportIconSize = Math.max(11, Math.min(18, Math.round(16 * fullScale)));
    const playBtnSize = Math.max(22, Math.min(36, Math.round(32 * fullScale)));
    const playIcnSize = Math.max(10, Math.min(17, Math.round(15 * fullScale)));
    const footerTimeSize = Math.max(7.5, Math.min(12, Math.round(10 * fullScale * 10) / 10));

    return (
      <div
        ref={fullLyricsRef}
        className="w-full h-full flex flex-col justify-between bg-surface-island text-content-primary font-sans select-none box-border overflow-hidden"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-panel/80 backdrop-blur-md border-b border-white/5 shrink-0">
          <div 
            onClick={isPiP ? handleOpenWebApp : undefined}
            className={`flex items-center gap-2.5 flex-1 min-w-0 pr-2 ${isPiP ? 'cursor-pointer group' : ''}`}
            title={isPiP ? 'Back to tab' : undefined}
          >
            <img
              src={resolveCoverUrl(currentTrack)}
              alt=""
              style={{ width: `${headerThumbSize}px`, height: `${headerThumbSize}px` }}
              className="rounded-md object-cover bg-surface-elevated shrink-0 shadow group-hover:opacity-85 transition"
            />
            <div className="flex-1 min-w-0">
              <p
                style={{ fontSize: `${headerTitleSize}px` }}
                className="font-bold text-content-primary truncate leading-tight group-hover:underline"
              >
                {currentTrack?.title || 'No Track'}
              </p>
              <p
                style={{ fontSize: `${headerArtistSize}px` }}
                className="text-content-secondary truncate mt-0.5 leading-tight"
              >
                {currentTrack?.artist_name || ''}
              </p>
            </div>
          </div>

          {/* Action buttons (In PiP: only Back to tab, native titlebar provides the default close button) */}
          <div className="flex items-center gap-1 shrink-0">
            {currentTrack && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`p-1.5 rounded-md transition hover:bg-white/10 shrink-0 ${
                  isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
                }`}
                title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <Heart size={headerIconSize} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
              </button>
            )}
            {isPiP ? (
              <button
                type="button"
                onClick={handleOpenWebApp}
                className="p-1.5 text-content-muted hover:text-brand-400 rounded-md transition hover:bg-white/10"
                title="Back to tab"
              >
                <ExternalLink size={headerIconSize} />
              </button>
            ) : (
              <>
                {'documentPictureInPicture' in window && (
                  <button
                    type="button"
                    onClick={togglePiP}
                    className="p-1.5 text-content-muted hover:text-brand-400 rounded-md transition hover:bg-white/10"
                    title="Pop out Picture-in-Picture window"
                  >
                    <PictureInPicture2 size={headerIconSize} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-content-muted hover:text-content-primary rounded-md transition hover:bg-white/10"
                  title="Close"
                >
                  <X size={headerIconSize} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lyrics Area (Scrollable) */}
        <div
          ref={lyricsContainerRef}
          onWheel={handleLyricsScroll}
          onTouchMove={handleLyricsScroll}
          className="flex-1 overflow-y-auto px-4 py-5 space-y-3 text-center select-none scrollbar-thin scrollbar-thumb-white/10"
        >
          {lyricsState?.isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-content-muted gap-2 py-10">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading lyrics...</span>
            </div>
          ) : lyricsState?.parsedLines?.length > 0 ? (
            lyricsState.parsedLines.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = idx < activeLyricIndex;
              return (
                <p
                  key={`${line.time}-${idx}`}
                  ref={(el) => (lineRefs.current[idx] = el)}
                  onClick={() => seek(line.time)}
                  style={{ fontSize: `${isActive ? activeFontSize : inactiveFontSize}px` }}
                  className={`transition-all duration-300 cursor-pointer px-2.5 py-1 rounded-lg ${
                    isActive
                      ? `${LYRICS_CONFIG.colors.activeClass} ${LYRICS_CONFIG.typography.activeWeightClass} ${LYRICS_CONFIG.colors.activeBgClass} scale-[1.03] shadow-sm`
                      : isPast
                      ? `${LYRICS_CONFIG.colors.pastClass} ${LYRICS_CONFIG.typography.pastWeightClass} hover:text-content-primary`
                      : `${LYRICS_CONFIG.colors.idleClass} ${LYRICS_CONFIG.typography.upcomingWeightClass} hover:text-content-primary/70`
                  }`}
                >
                  {line.text}
                </p>
              );
            })
          ) : lyricsState?.plainLyrics ? (
            <div
              style={{ fontSize: `${inactiveFontSize}px` }}
              className={`text-content-primary/80 ${LYRICS_CONFIG.typography.activeWeightClass} leading-relaxed whitespace-pre-line py-4`}
            >
              {lyricsState.plainLyrics}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-content-subtle gap-2 py-10">
              <Music size={24} className="text-content-subtle" />
              <p className="text-xs font-semibold text-content-muted">No lyrics available</p>
              <p className="text-[10px] text-content-subtle max-w-[200px]">
                {currentTrack ? `"${currentTrack.title}"` : 'Play a song to view lyrics'}
              </p>
            </div>
          )}
        </div>

        {/* Music Button Controls Footer */}
        <div className="px-3.5 py-2.5 bg-surface-panel border-t border-white/5 shrink-0 flex flex-col gap-2">
          {/* Scrubber progress */}
          <div className="w-full">
            <TimelineScrubber
              currentTime={currentTime}
              duration={duration}
              bufferedTime={bufferedTime}
              onSeek={seek}
              disabled={!currentTrack}
              gapClassName="gap-2"
              timeClassName="text-content-muted font-mono"
              timeStyle={{ fontSize: `${footerTimeSize}px`, minWidth: '28px' }}
            />
          </div>

          {/* Transport buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={prevTrack}
              className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Previous"
            >
              <SkipBack size={transportIconSize} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              style={{ width: `${playBtnSize}px`, height: `${playBtnSize}px` }}
              className="rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-lg"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={playIcnSize} className="fill-black" />
              ) : (
                <Play size={playIcnSize} className="fill-black ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={nextTrack}
              className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Next"
            >
              <SkipForward size={transportIconSize} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render content for Document Picture-in-Picture window (always on top across tabs and desktop apps)
  const renderPiPContent = () => {
    if (sizeMode === 'lyrics-small' || sizeMode === 'lyrics') {
      return renderSmallLyricsContent(true);
    }

    if (sizeMode === 'lyrics-full') {
      return renderFullLyricsContent(true);
    }

    if (sizeMode === 'micro') {
      return (
        <div className="relative w-full h-full flex items-center justify-center px-2 py-1 bg-surface-island text-content-primary font-sans select-none box-border overflow-hidden">
          {currentTrack && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded transition hover:bg-white/10 active:scale-95 shrink-0 z-10 ${
                isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
              }`}
              title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart size={12} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
            </button>
          )}
          <div className="flex items-center gap-1.5 mx-auto">
            <button
              onClick={prevTrack}
              className="p-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-white/10 active:scale-95 transition shrink-0"
              title="Previous"
            >
              <SkipBack size={13} />
            </button>
            <button
              onClick={togglePlay}
              className="w-6 h-6 rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={12} className="fill-black" /> : <Play size={12} className="fill-black ml-0.5" />}
            </button>
            <button
              onClick={nextTrack}
              className="p-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-white/10 active:scale-95 transition shrink-0"
              title="Next"
            >
              <SkipForward size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenWebApp}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-brand-400 rounded transition hover:bg-white/10 shrink-0 z-10"
            title="Back to tab"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      );
    }

    if (sizeMode === 'expanded') {
      return (
        <div className="w-full h-full flex flex-col justify-between p-2.5 bg-surface-island text-content-primary font-sans select-none box-border space-y-1.5">
          <div className="flex items-center justify-between w-full">
            <div 
              onClick={handleOpenWebApp}
              className="flex items-center gap-2.5 flex-1 min-w-0 pr-2 cursor-pointer group"
              title="Back to tab"
            >
              <img
                src={resolveCoverUrl(currentTrack)}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shadow shrink-0 bg-surface-elevated2 group-hover:opacity-85 transition"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-content-primary truncate group-hover:underline">
                  {currentTrack?.title || 'No Track'}
                </p>
                <p className="text-[10px] text-content-secondary truncate mt-0.5">
                  {currentTrack?.artist_name || ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {currentTrack && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`p-1 rounded transition hover:bg-white/10 shrink-0 ${
                    isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
                  }`}
                  title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <Heart size={13} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenWebApp}
                className="p-1 text-content-muted hover:text-brand-400 rounded transition hover:bg-white/10 shrink-0"
                title="Back to tab"
              >
                <ExternalLink size={13} />
              </button>
            </div>
          </div>
          {/* Scrubber progress */}
          <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
            <div
              className="bg-brand-500 h-full transition-all duration-150"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={prevTrack}
              className="p-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-white/10 transition"
              title="Previous"
            >
              <SkipBack size={15} />
            </button>
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} className="fill-black" /> : <Play size={14} className="fill-black ml-0.5" />}
            </button>
            <button
              onClick={nextTrack}
              className="p-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-white/10 transition"
              title="Next"
            >
              <SkipForward size={15} />
            </button>
          </div>
        </div>
      );
    }

    // Default 'compact' mode
    return (
      <div className="w-full h-full flex items-center justify-between p-2.5 bg-surface-island text-content-primary font-sans select-none box-border">
        <div 
          onClick={handleOpenWebApp}
          className="flex items-center gap-2.5 flex-1 min-w-0 pr-2 cursor-pointer group"
          title="Back to tab"
        >
          {currentTrack && (
            <img
              src={resolveCoverUrl(currentTrack)}
              alt=""
              className="w-10 h-10 rounded-lg object-cover shadow shrink-0 bg-surface-elevated2 group-hover:opacity-85 transition"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-content-primary truncate group-hover:underline">
              {currentTrack?.title || 'No Track'}
            </p>
            <p className="text-[10px] text-content-secondary truncate mt-0.5">
              {currentTrack?.artist_name || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {currentTrack && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`p-1.5 rounded-full hover:bg-white/10 transition ${
                isFav ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
              }`}
              title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart size={14} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
            </button>
          )}
          <button
            onClick={prevTrack}
            className="p-1.5 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary transition"
            title="Previous"
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} className="fill-black" /> : <Play size={14} className="fill-black ml-0.5" />}
          </button>
          <button
            onClick={nextTrack}
            className="p-1.5 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary transition"
            title="Next"
          >
            <SkipForward size={15} />
          </button>
          <button
            type="button"
            onClick={handleOpenWebApp}
            className="p-1.5 rounded-full hover:bg-white/10 text-content-muted hover:text-brand-400 transition shrink-0"
            title="Back to tab"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Document PiP Portal (Persistent OS desktop window across tabs & apps) */}
      {pipWindow && createPortal(renderPiPContent(), pipWindow.document.body)}

      {/* 2. In-App Draggable & Resizable Mini Player Fallback */}
      {isOpen && !pipWindow && (
        <div
          data-dev-component="FloatingMiniPlayer"
          data-dev-file="src/components/FloatingMiniPlayer.jsx"
          data-dev-desc="Draggable floating picture-in-picture player with interactive controls and background visualizer"
          ref={containerRef}
          onPointerDown={handlePointerDown}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            touchAction: 'none',
          }}
          className={`fixed z-50 transition-shadow select-none shadow-2xl rounded-2xl border border-white/10 bg-surface-island/95 backdrop-blur-xl group cursor-move ${
            isDragging ? 'shadow-green-500/20 scale-[1.01]' : ''
          }`}
        >
          {/* 2-LINE LYRICS MODE */}
          {(sizeMode === 'lyrics-small' || sizeMode === 'lyrics') && (
            <div
              style={{
                resize: 'both',
                minWidth: '220px',
                minHeight: '85px',
                maxWidth: '600px',
                maxHeight: '300px',
              }}
              className="w-[350px] h-[135px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              {renderSmallLyricsContent(false)}
            </div>
          )}

          {/* FULL MULTI-LINE LYRICS MODE */}
          {sizeMode === 'lyrics-full' && (
            <div
              style={{
                resize: 'both',
                minWidth: '240px',
                minHeight: '220px',
                maxWidth: '600px',
                maxHeight: '700px',
              }}
              className="w-[360px] h-[410px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              {renderFullLyricsContent(false)}
            </div>
          )}

          {/* MICRO MODE: Only the transport buttons */}
          {sizeMode === 'micro' && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 rounded-full border border-white/10">
              {currentTrack && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition shrink-0 ${
                    isFav ? 'text-brand-500' : 'text-content-secondary hover:text-white'
                  }`}
                  title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <Heart size={13} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                </button>
              )}
              <button
                type="button"
                onClick={prevTrack}
                className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
                title="Previous"
              >
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="w-7 h-7 rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={nextTrack}
                className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
                title="Next"
              >
                <SkipForward size={14} />
              </button>

              <div className="w-px h-3.5 bg-white/10 mx-0.5" />

              <button
                type="button"
                onClick={() => handleSetSizeMode('lyrics-small')}
                className="p-1 text-content-muted hover:text-brand-400 rounded-md hover:bg-white/10 transition"
                title="2-Line Lyrics Mode"
              >
                <Mic2 size={12} />
              </button>
              <button
                type="button"
                onClick={cycleSizeMode}
                className="p-1 text-content-muted hover:text-white rounded-md hover:bg-white/10 transition"
                title="Expand Mini Player"
              >
                <Maximize2 size={12} />
              </button>
              {'documentPictureInPicture' in window && (
                <button
                  type="button"
                  onClick={togglePiP}
                  className="p-1 text-content-muted hover:text-brand-400 rounded-md hover:bg-white/10 transition"
                  title="Pop out Picture-in-Picture (Cross-tab window)"
                >
                  <PictureInPicture2 size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-content-muted hover:text-white rounded-md hover:bg-white/10 transition"
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* COMPACT MODE: Cover art + title + 3 buttons */}
          {sizeMode === 'compact' && (
            <div className="flex items-center gap-3 p-2 min-w-[260px] max-w-[320px]">
              <img
                src={resolveCoverUrl(currentTrack)}
                alt=""
                className="w-10 h-10 rounded-lg object-cover bg-surface-elevated shrink-0 shadow-sm"
              />
              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs font-bold text-white truncate">
                  {currentTrack?.title || 'No Track'}
                </p>
                <p className="text-[10px] text-content-secondary truncate mt-0.5">
                  {currentTrack?.artist_name || ''}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {currentTrack && (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className={`p-1 rounded-full hover:bg-white/10 active:scale-95 transition ${
                      isFav ? 'text-brand-500' : 'text-content-secondary hover:text-white'
                    }`}
                    title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  >
                    <Heart size={13} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1 text-content-secondary hover:text-white transition"
                  title="Previous"
                >
                  <SkipBack size={14} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1 text-content-secondary hover:text-white transition"
                  title="Next"
                >
                  <SkipForward size={14} />
                </button>

                <div className="w-px h-3.5 bg-white/10 mx-0.5" />

                <button
                  type="button"
                  onClick={() => handleSetSizeMode('lyrics-small')}
                  className="p-1 text-content-muted hover:text-brand-400 rounded transition"
                  title="2-Line Lyrics Mode"
                >
                  <Mic2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={cycleSizeMode}
                  className="p-1 text-content-muted hover:text-white rounded transition"
                  title="Resize Mini Player"
                >
                  <Maximize2 size={12} />
                </button>
                {'documentPictureInPicture' in window && (
                  <button
                    type="button"
                    onClick={togglePiP}
                    className="p-1 text-content-muted hover:text-brand-400 rounded transition"
                    title="Pop out Picture-in-Picture (Cross-tab window)"
                  >
                    <ExternalLink size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-content-muted hover:text-white rounded transition"
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* EXPANDED MODE: Larger cover + title + artist + seek progress + controls */}
          {sizeMode === 'expanded' && (
            <div className="flex flex-col p-3 min-w-[290px] max-w-[340px] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                  <img
                    src={resolveCoverUrl(currentTrack)}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover bg-surface-elevated shrink-0 shadow-md"
                  />
                  <div className="truncate flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {currentTrack?.title || 'No Track'}
                    </p>
                    <p className="text-[10px] text-content-secondary truncate mt-0.5">
                      {currentTrack?.artist_name || ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {currentTrack && (
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      className={`p-1 rounded transition hover:bg-white/10 active:scale-95 ${
                        isFav ? 'text-brand-500' : 'text-content-muted hover:text-white'
                      }`}
                      title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                    >
                      <Heart size={13} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSetSizeMode('lyrics-small')}
                    className="p-1 text-content-muted hover:text-brand-400 rounded transition"
                    title="2-Line Lyrics Mode"
                  >
                    <Mic2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={cycleSizeMode}
                    className="p-1 text-content-muted hover:text-white rounded transition"
                    title="Shrink to 3-button mode"
                  >
                    <Minimize2 size={13} />
                  </button>
                  {'documentPictureInPicture' in window && (
                    <button
                      type="button"
                      onClick={togglePiP}
                      className="p-1 text-content-muted hover:text-brand-400 rounded transition"
                      title="Pop out Picture-in-Picture"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-content-muted hover:text-white rounded transition"
                    title="Close"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-brand-500 h-full transition-all duration-150"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>

              {/* Transport Buttons */}
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 transition"
                  title="Previous"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={15} className="fill-black" /> : <Play size={15} className="fill-black ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1.5 text-content-secondary hover:text-white rounded-full hover:bg-white/10 transition"
                  title="Next"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
