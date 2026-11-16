import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, Pause, SkipBack, SkipForward, X, 
  ExternalLink, PictureInPicture2, Music, Heart, RefreshCw 
} from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';
import { TimelineScrubber } from './TimelineScrubber';
import { LYRICS_CONFIG } from '../config/lyricsConfig';
import { DESIGN_TOKENS } from '../config/designTokens';

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
    lyricsState,
    activeLyricIndex,
    currentLyricLine,
    upcomingLyricLine,
    fetchTrackLyrics,
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

  // Draggable position coordinates for in-page mini player
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('mini_player_pos');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 370) : 100,
      y: typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 170) : 100,
    };
  });

  // Track container dimensions to dynamically scale font size and UI density
  const [dimensions, setDimensions] = useState(() => {
    try {
      const saved = localStorage.getItem('mini_player_dimensions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.width && parsed.height) return parsed;
      }
    } catch (_) {}
    return { width: 340, height: 110 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const containerRef = useRef(null);

  // Continuous lyrics scrolling refs & state
  const lyricsContainerRef = useRef(null);
  const lineRefs = useRef([]);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const userScrollTimeoutRef = useRef(null);
  const scrollAnimationRef = useRef(null);

  // Hover HUD visibility & auto-fade timer
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;

  const handlePointerEnter = () => {
    setIsHovered(true);
    resetHoverTimer();
  };

  const handlePointerMove = () => {
    setIsHovered(true);
    resetHoverTimer();
  };

  const resetHoverTimer = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        setIsHovered(false);
      }
    }, 2800);
  };

  const handlePointerLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (!isDraggingRef.current) {
      setIsHovered(false);
    }
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

  // Listen for native OS window resize events on the PiP window
  useEffect(() => {
    if (!pipWindow) return;
    const handlePipResize = () => {
      try {
        const w = pipWindow.innerWidth;
        const h = pipWindow.innerHeight;
        setDimensions({ width: w, height: h });
      } catch (_) {}
    };

    handlePipResize();
    pipWindow.addEventListener('resize', handlePipResize);
    return () => {
      try {
        pipWindow.removeEventListener('resize', handlePipResize);
      } catch (_) {}
    };
  }, [pipWindow]);

  // ResizeObserver for in-page mini player container
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        window.requestAnimationFrame(() => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
              setDimensions((prev) => {
                if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
                  return prev;
                }
                const nextDims = { width: Math.round(width), height: Math.round(height) };
                try {
                  localStorage.setItem('mini_player_dimensions', JSON.stringify(nextDims));
                } catch (_) {}
                return nextDims;
              });
            }
          }
        });
      });
      ro.observe(target);
      return () => ro.disconnect();
    }
  }, [isOpen, pipWindow]);

  // Reset user manual scroll flag and cancel running scroll animation on track change
  useEffect(() => {
    setIsUserScrolled(false);
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, [currentTrack?.id]);

  // Cinematic ease-out cubic curve (t: 0 -> 1)
  const easeOutCubic = useCallback((t) => 1 - Math.pow(1 - t, 3), []);

  // Smooth cinematic auto-scroll pinning the active lyric cleanly to the top
  useEffect(() => {
    if (isUserScrolled) return;
    const container = lyricsContainerRef.current;
    const activeEl = lineRefs.current[activeLyricIndex];
    if (!container || !activeEl) return;

    const topPadding = dimensions.height < 100 ? 4 : 8;
    const targetScroll = Math.max(0, activeEl.offsetTop - topPadding);
    const startScroll = container.scrollTop;
    const delta = targetScroll - startScroll;

    // If already at target or delta is negligible, no animation needed
    if (Math.abs(delta) < 1) return;

    // Cancel any running animation
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    const duration = 520; // 520ms buttery smooth glide
    const startTime = performance.now();

    const animateScroll = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const easedProgress = easeOutCubic(progress);

      container.scrollTop = startScroll + delta * easedProgress;

      if (progress < 1) {
        scrollAnimationRef.current = requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationRef.current = null;
      }
    };

    scrollAnimationRef.current = requestAnimationFrame(animateScroll);

    return () => {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
    };
  }, [activeLyricIndex, isUserScrolled, dimensions.height, dimensions.width, easeOutCubic]);

  const handleLyricsScroll = () => {
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
    setIsUserScrolled(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolled(false);
    }, 3500);
  };

  // Dragging Handlers for in-page floating mini player
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[role="slider"]')) {
      return;
    }
    
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
      const newY = Math.max(10, Math.min(window.innerHeight - 55, dragRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('mini_player_pos', JSON.stringify(position));
      } catch (_) {}
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
  if (!pipWindow && typeof window !== 'undefined' && window.innerWidth < 768) return null;

  // Unified Renderer for Both In-Page Floating MiniPlayer and Picture-in-Picture
  const renderUnifiedContent = (isPiP = false) => {
    const currentW = dimensions.width || (pipWindow ? pipWindow.innerWidth : 340);
    const currentH = dimensions.height || (pipWindow ? pipWindow.innerHeight : 110);

    // 3 Responsive Window Tiers matching the design mockup:
    // Tier 1: Smallest window (< 100px)
    // Tier 2: Medium window (100px <= height < 200px)
    // Tier 3: Tall / Expanded window (height >= 200px)
    const isTier1 = currentH < 100;
    const isTier2 = currentH >= 100 && currentH < 200;
    const isTier3 = currentH >= 200;

    // Responsive scaling factor calibrated to standard 340x110
    const wRatio = Math.max(0.65, Math.min(1.4, currentW / 340));
    const hRatio = Math.max(0.65, Math.min(1.4, currentH / 110));
    const scale = Math.min(wRatio, hRatio);

    const lyricFontSize = isTier1 
      ? Math.max(11, Math.min(15, Math.round(12.5 * scale * 10) / 10)) 
      : isTier2
      ? Math.max(12, Math.min(17, Math.round(14 * scale * 10) / 10))
      : Math.max(13, Math.min(20, Math.round(16 * scale * 10) / 10));

    // Extract lyric lines
    const parsed = lyricsState?.parsedLines || [];
    let pastLineObj = null;
    let activeLineObj = null;
    let upcomingLineObj = null;
    let upcomingLine2Obj = null;

    if (parsed.length > 0) {
      if (activeLyricIndex >= 0 && activeLyricIndex < parsed.length) {
        pastLineObj = activeLyricIndex > 0 ? parsed[activeLyricIndex - 1] : null;
        activeLineObj = parsed[activeLyricIndex];
        upcomingLineObj = activeLyricIndex + 1 < parsed.length ? parsed[activeLyricIndex + 1] : null;
        upcomingLine2Obj = activeLyricIndex + 2 < parsed.length ? parsed[activeLyricIndex + 2] : null;
      } else {
        activeLineObj = parsed[0];
        upcomingLineObj = parsed.length > 1 ? parsed[1] : null;
        upcomingLine2Obj = parsed.length > 2 ? parsed[2] : null;
      }
    } else if (lyricsState?.plainLyrics) {
      activeLineObj = { text: lyricsState.plainLyrics, time: 0 };
    }

    const plainFallback = lyricsState?.plainLyrics || '';
    const hasLyrics = parsed.length > 0 || Boolean(plainFallback);

    return (
      <div
        onMouseEnter={handlePointerEnter}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        className="group relative w-full h-full flex flex-col justify-between bg-gradient-to-b from-[#181818] to-[#111111] text-content-primary font-sans select-none box-border overflow-hidden"
      >
        {/* Ambient Subtle Album Glow */}
        {currentTrack && (
          <div
            className="absolute inset-0 opacity-20 pointer-events-none blur-3xl transform scale-125 transition-all duration-700"
            style={{
              backgroundImage: `url(${resolveCoverUrl(currentTrack)})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
        )}

        {/* ======================================================== */}
        {/* LAYER 1: IDLE STATE (100% PURE LYRICS CANVAS)            */}
        {/* ======================================================== */}
        {/* ======================================================== */}
        {/* LAYER 1: IDLE STATE (100% PURE LYRICS CANVAS)            */}
        {/* Unified Continuous Auto-Scrolling Across All Sizes       */}
        {/* ======================================================== */}
        <div className="relative z-10 w-full h-full flex flex-col justify-center items-center overflow-hidden px-2 pt-1 pb-2">
          <div
            ref={lyricsContainerRef}
            onWheel={handleLyricsScroll}
            onTouchMove={handleLyricsScroll}
            className="w-full h-full overflow-y-auto px-2 text-center scrollbar-none flex flex-col items-center"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black 75%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 75%, transparent 100%)',
            }}
          >
            {lyricsState?.isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-white/50 gap-2 my-auto py-4">
                <RefreshCw size={16} className="animate-spin text-brand-500" style={{ color: 'var(--brand-primary)' }} />
                <span className="text-xs">Loading lyrics...</span>
              </div>
            ) : parsed.length > 0 ? (
              <>
                {/* Minimal Top Padding: active lyric sits top-most */}
                <div style={{ height: currentH < 100 ? 4 : 8 }} className="shrink-0 w-full pointer-events-none" />

                {parsed.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const isPast = idx < activeLyricIndex;
                  return (
                    <p
                      key={`${line.time}-${idx}`}
                      ref={(el) => (lineRefs.current[idx] = el)}
                      onClick={() => {
                        seek(line.time);
                        setIsUserScrolled(false);
                      }}
                      style={{
                        fontSize: `${lyricFontSize}px`,
                        color: isActive ? 'var(--brand-primary)' : undefined,
                        textShadow: isActive ? '0 0 14px rgba(var(--brand-500, 34 197 94), 0.35)' : undefined,
                      }}
                      className={`transition-colors duration-300 cursor-pointer px-2.5 py-0.5 my-[1px] rounded-lg leading-snug whitespace-normal break-words text-wrap max-w-full text-center font-bold ${
                        isActive
                          ? ''
                          : isPast
                          ? 'text-white/20 hover:text-white/50'
                          : 'text-white/45 hover:text-white/80'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })}

                {/* Dynamic Bottom Spacer: allows the last lyric lines to scroll cleanly to the top */}
                <div style={{ height: Math.max(60, currentH - 45) }} className="shrink-0 w-full pointer-events-none" />
              </>
            ) : plainFallback ? (
              <div
                style={{ fontSize: `${lyricFontSize}px` }}
                className="text-white/80 font-medium leading-relaxed whitespace-pre-line py-4 my-auto px-2"
              >
                {plainFallback}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/50 gap-1.5 my-auto py-2">
                <Music size={20} className="text-brand-500" style={{ color: 'var(--brand-primary)' }} />
                <p className="text-xs font-semibold text-white/75 truncate max-w-[90%]">
                  {currentTrack ? currentTrack.title : 'No track playing'}
                </p>
                <p className="text-[11px] text-white/45 truncate max-w-[90%]">
                  {currentTrack ? currentTrack.artist_name : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* LAYER 2: HOVER-ACTIVATED HUD (REVEALED ON HOVER)         */}
        {/* ======================================================== */}
        <div
          className={`absolute inset-0 z-30 transition-all duration-200 ${
            isHovered
              ? 'opacity-100 pointer-events-auto scale-100 backdrop-blur-md bg-black/25'
              : 'opacity-0 pointer-events-none scale-[0.99]'
          }`}
        >
          {/* TIER 1 HOVER (< 100px): Minimalist Single-Row Control Deck */}
          {isTier1 && (
            <div className="relative w-full h-full flex items-center justify-between px-3.5 pb-1">
              {/* Left: Liked Songs Heart */}
              <div className="flex items-center shrink-0">
                {currentTrack && (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    style={isFav ? { color: 'var(--brand-primary)' } : undefined}
                    className={`p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                      isFav ? 'text-brand-500' : 'text-white/80 hover:text-white'
                    }`}
                    title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  >
                    <Heart
                      size={17}
                      style={isFav ? { fill: 'var(--brand-primary)', color: 'var(--brand-primary)' } : undefined}
                      className={isFav ? 'fill-brand-500 text-brand-500' : ''}
                    />
                  </button>
                )}
              </div>

              {/* Center: THE MUSIC CONTROLS (Prev, Round Brand Color Play/Pause, Next) */}
              <div className="flex items-center justify-center gap-4 shrink-0">
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  title="Previous track"
                >
                  <SkipBack size={17} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                  className="w-8 h-8 rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-xl shrink-0"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause size={14} className="fill-black" />
                  ) : (
                    <Play size={14} className="fill-black ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  title="Next track"
                >
                  <SkipForward size={17} />
                </button>
              </div>

              {/* Right: Window Actions (PiP / Close) */}
              <div className="flex items-center gap-1 shrink-0">
                {isPiP ? (
                  <button
                    type="button"
                    onClick={handleOpenWebApp}
                    className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                    title="Back to tab"
                  >
                    <ExternalLink size={17} />
                  </button>
                ) : (
                  <>
                    {'documentPictureInPicture' in window && (
                      <button
                        type="button"
                        onClick={togglePiP}
                        className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                        title="Pop out Picture-in-Picture window"
                      >
                        <PictureInPicture2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      title="Close miniplayer"
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TIER 2 HOVER (100px <= Height < 200px): Header (Cover + Title + Actions) + Centered Controls */}
          {isTier2 && (
            <div className="w-full h-full flex flex-col justify-between p-3 pb-2 box-border">
              {/* Top Row: Cover Thumbnail + Title/Artist + Window Actions */}
              <div className="flex items-center justify-between w-full gap-2 shrink-0">
                <div 
                  onClick={isPiP ? handleOpenWebApp : undefined}
                  className={`flex items-center gap-2 truncate flex-1 min-w-0 pr-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${isPiP ? 'cursor-pointer group/title' : ''}`}
                  title={isPiP ? 'Click to bring web app to front' : undefined}
                >
                  <img
                    src={resolveCoverUrl(currentTrack)}
                    alt=""
                    className="w-8 h-8 rounded-md object-cover bg-surface-elevated shrink-0 shadow-md group-hover/title:opacity-85 transition"
                  />
                  <div className="flex-1 min-w-0 truncate">
                    <p className="font-bold text-white truncate leading-tight text-xs group-hover/title:underline">
                      {currentTrack?.title || 'No Track'}
                    </p>
                    <p className="text-white/60 truncate leading-tight text-[10px] mt-0.5">
                      {currentTrack?.artist_name || ''}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {currentTrack && (
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      style={isFav ? { color: 'var(--brand-primary)' } : undefined}
                      className={`p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                        isFav ? 'text-brand-500' : 'text-white/80 hover:text-white'
                      }`}
                      title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                    >
                      <Heart
                        size={15}
                        style={isFav ? { fill: 'var(--brand-primary)', color: 'var(--brand-primary)' } : undefined}
                        className={isFav ? 'fill-brand-500 text-brand-500' : ''}
                      />
                    </button>
                  )}
                  {isPiP ? (
                    <button
                      type="button"
                      onClick={handleOpenWebApp}
                      className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      title="Back to tab"
                    >
                      <ExternalLink size={15} />
                    </button>
                  ) : (
                    <>
                      {'documentPictureInPicture' in window && (
                        <button
                          type="button"
                          onClick={togglePiP}
                          className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                          title="Pop out Picture-in-Picture window"
                        >
                          <PictureInPicture2 size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                        title="Close miniplayer"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Center: THE MUSIC CONTROLS */}
              <div className="flex-1 flex items-center justify-center gap-4 my-auto">
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  title="Previous track"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                  className="w-9 h-9 rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-xl shrink-0"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause size={15} className="fill-black" />
                  ) : (
                    <Play size={15} className="fill-black ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  title="Next track"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            </div>
          )}

          {/* TIER 3 HOVER (Height >= 200px): Header (Cover + Title) + Lyrics in Middle + Scrubber & Controls at Bottom */}
          {isTier3 && (
            <div className="w-full h-full flex flex-col justify-between p-3 pb-2 box-border">
              {/* Top Row: Metadata Header */}
              <div className="flex items-center justify-between w-full gap-2 shrink-0">
                <div 
                  onClick={isPiP ? handleOpenWebApp : undefined}
                  className={`flex items-center gap-2.5 truncate flex-1 min-w-0 pr-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${isPiP ? 'cursor-pointer group/title' : ''}`}
                  title={isPiP ? 'Click to bring web app to front' : undefined}
                >
                  <img
                    src={resolveCoverUrl(currentTrack)}
                    alt=""
                    className="w-9 h-9 rounded-md object-cover bg-surface-elevated shrink-0 shadow-md group-hover/title:opacity-85 transition"
                  />
                  <div className="flex-1 min-w-0 truncate">
                    <p className="font-bold text-white truncate leading-tight text-sm group-hover/title:underline">
                      {currentTrack?.title || 'No Track'}
                    </p>
                    <p className="text-white/60 truncate leading-tight text-xs mt-0.5">
                      {currentTrack?.artist_name || ''}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {currentTrack && (
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      style={isFav ? { color: 'var(--brand-primary)' } : undefined}
                      className={`p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                        isFav ? 'text-brand-500' : 'text-white/80 hover:text-white'
                      }`}
                      title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                    >
                      <Heart
                        size={15}
                        style={isFav ? { fill: 'var(--brand-primary)', color: 'var(--brand-primary)' } : undefined}
                        className={isFav ? 'fill-brand-500 text-brand-500' : ''}
                      />
                    </button>
                  )}
                  {isPiP ? (
                    <button
                      type="button"
                      onClick={handleOpenWebApp}
                      className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      title="Back to tab"
                    >
                      <ExternalLink size={15} />
                    </button>
                  ) : (
                    <>
                      {'documentPictureInPicture' in window && (
                        <button
                          type="button"
                          onClick={togglePiP}
                          className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                          title="Pop out Picture-in-Picture window"
                        >
                          <PictureInPicture2 size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                        title="Close miniplayer"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Middle: Lyrics remain visible in center */}
              <div className="flex-1 flex flex-col justify-center items-center text-center px-4 py-2 space-y-1.5 overflow-hidden my-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {activeLineObj && (
                  <p
                    onClick={() => seek(activeLineObj.time)}
                    style={{
                      fontSize: `${lyricFontSize}px`,
                      color: 'var(--brand-primary)',
                      textShadow: '0 0 14px rgba(var(--brand-500, 34 197 94), 0.35)',
                    }}
                    className="font-bold tracking-wide whitespace-normal break-words leading-tight max-w-full cursor-pointer hover:underline text-center"
                  >
                    {activeLineObj.text}
                  </p>
                )}
                {upcomingLineObj && (
                  <p
                    onClick={() => seek(upcomingLineObj.time)}
                    style={{ fontSize: `${lyricFontSize}px` }}
                    className="font-bold text-white/45 whitespace-normal break-words leading-tight max-w-full text-center"
                  >
                    {upcomingLineObj.text}
                  </p>
                )}
                {upcomingLine2Obj && currentH >= 260 && (
                  <p
                    onClick={() => seek(upcomingLine2Obj.time)}
                    style={{ fontSize: `${lyricFontSize}px` }}
                    className="font-bold text-white/25 whitespace-normal break-words leading-tight max-w-full text-center"
                  >
                    {upcomingLine2Obj.text}
                  </p>
                )}
              </div>

              {/* Bottom: Full Scrubber + Transport Controls */}
              <div className="flex flex-col gap-1.5 w-full shrink-0 pt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                <div className="w-full">
                  <TimelineScrubber
                    currentTime={currentTime}
                    duration={duration}
                    bufferedTime={bufferedTime}
                    onSeek={seek}
                    disabled={!currentTrack}
                    gapClassName="gap-2"
                    timeClassName="text-white/60 font-mono text-[10px]"
                    timeStyle={{ minWidth: '26px' }}
                  />
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={prevTrack}
                    className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                    title="Previous track"
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlay}
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                    className="w-9 h-9 rounded-full bg-brand-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-xl shrink-0"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause size={15} className="fill-black" />
                    ) : (
                      <Play size={15} className="fill-black ml-0.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={nextTrack}
                    className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                    title="Next track"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* PERSISTENT CLIPPED BOTTOM PROGRESS BAR                   */}
        {/* Always visible at the bottom in both Idle and Hover      */}
        {/* ======================================================== */}
        <div
          onClick={(e) => {
            if (!duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seek(pct * duration);
          }}
          className="absolute bottom-0 left-0 right-0 bg-white/15 hover:bg-white/30 h-1 hover:h-1.5 cursor-pointer transition-all z-50"
          title={`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`}
        >
          <div
            className="bg-brand-500 h-full transition-all duration-150"
            style={{
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              backgroundColor: 'var(--brand-primary)',
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Document PiP Portal (Persistent OS desktop window across tabs & apps) */}
      {pipWindow && createPortal(renderUnifiedContent(true), pipWindow.document.body)}

      {/* 2. In-App Draggable & Resizable Mini Player Fallback */}
      {isOpen && !pipWindow && (
        <div
          data-dev-component="FloatingMiniPlayer"
          data-dev-file="src/components/FloatingMiniPlayer.jsx"
          data-dev-desc="Compact lyrics-first miniplayer with 3-tier adaptive hover HUD"
          ref={containerRef}
          onPointerDown={handlePointerDown}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            resize: 'both',
            minWidth: '200px',
            minHeight: '55px',
            maxWidth: '800px',
            maxHeight: '800px',
            touchAction: 'none',
          }}
          className={`fixed z-50 transition-[box-shadow,transform] duration-200 select-none shadow-2xl rounded-2xl border border-white/10 bg-[#121212] text-white overflow-hidden cursor-move ${
            isDragging ? 'shadow-brand-500/25 scale-[1.01]' : ''
          }`}
        >
          {renderUnifiedContent(false)}
        </div>
      )}
    </>
  );
};
