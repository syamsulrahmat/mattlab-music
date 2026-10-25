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
      <div className={`relative flex-1 sm:w-64 max-w-sm ${className}`}>
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-content-secondary flex items-center">
          <Search size={16} />
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery?.(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-surface-elevated hover:bg-surface-elevated2 focus:bg-surface-elevated2 text-content-primary text-xs sm:text-sm pl-10 pr-9 py-2.5 rounded-full border border-transparent focus:border-border-strong outline-none transition placeholder-content-secondary"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery?.('');
              onClear?.();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary p-0.5 rounded-full cursor-pointer"
            title="Clear filter"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // MOBILE VERSION (Sticky Floating Top Bar)
  // ----------------------------------------------------
  return (
    <div className={`md:hidden sticky top-0 z-30 px-4 py-2.5 bg-black md:bg-surface-base border-none transition-all flex items-center gap-2.5 ${className}`}>
      <div className="relative flex-1 flex items-center">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-secondary pointer-events-none" size={20} />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => setSearchQuery?.(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-surface-elevated hover:bg-surface-hover focus:bg-surface-hover text-content-primary pl-12 pr-10 py-3 rounded-full text-sm font-medium outline-none border border-transparent focus:border-border-strong transition placeholder:text-content-secondary shadow-md"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery?.('');
              onClear?.();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-content-secondary hover:text-white"
            title="Clear filter"
          >
            <X size={18} />
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
