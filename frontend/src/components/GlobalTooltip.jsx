import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * 🛠️ USER CONFIGURATION: Tooltip Appearance & Font Settings
 * You can easily tweak font size, font weight, colors, padding, and timing here!
 */
export const TOOLTIP_CONFIG = {
  // Typography
  fontSize: 'text-[11px]',     // Options: 'text-[10px]', 'text-[11px]', 'text-xs', 'text-sm'
  fontWeight: 'font-bold',   // Options: 'font-normal', 'font-medium', 'font-semibold', 'font-bold'
  fontFamily: 'font-sans',     // Options: 'font-sans', 'font-mono'

  // Colors & Surface
  bg: 'bg-[#282828]',          // Background color (Dark charcoal surface)
  textColor: 'text-white',     // Text color
  border: 'border border-white/10',
  shadow: 'shadow-[0_4px_20px_rgba(0,0,0,0.6)]',
  backdrop: 'backdrop-blur-md',

  // Layout & Spacing
  padding: 'px-2.5 py-1',      // Padding around text
  rounded: 'rounded-md',       // Corner radius ('rounded', 'rounded-md', 'rounded-lg', 'rounded-full')

  // Timing
  delayMs: 250,                // Hover delay before showing (milliseconds)
};

/**
 * GlobalTooltip Component
 * 
 * Automatically intercepts and stylizes all `title="..."` and `data-tooltip="..."`
 * attributes throughout the entire MattLab Music application.
 */
export const GlobalTooltip = () => {
  const [tooltip, setTooltip] = useState({
    visible: false,
    text: '',
    x: 0,
    y: 0,
    placement: 'top', // 'top' | 'bottom'
  });

  const showTimerRef = useRef(null);
  const activeElementRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const calculatePosition = (target) => {
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      const margin = 10;
      const tooltipWidth = tooltipRef.current?.offsetWidth || 80;

      // Vertical placement: default top, flip to bottom if too close to top
      const placeBottom = rect.top < 45;
      const y = placeBottom ? rect.bottom + 8 : rect.top - 8;

      // Horizontal centering with screen clamping
      const rawX = rect.left + rect.width / 2;
      const minX = margin + tooltipWidth / 2;
      const maxX = window.innerWidth - margin - tooltipWidth / 2;
      const clampedX = Math.max(minX, Math.min(maxX, rawX));

      return {
        x: clampedX,
        y,
        placement: placeBottom ? 'bottom' : 'top',
      };
    };

    const handlePointerOver = (e) => {
      // Find element with title or data-tooltip
      const target = e.target?.closest?.('[title], [data-tooltip]');
      if (!target) return;

      const rawText = target.getAttribute('title') || target.getAttribute('data-tooltip');
      if (!rawText || !rawText.trim()) return;

      // Suppress native OS tooltip by moving `title` to `data-tooltip`
      if (target.hasAttribute('title')) {
        target.setAttribute('data-tooltip', rawText);
        target.removeAttribute('title');
      }

      activeElementRef.current = target;
      clearTimeout(showTimerRef.current);

      showTimerRef.current = setTimeout(() => {
        if (activeElementRef.current === target) {
          const text = target.getAttribute('data-tooltip') || rawText;
          const pos = calculatePosition(target);
          if (pos) {
            setTooltip({
              visible: true,
              text,
              x: pos.x,
              y: pos.y,
              placement: pos.placement,
            });
          }
        }
      }, TOOLTIP_CONFIG.delayMs);
    };

    const handlePointerOut = (e) => {
      const target = e.target?.closest?.('[data-tooltip]');
      if (target && target === activeElementRef.current) {
        const related = e.relatedTarget;
        if (related && target.contains(related)) {
          return; // Still inside target
        }
        clearTimeout(showTimerRef.current);
        activeElementRef.current = null;
        setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };

    const handlePointerDown = () => {
      // Clicking any button dismisses the tooltip immediately
      clearTimeout(showTimerRef.current);
      activeElementRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleScroll = () => {
      // Scrolling dismisses active tooltip
      clearTimeout(showTimerRef.current);
      activeElementRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    // Keyboard navigation focus support
    const handleFocusIn = (e) => {
      const target = e.target?.closest?.('[title], [data-tooltip]');
      if (!target) return;

      const rawText = target.getAttribute('title') || target.getAttribute('data-tooltip');
      if (!rawText || !rawText.trim()) return;

      if (target.hasAttribute('title')) {
        target.setAttribute('data-tooltip', rawText);
        target.removeAttribute('title');
      }

      activeElementRef.current = target;
      const pos = calculatePosition(target);
      if (pos) {
        setTooltip({
          visible: true,
          text: rawText,
          x: pos.x,
          y: pos.y,
          placement: pos.placement,
        });
      }
    };

    const handleFocusOut = () => {
      clearTimeout(showTimerRef.current);
      activeElementRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      clearTimeout(showTimerRef.current);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`fixed pointer-events-none select-none z-[99999] whitespace-nowrap transition-opacity duration-150 ease-out ${
        TOOLTIP_CONFIG.padding
      } ${TOOLTIP_CONFIG.rounded} ${TOOLTIP_CONFIG.fontSize} ${TOOLTIP_CONFIG.fontWeight} ${TOOLTIP_CONFIG.fontFamily} ${TOOLTIP_CONFIG.shadow} ${TOOLTIP_CONFIG.border} ${TOOLTIP_CONFIG.backdrop} ${TOOLTIP_CONFIG.bg} ${TOOLTIP_CONFIG.textColor} ${
        tooltip.visible
          ? 'opacity-100'
          : 'opacity-0 pointer-events-none'
      }`}
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: tooltip.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
    >
      {tooltip.text}
    </div>,
    document.body
  );
};
