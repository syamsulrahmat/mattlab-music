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
    <header className="sticky top-0 z-30 px-4 md:px-8 py-3 bg-[#121212]/80 backdrop-blur-lg border-b border-white/5 flex items-center justify-between gap-3 select-none">
      {/* Left: Navigation Buttons / Mobile Menu */}
      <div className="flex items-center gap-2">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-[#B3B3B3] hover:text-white rounded-full bg-[#1e1e1e] transition"
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
          <div className="absolute left-4 pointer-events-none text-[#B3B3B3] flex items-center">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={onFocusSearch}
            placeholder="What do you want to play?"
            className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] text-white pl-11 pr-10 py-2.5 rounded-full text-xs sm:text-sm font-medium outline-none border border-transparent focus:border-white/20 transition placeholder-[#757575] shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 text-[#B3B3B3] hover:text-white p-0.5 rounded-full"
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
