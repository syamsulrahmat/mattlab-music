import React, { useRef } from 'react';
import { Home, Disc3, Search, Mic2, Heart, ListMusic } from 'lucide-react';

export const MobileNav = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'favorites', label: 'Liked', icon: Heart },
    { id: 'library', label: 'Library', icon: ListMusic },
  ];

  const touchStartRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const elapsedTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Quick swipe across nav dock (25px threshold, <= 500ms, mostly horizontal)
    if (elapsedTime <= 500 && Math.abs(deltaX) >= 25 && Math.abs(deltaX) > Math.abs(deltaY)) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      if (currentIndex !== -1) {
        if (deltaX < 0 && currentIndex < tabs.length - 1) {
          // Slide thumb right-to-left -> Next tab
          setActiveTab(tabs[currentIndex + 1].id);
          try { navigator.vibrate?.(10); } catch {}
        } else if (deltaX > 0 && currentIndex > 0) {
          // Slide thumb left-to-right -> Previous tab
          setActiveTab(tabs[currentIndex - 1].id);
          try { navigator.vibrate?.(10); } catch {}
        }
      }
    }
  };

  return (
    <nav
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="pointer-events-auto md:hidden bg-black border-t border-white/5 px-3 pt-1 flex items-center justify-around z-40 select-none pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] touch-pan-x"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'search') {
                // Ensure page always scrolls to top on Search
                const mainEl = document.querySelector('main');
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

                const searchEl = document.getElementById('mobile-search-input') || document.getElementById('global-search-input');
                if (searchEl) {
                  searchEl.focus();
                }
              }
            }}
            className={`flex flex-col items-center justify-center py-1 px-4 rounded-lg transition active:scale-95 ${
              isActive ? 'text-brand-500 font-bold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Icon size={22} className={isActive ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] font-semibold mt-1 tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
