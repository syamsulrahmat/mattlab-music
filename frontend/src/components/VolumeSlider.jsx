import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * VolumeSlider Component
 * 
 * Interactive volume slider control featuring:
 * - 16px vertical hit target with 4px visual track
 * - Idle state: solid white volume fill, hidden thumb knob
 * - Hover state: brand green fill, smoothly scaling thumb knob
 * - Floating percentage tooltip badge (e.g. 80%) on hover and drag
 * - Smooth dragging with pointer capture (audio updates live without dropping gestures)
 * - Click vs Drag distinction: quick clicks jump volume instantly without cursor flickering to grabbing
 * - Auto-unmutes when dragging/clicking if audio was muted
 * - Full keyboard accessibility (Arrow keys, Shift+Arrows, Home, End)
 */
export const VolumeSlider = ({
  volume = 0.8,
  isMuted = false,
  onChange,
  onUnmute,
  disabled = false,
  className = 'w-24',
}) => {
  const trackRef = useRef(null);
  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const clickTargetVolumeRef = useRef(0);

  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isWheelScrolling, setIsWheelScrolling] = useState(false);
  const wheelTimeoutRef = useRef(null);

  // Hover preview state
  const [hoverVolume, setHoverVolume] = useState(volume);
  const [hoverClampedX, setHoverClampedX] = useState(0);

  // If muted, visual volume displays as 0
  const effectiveVolume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
  const progressPercent = effectiveVolume * 100;

  const calculateVolumeFromPointer = useCallback((clientX) => {
    if (!trackRef.current) return { volume: 0, clampedX: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = rect.width > 0 ? offsetX / rect.width : 0;
    const clampedVol = Math.round(ratio * 100) / 100;

    // Tooltip pill half-width approx 18px
    const halfPill = 18;
    const clampedX = Math.max(halfPill, Math.min(rect.width - halfPill, offsetX));

    return { volume: clampedVol, clampedX };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    if (e.button !== 0) return; // primary button only

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    isPointerDownRef.current = true;
    startXRef.current = e.clientX;
    isDraggingRef.current = false;

    const { volume: newVol, clampedX } = calculateVolumeFromPointer(e.clientX);
    clickTargetVolumeRef.current = newVol;
    setHoverVolume(newVol);
    setHoverClampedX(clampedX);

    if (isMuted && newVol > 0 && onUnmute) {
      onUnmute();
    }
    if (onChange) {
      onChange(newVol);
    }
  }, [disabled, isMuted, onUnmute, onChange, calculateVolumeFromPointer]);

  const handlePointerMove = useCallback((e) => {
    if (disabled) return;

    const { volume: newVol, clampedX } = calculateVolumeFromPointer(e.clientX);
    setHoverVolume(newVol);
    setHoverClampedX(clampedX);

    if (isPointerDownRef.current) {
      // Only switch to dragging mode (and show grabbing cursor) if mouse moved >= 3px
      if (!isDraggingRef.current) {
        if (Math.abs(e.clientX - startXRef.current) >= 3) {
          isDraggingRef.current = true;
          setIsDragging(true);
        }
      }

      if (isMuted && newVol > 0 && onUnmute) {
        onUnmute();
      }
      if (onChange) {
        onChange(newVol);
      }
    }
  }, [disabled, isMuted, onUnmute, onChange, calculateVolumeFromPointer]);

  const handlePointerUp = useCallback((e) => {
    if (!isPointerDownRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handlePointerCancel = useCallback((e) => {
    if (!isPointerDownRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!disabled) setIsHovering(true);
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    if (!isPointerDownRef.current) {
      setIsHovering(false);
    }
  }, []);

  // Keyboard accessibility
  const handleKeyDown = useCallback((e) => {
    if (disabled || !onChange) return;

    const step = e.shiftKey ? 0.1 : 0.05;
    let nextVol = effectiveVolume;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextVol = Math.min(1, effectiveVolume + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextVol = Math.max(0, effectiveVolume - step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextVol = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextVol = 1;
    } else {
      return;
    }

    if (isMuted && nextVol > 0 && onUnmute) {
      onUnmute();
    }
    onChange(Math.round(nextVol * 100) / 100);
  }, [disabled, effectiveVolume, isMuted, onUnmute, onChange]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const handleWheelEvent = (e) => {
      if (disabled || !onChange) return;
      e.preventDefault();
      e.stopPropagation();

      // Normalize scroll wheel step:
      // Touchpad micro-scrolls typically < 30 delta, mouse wheels ~ 100 delta
      const absDelta = Math.abs(e.deltaY);
      const step = absDelta < 30 ? 0.02 : 0.04;
      const change = e.deltaY < 0 ? step : -step;
      const cur = isMuted ? 0 : volume;
      const nextVol = Math.max(0, Math.min(1, Math.round((cur + change) * 100) / 100));

      if (isMuted && nextVol > 0 && onUnmute) {
        onUnmute();
      }

      onChange(nextVol);
      setIsWheelScrolling(true);
      setIsHovering(true);

      // Align hover tooltip badge directly over the moving thumb knob
      const rect = el.getBoundingClientRect();
      const halfPill = 18;
      const clampedX = Math.max(halfPill, Math.min(rect.width - halfPill, nextVol * rect.width));
      setHoverClampedX(clampedX);
      setHoverVolume(nextVol);

      if (wheelTimeoutRef.current) {
        clearTimeout(wheelTimeoutRef.current);
      }
      wheelTimeoutRef.current = setTimeout(() => {
        setIsWheelScrolling(false);
      }, 750);
    };

    el.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheelEvent);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [disabled, isMuted, volume, onChange, onUnmute]);

  useEffect(() => {
    return () => {
      isPointerDownRef.current = false;
      isDraggingRef.current = false;
    };
  }, []);

  const showTooltip = isHovering || isDragging || isWheelScrolling;
  const isInteracting = isHovering || isDragging || isWheelScrolling;
  const displayTooltipVolume = isDragging || isWheelScrolling ? effectiveVolume : hoverVolume;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(effectiveVolume * 100)}
      aria-valuetext={`${Math.round(effectiveVolume * 100)}%`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={`relative flex items-center h-4 group select-none touch-none outline-none ${className} ${
        disabled
          ? 'opacity-30 cursor-not-allowed pointer-events-none'
          : isDragging
          ? 'cursor-grabbing'
          : 'cursor-pointer'
      }`}
    >
      {/* Floating Volume Tooltip Badge */}
      {showTooltip && (
        <div
          className="absolute -top-7 -translate-x-1/2 bg-[#282828] text-white text-[11px] font-mono px-1.5 py-0.5 rounded shadow-lg border border-white/10 pointer-events-none select-none z-30 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
          style={{ left: `${hoverClampedX}px` }}
        >
          {Math.round(displayTooltipVolume * 100)}%
        </div>
      )}

      {/* 4px Visual Track Background */}
      <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden relative">
        {/* Active Volume Fill (White on idle, Brand Green on hover/drag/scroll) */}
        <div
          className={`h-full rounded-full transition-colors duration-150 ${
            isDragging
              ? 'transition-none'
              : 'transition-[width] duration-100 ease-out'
          } ${isInteracting ? 'bg-brand-500' : 'bg-white'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 12px Thumb Knob */}
      <div
        className={`absolute w-3 h-3 bg-white rounded-full shadow-md -translate-x-1/2 pointer-events-none ${
          isDragging
            ? '!scale-115 shadow-lg transition-none'
            : isWheelScrolling
            ? 'transition-[left,transform] duration-100 ease-out opacity-100 scale-100'
            : 'transition-transform duration-100 ease-out'
        } ${
          isInteracting
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-0'
        }`}
        style={{ left: `${progressPercent}%` }}
      />
    </div>
  );
};
