import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Formats seconds into mm:ss or -mm:ss
 */
export const formatScrubberTime = (seconds, isNegative = false) => {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return isNegative ? '-0:00' : '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  return isNegative ? `-${formatted}` : formatted;
};

/**
 * SpotifyScrubber Component
 * 
 * Spotify-grade playback timeline scrubber featuring:
 * - 16px vertical hit target with 4px visual track
 * - Buffered audio progress layer
 * - Idle state: solid white progress, hidden thumb knob
 * - Hover state: Spotify green (#1db954) progress, smoothly scaling thumb knob
 * - Floating hover timestamp pill with boundary clamping
 * - Smooth dragging with pointer capture (audio doesn't stutter, commits on release)
 * - Click duration timestamp to toggle between total length (3:45) and negative remaining (-2:15)
 * - Full keyboard navigation (ArrowLeft/Right, Shift+Arrows, Home, End)
 */
export const SpotifyScrubber = ({
  currentTime = 0,
  duration = 0,
  bufferedTime = 0,
  onSeek,
  disabled = false,
  className = '',
  showTimeLabels = true,
  timeClassName = 'text-[11px] text-content-secondary font-mono tabular-nums',
  timeStyle = {},
  gapClassName = 'gap-3',
}) => {
  const trackRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragTimeRef = useRef(0);

  // Remaining time toggle preference (persisted in localStorage)
  const [showRemainingTime, setShowRemainingTime] = useState(() => {
    try {
      return localStorage.getItem('mattlab_scrubber_show_remaining') === 'true';
    } catch (_) {
      return false;
    }
  });

  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  // Hover preview state
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverClampedX, setHoverClampedX] = useState(0);

  const toggleRemainingTime = useCallback(() => {
    setShowRemainingTime((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mattlab_scrubber_show_remaining', String(next));
      } catch (_) {}
      return next;
    });
  }, []);

  // Compute active playback time (reflects drag preview when dragging)
  const activeTime = isDragging ? dragTime : currentTime;
  const safeDuration = duration > 0 ? duration : 0;

  // Percentage calculations
  const progressPercent = safeDuration > 0
    ? Math.min(100, Math.max(0, (activeTime / safeDuration) * 100))
    : 0;

  const bufferedPercent = safeDuration > 0
    ? Math.min(100, Math.max(0, (bufferedTime / safeDuration) * 100))
    : 0;

  // Helper to calculate time and pixel offset from pointer event
  const calculatePointerTime = useCallback((clientX) => {
    if (!trackRef.current || safeDuration <= 0) return { time: 0, clampedX: 0, ratio: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = rect.width > 0 ? offsetX / rect.width : 0;
    const time = ratio * safeDuration;

    // Clamp tooltip X inside track boundaries (assuming ~38px badge width)
    const halfPill = 20;
    const clampedX = Math.max(halfPill, Math.min(rect.width - halfPill, offsetX));

    return { time, clampedX, ratio };
  }, [safeDuration]);

  // Pointer interactions with Pointer Capture
  const handlePointerDown = useCallback((e) => {
    if (disabled || safeDuration <= 0) return;
    // Primary button only
    if (e.button !== 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    isDraggingRef.current = true;
    setIsDragging(true);

    const { time, clampedX } = calculatePointerTime(e.clientX);
    dragTimeRef.current = time;
    setDragTime(time);
    setHoverTime(time);
    setHoverClampedX(clampedX);
  }, [disabled, safeDuration, calculatePointerTime]);

  const handlePointerMove = useCallback((e) => {
    if (disabled || safeDuration <= 0) return;

    const { time, clampedX } = calculatePointerTime(e.clientX);
    setHoverTime(time);
    setHoverClampedX(clampedX);

    if (isDraggingRef.current) {
      dragTimeRef.current = time;
      setDragTime(time);
    }
  }, [disabled, safeDuration, calculatePointerTime]);

  const handlePointerUp = useCallback((e) => {
    if (!isDraggingRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    isDraggingRef.current = false;
    setIsDragging(false);

    if (onSeek) {
      onSeek(dragTimeRef.current);
    }
  }, [onSeek]);

  const handlePointerCancel = useCallback((e) => {
    if (!isDraggingRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!disabled && safeDuration > 0) {
      setIsHovering(true);
    }
  }, [disabled, safeDuration]);

  const handleMouseLeave = useCallback(() => {
    if (!isDraggingRef.current) {
      setIsHovering(false);
    }
  }, []);

  // Keyboard accessibility
  const handleKeyDown = useCallback((e) => {
    if (disabled || safeDuration <= 0 || !onSeek) return;

    const step = e.shiftKey ? 10 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSeek(Math.min(safeDuration, currentTime + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSeek(Math.max(0, safeDuration - 1));
    }
  }, [disabled, safeDuration, currentTime, onSeek]);

  // Clean up dragging if component unmounts
  useEffect(() => {
    return () => {
      isDraggingRef.current = false;
    };
  }, []);

  const displayElapsed = formatScrubberTime(activeTime);
  const remainingTime = Math.max(0, safeDuration - activeTime);
  const displayRight = showRemainingTime
    ? formatScrubberTime(remainingTime, remainingTime > 0)
    : formatScrubberTime(safeDuration);

  const interactiveBar = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Playback timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(activeTime)}
      aria-valuetext={`${displayElapsed} of ${formatScrubberTime(safeDuration)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={`relative flex-1 flex items-center h-4 group touch-none outline-none ${
        disabled
          ? 'opacity-30 cursor-not-allowed pointer-events-none'
          : isDragging
          ? 'cursor-grabbing'
          : 'cursor-pointer'
      }`}
    >
      {/* Floating Timestamp Tooltip Badge */}
      {(isHovering || isDragging) && safeDuration > 0 && (
        <div
          className="absolute -top-7 -translate-x-1/2 bg-[#282828] text-white text-[11px] font-mono px-1.5 py-0.5 rounded shadow-lg border border-white/10 pointer-events-none select-none z-30 whitespace-nowrap"
          style={{ left: `${hoverClampedX}px` }}
        >
          {formatScrubberTime(hoverTime)}
        </div>
      )}

      {/* 4px Progress Track Background */}
      <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden relative">
        {/* Buffer Bar (Audio preloaded in browser memory) */}
        <div
          className="absolute top-0 left-0 bottom-0 bg-white/30 rounded-full transition-[width] duration-200"
          style={{ width: `${bufferedPercent}%` }}
        />

        {/* Played Bar (Idle: White, Hover/Drag: Spotify Green) */}
        <div
          className={`h-full rounded-full transition-colors duration-150 ${
            isHovering || isDragging ? 'bg-brand-500' : 'bg-white'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 12px Thumb Knob */}
      <div
        className={`absolute w-3 h-3 bg-white rounded-full shadow-md -translate-x-1/2 pointer-events-none transition-transform duration-100 ease-out ${
          isHovering || isDragging
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-0'
        } ${isDragging ? '!scale-115 shadow-lg' : ''}`}
        style={{ left: `${progressPercent}%` }}
      />
    </div>
  );

  if (!showTimeLabels) {
    return (
      <div className={`relative flex items-center ${className}`}>
        {interactiveBar}
      </div>
    );
  }

  return (
    <div className={`w-full flex items-center ${gapClassName} select-none ${className}`}>
      {/* Left: Elapsed Time */}
      <span className={`w-10 text-right shrink-0 ${timeClassName}`} style={timeStyle}>
        {displayElapsed}
      </span>

      {/* Center: Interactive Scrubber Area */}
      {interactiveBar}

      {/* Right: Duration or Negative Remaining Toggle */}
      <button
        type="button"
        onClick={toggleRemainingTime}
        disabled={disabled || safeDuration <= 0}
        title={showRemainingTime ? 'Display total track duration' : 'Display remaining track time'}
        className={`w-11 text-left shrink-0 transition-colors cursor-pointer hover:text-content-primary ${timeClassName}`}
        style={timeStyle}
      >
        {displayRight}
      </button>
    </div>
  );
};
