import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

/**
 * Reusable SortMenu component that displays:
 * - On Desktop (>= 768px): A compact, floating dropdown popup right under the sort button.
 * - On Mobile (< 768px): An iOS-style bottom sheet modal with smooth drag-down-to-dismiss gesture,
 *   identical to the ContextMenu design language.
 */
export const SortDropdownMenu = ({
  isOpen,
  onClose,
  sortBy,
  onSelectSortBy,
  options = [], // [{ id, label, icon: ReactNode, hide?: boolean }]
  desktopRef, // ref to anchor/parent for desktop click-outside detection
}) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  // Mobile swipe down gesture refs & state
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchCurrentY = useRef(0);
  const hasDragged = useRef(false);
  const listScrollRef = useRef(null);
  const sheetRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset drag offset whenever opened/closed
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
      hasDragged.current = false;
    }
  }, [isOpen]);

  // Touch handlers for drag-down-to-close on mobile
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchCurrentY.current = e.touches[0].clientY;
    hasDragged.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diffY = touchCurrentY.current - touchStartY.current;
    const diffX = Math.abs(e.touches[0].clientX - touchStartX.current);

    // If starting inside scrollable list, only drag if at the top and pulling downwards
    if (listScrollRef.current && listScrollRef.current.scrollTop > 0) {
      return;
    }

    if (diffY > 8 && diffY > diffX) {
      hasDragged.current = true;
      setDragOffset(diffY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > 70) {
      onClose();
    } else {
      setDragOffset(0);
    }
    setTimeout(() => {
      hasDragged.current = false;
    }, 150);
  };

  if (!isOpen) return null;

  const visibleOptions = options.filter((opt) => !opt.hide);

  // -----------------------------------------------------------------
  // MOBILE: Bottom Sheet with Drag-to-Dismiss Gesture
  // -----------------------------------------------------------------
  if (isMobile) {
    return createPortal(
      <div 
        className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          ref={sheetRef}
          style={{
            transform: `translateY(${dragOffset}px)`,
          }}
          className="w-full max-h-[80vh] bg-surface-base backdrop-blur-2xl rounded-t-3xl border-t border-border-subtle shadow-2xl flex flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] transition-transform duration-150 ease-out animate-in slide-in-from-bottom-full duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pull Handle & Header Area (Swipe Down Anchor) */}
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full cursor-grab active:cursor-grabbing select-none"
          >
            <div className="w-full flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-neutral-600/70 rounded-full" />
            </div>

            {/* Header Info */}
            <div className="px-5 py-2.5 flex items-center justify-between border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-content-primary">Sort By</h3>
            </div>
          </div>

          {/* Action List */}
          <div 
            ref={listScrollRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClickCapture={(e) => {
              if (hasDragged.current || dragOffset > 5) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            className="overflow-y-auto px-3 py-2 space-y-1 text-sm font-medium text-content-primary"
          >
            {visibleOptions.map((opt) => {
              const isSelected = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectSortBy(opt.id);
                    onClose();
                  }}
                  className={`w-full text-left py-3 px-3.5 rounded-xl flex items-center justify-between active:scale-[0.98] transition cursor-pointer ${
                    isSelected 
                      ? 'bg-brand-500/15 text-brand-500 font-bold' 
                      : 'hover:bg-white/5 text-content-primary'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {opt.icon}
                    <span className="text-sm">{opt.label}</span>
                  </span>
                  {isSelected && <Check size={16} className="text-brand-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // -----------------------------------------------------------------
  // DESKTOP: Native Floating Popover
  // -----------------------------------------------------------------
  return (
    <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-panel border border-border-medium rounded-lg shadow-2xl py-1 z-50 text-xs">
      <div className="px-3 py-1 text-[10px] uppercase font-bold text-content-subtle tracking-wider">
        Sort By
      </div>
      {visibleOptions.map((opt) => {
        const isSelected = sortBy === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              onSelectSortBy(opt.id);
              onClose();
            }}
            className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition cursor-pointer ${
              isSelected ? 'text-brand-500 font-bold' : 'text-content-primary'
            }`}
          >
            <span className="flex items-center gap-2">
              {opt.icon}
              <span>{opt.label}</span>
            </span>
            {isSelected && <Check size={13} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );
};
