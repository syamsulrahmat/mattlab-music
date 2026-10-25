import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * =========================================================================
 * 🔍 REUSABLE TRACKLIST FILTER BAR (MOBILE STICKY & DESKTOP PARITY)
 * =========================================================================
 * 
 * 💡 HOW TO EDIT THIS COMPONENT:
 * 
 * 1. Mobile Filter Container (Sticky at top of mobile playlists):
 *    - To change background / blur / opacity: edit the outer wrapper:
 *      `bg-surface-base/95 backdrop-blur-xl`
 *    - To adjust position, top gap, or spacing: edit `px-4 pt-1.5 pb-1`
 *    - To change inner input pill background / rounded shape: edit `bg-surface-elevated/60 rounded-xl`
 * 
 * 2. Mobile Input Box & Text Sizing:
 *    - Font size: `text-sm` (or change to `text-xs`, `text-base`)
 *    - Height / Padding: `py-2.5 pl-11 pr-10`
 *    - Search Icon Size: `size={18}` in <Search />
 * 
 * 3. Desktop Search Input (Preserves the compact desktop design):
 *    - Controlled by `mode="desktop"`: `w-full bg-surface-elevated2 hover:bg-surface-hover ...`
 */

export const TracklistFilterBar = ({
  searchQuery = '',
  setSearchQuery,
  placeholder = 'Filter playlist...',
  onFocus,
  onBlur,
  onKeyDown,
  onClear,
  inputRef,
  mode = 'mobile', // 'mobile' | 'desktop'
  className = '',
  isFilterActive = false,
}) => {
  // ----------------------------------------------------
  // DESKTOP VERSION (Action Bar Pill)
  // ----------------------------------------------------
  if (mode === 'desktop') {
    return (
      <div className={`relative flex-1 sm:w-52 max-w-xs ${className}`}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery?.(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-surface-elevated2 hover:bg-surface-hover focus:bg-surface-hover text-content-primary text-xs pl-8 pr-7 py-2 rounded-full border border-border-subtle focus:border-border-strong outline-none transition placeholder:text-content-subtle"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery?.('');
              onClear?.();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-0.5 cursor-pointer"
            title="Clear filter"
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // MOBILE VERSION (Sticky Floating Top Bar)
  // ----------------------------------------------------
  return (
    <div className={`md:hidden sticky top-0 z-30 px-4 py-3 bg-surface-base/95 backdrop-blur-xl border-none transition-all flex items-center gap-2.5 ${className}`}>
      <div className="relative flex-1 bg-surface-elevated/60 rounded-xl overflow-hidden shadow-sm">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => setSearchQuery?.(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-content-primary text-sm pl-11 pr-10 py-2.5 outline-none placeholder:text-content-muted border-0 focus:ring-0 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery?.('');
              onClear?.();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-1 cursor-pointer"
            title="Clear filter"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Cancel button appears when user is filtering to restore playlist detail */}
      {isFilterActive && (
        <button
          type="button"
          onClick={() => {
            setSearchQuery?.('');
            onClear?.();
          }}
          className="text-xs font-semibold text-brand-500 hover:text-brand-400 active:scale-95 transition shrink-0 px-1"
        >
          Cancel
        </button>
      )}
    </div>
  );
};
