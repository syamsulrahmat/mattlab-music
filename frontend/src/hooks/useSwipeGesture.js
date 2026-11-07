import { useEffect, useRef } from 'react';

/**
 * useSwipeGesture
 * Lightweight, strictly touch-based swipe detection for mobile viewports (<768px).
 * Desktop mouse events are completely ignored.
 *
 * @param {Object} options
 * @param {Function} [options.onSwipeLeft] - Called on horizontal swipe from right-to-left
 * @param {Function} [options.onSwipeRight] - Called on horizontal swipe from left-to-right
 * @param {Function} [options.onEdgeSwipeRight] - Called when swiping right specifically starting from the left edge (<=35px)
 * @param {number} [options.minDistance=45] - Minimum horizontal travel required in px
 * @param {number} [options.maxVerticalRatio=0.8] - Max vertical/horizontal ratio to ensure intentional horizontal swipe
 * @param {boolean} [options.enabled=true] - Toggle gesture listening
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onEdgeSwipeRight,
  minDistance = 45,
  maxVerticalRatio = 0.8,
  enabled = true,
}) {
  const touchStartRef = useRef(null);

  useEffect(() => {
    // Strict desktop gate: Only attach on mobile viewport (<768px)
    if (!enabled || typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }

    const handleTouchStart = (e) => {
      // Must be single finger touch
      if (e.touches.length !== 1) {
        touchStartRef.current = null;
        return;
      }

      const touch = e.touches[0];
      const target = e.target;

      // Ignore if touch starts on interactive input controls or horizontal carousels
      if (
        target.closest('input, textarea, select, button, [role="slider"], [data-no-swipe], .overflow-x-auto, [role="dialog"]')
      ) {
        touchStartRef.current = null;
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        isEdge: touch.clientX <= 35,
      };
    };

    const handleTouchEnd = (e) => {
      if (!touchStartRef.current || e.changedTouches.length === 0) {
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const elapsedTime = Date.now() - touchStartRef.current.time;
      const isEdge = touchStartRef.current.isEdge;
      touchStartRef.current = null;

      // Ignore prolonged holds (>600ms) or micro-movements
      if (elapsedTime > 600 || Math.abs(deltaX) < minDistance) {
        return;
      }

      // Check that horizontal movement decisively exceeds vertical travel
      const verticalRatio = Math.abs(deltaY) / Math.abs(deltaX);
      if (verticalRatio > maxVerticalRatio) {
        return;
      }

      // Haptic feedback trigger on supported mobile devices
      const triggerHaptic = () => {
        try {
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {
          // Ignore
        }
      };

      if (deltaX < 0) {
        // Swiped Left (finger moved right to left)
        if (onSwipeLeft) {
          triggerHaptic();
          onSwipeLeft();
        }
      } else {
        // Swiped Right (finger moved left to right)
        if (isEdge && onEdgeSwipeRight) {
          triggerHaptic();
          onEdgeSwipeRight();
        } else if (onSwipeRight) {
          triggerHaptic();
          onSwipeRight();
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, onEdgeSwipeRight, minDistance, maxVerticalRatio, enabled]);
}
