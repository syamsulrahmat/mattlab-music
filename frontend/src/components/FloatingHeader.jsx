import React from 'react';
import { Search, X, ChevronLeft, ChevronRight, Menu } from 'lucide-react';

export const FloatingHeader = ({ 
  searchQuery, 
  setSearchQuery, 
  onFocusSearch, 
  canGoBack, 
  onGoBack,
  onToggleMobileMenu
}) => {
  return (
    <header className="sticky top-0 z-30 px-4 md:px-8 py-3 bg-surface-island/80 backdrop-blur-lg border-b border-border-subtle flex items-center justify-between gap-3 select-none">
      {/* Left: Navigation Buttons / Mobile Menu */}
      <div className="flex items-center gap-2">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-content-secondary hover:text-content-primary rounded-full bg-surface-elevated transition"
            title="Open Menu"
          >
            <Menu size={18} />
          </button>
        )}

        {canGoBack && (
          <button
            onClick={onGoBack}
            className="w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center transition"
            title="Go Back"
          >
            <ChevronLeft size={20} />
          </button>
        )}
      </div>

      {/* Center: Search Bar with "What do you want to play?" */}
      <div className="flex-1 max-w-lg mx-auto">
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-content-secondary flex items-center">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={onFocusSearch}
            placeholder="What do you want to play?"
            className="w-full bg-surface-elevated2 hover:bg-surface-hover focus:bg-surface-hover text-content-primary pl-11 pr-10 py-2.5 rounded-full text-xs sm:text-sm font-medium outline-none border border-transparent focus:border-border-strong transition placeholder-content-subtle shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 text-content-secondary hover:text-content-primary p-0.5 rounded-full"
              title="Clear Search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Right placeholder for balance */}
      <div className="w-8 hidden sm:block" />
    </header>
  );
};
