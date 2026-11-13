import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useSwipeGesture
 * Touch-driven horizontal swipe navigation with live drag tracking and spring animations.
 * Completely inactive on desktop viewports (>=768px).
 *
 * @param {Object} options
 * @param {Function} [options.onSwipeLeft] - Called on swipe left (next tab)
 * @param {Function} [options.onSwipeRight] - Called on swipe right (previous tab)
 * @param {Function} [options.onEdgeSwipeRight] - Called on right swipe from the left screen edge
 * @param {number} [options.minDistance=60] - Min threshold to commit page change
 * @param {boolean} [options.canSwipeLeft=true] - Whether next tab exists
 * @param {boolean} [options.canSwipeRight=true] - Whether previous tab exists
 * @param {boolean} [options.enabled=true] - Toggle gesture listening
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onEdgeSwipeRight,
  minDistance = 60,
  canSwipeLeft = true,
  canSwipeRight = true,
  enabled = true,
}) {
  const touchStartRef = useRef(null);
  const isTrackingRef = useRef(false);

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Desktop gate
    if (!enabled || typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }

    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) {
        touchStartRef.current = null;
        isTrackingRef.current = false;
        return;
      }

      const touch = e.touches[0];
      const target = e.target;

      // Ignore input elements, horizontal carousels, or dialogs
      if (
        target.closest(
          'input, textarea, select, button, [role="slider"], [data-no-swipe], .overflow-x-auto, [role="dialog"], [role="menu"]'
        )
      ) {
        touchStartRef.current = null;
        isTrackingRef.current = false;
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        isEdge: touch.clientX <= 40,
      };
      isTrackingRef.current = true;
    };

    const handleTouchMove = (e) => {
      if (!isTrackingRef.current || !touchStartRef.current || e.touches.length !== 1) {
        return;
      }

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // If vertical travel dominates before any horizontal movement, cancel swipe to allow smooth scrolling
      if (!isDragging && Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isTrackingRef.current = false;
        return;
      }

      // If user clearly moved horizontally, engage drag mode
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (!isDragging) {
          setIsDragging(true);
        }

        // Apply resistance if swiping past bounds
        let offset = deltaX;
        if ((deltaX < 0 && !canSwipeLeft) || (deltaX > 0 && !canSwipeRight && !touchStartRef.current.isEdge)) {
          offset = deltaX * 0.25; // Rubber-band effect
        } else {
          offset = deltaX * 0.75; // Smooth physical feel
        }
        setDragOffset(offset);
      }
    };

    const handleTouchEnd = (e) => {
      if (!isTrackingRef.current || !touchStartRef.current) {
        setIsDragging(false);
        setDragOffset(0);
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const elapsedTime = Date.now() - touchStartRef.current.time;
      const isEdge = touchStartRef.current.isEdge;

      isTrackingRef.current = false;
      touchStartRef.current = null;
      setIsDragging(false);
      setDragOffset(0);

      // Fast flick or passed distance threshold
      const isQuickFlick = elapsedTime < 250 && Math.abs(deltaX) > 35;
      const isPastDistance = Math.abs(deltaX) >= minDistance;

      if (!isQuickFlick && !isPastDistance) {
        return;
      }

      const triggerHaptic = () => {
        try {
          if (navigator.vibrate) navigator.vibrate(10);
        } catch {}
      };

      if (deltaX < 0 && canSwipeLeft) {
        // Dragged left -> next tab
        triggerHaptic();
        if (onSwipeLeft) onSwipeLeft();
      } else if (deltaX > 0) {
        // Dragged right -> previous tab or edge back
        if (isEdge && onEdgeSwipeRight) {
          triggerHaptic();
          onEdgeSwipeRight();
        } else if (canSwipeRight && onSwipeRight) {
          triggerHaptic();
          onSwipeRight();
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [
    onSwipeLeft,
    onSwipeRight,
    onEdgeSwipeRight,
    minDistance,
    canSwipeLeft,
    canSwipeRight,
    enabled,
    isDragging,
  ]);

  return { dragOffset, isDragging };
}
