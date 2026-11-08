import React, { useRef } from 'react';
import { Home, Disc3, Search, ListMusic } from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';

export const MobileNav = ({ activeTab, setActiveTab }) => {
  const { currentTrack, isPlaying, duration, currentTime, setIsMobileNowPlayingOpen } = usePlayer();

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'playing', label: 'Playing', icon: Disc3, isPlayingTab: true },
    { id: 'search', label: 'Search', icon: Search },
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
          handleTabClick(tabs[currentIndex + 1].id);
          try { navigator.vibrate?.(10); } catch {}
        } else if (deltaX > 0 && currentIndex > 0) {
          handleTabClick(tabs[currentIndex - 1].id);
          try { navigator.vibrate?.(10); } catch {}
        }
      }
    }
  };

  const handleTabClick = (tabId) => {
    if (tabId === 'playing') {
      if (currentTrack) {
        setIsMobileNowPlayingOpen(true);
      } else {
        setActiveTab('home');
      }
      return;
    }

    setActiveTab(tabId);
    if (tabId === 'search') {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      // On mobile browsers, synchronously claim user activation with a proxy input,
      // then transfer focus to the real search input right as the slide animation completes!
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      if (isMobile) {
        let proxy = document.getElementById('search-focus-proxy');
        if (!proxy) {
          proxy = document.createElement('input');
          proxy.id = 'search-focus-proxy';
          proxy.type = 'text';
          proxy.tabIndex = -1;
          proxy.setAttribute('aria-hidden', 'true');
          proxy.style.position = 'fixed';
          proxy.style.opacity = '0';
          proxy.style.pointerEvents = 'none';
          proxy.style.top = '0';
          proxy.style.left = '0';
          proxy.style.height = '0';
          proxy.style.width = '0';
          proxy.style.fontSize = '16px'; // Prevent Safari auto-zoom
          document.body.appendChild(proxy);
        }
        try {
          proxy.focus();
        } catch (_) {}

        setTimeout(() => {
          const searchEl = document.getElementById('mobile-search-input') || document.getElementById('global-search-input');
          if (searchEl) {
            searchEl.focus();
          }
          try {
            proxy.blur();
            proxy.remove();
          } catch (_) {}
        }, 1000);
      } else {
        const desktopSearch = document.getElementById('global-search-input');
        if (desktopSearch) {
          desktopSearch.focus();
          desktopSearch.select();
        }
      }
    }
  };

  // Find active tab index for sliding pill geometry
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeTab));

  // Circular progress calculation for Now Playing tab
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  // Circumference for r=11 is 2 * PI * 11 ≈ 69.115
  const strokeDashoffset = 69.115 * (1 - progressRatio);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none md:hidden flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] px-4 sm:px-6">
      {/* Floating Liquid Glass Capsule with subtle semantic border */}
      <nav
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative pointer-events-auto h-12 w-full bg-surface-island/40 backdrop-blur-2xl backdrop-saturate-[220%] border border-border-subtle rounded-full p-1.5 flex items-center justify-between shadow-2xl select-none touch-pan-x"
      >
        {/* Sliding Fluid Translucent Pill Active Container WITHOUT border outline - slightly lighter */}
        <div
          className="absolute top-1.5 bottom-1.5 rounded-full bg-surface-hover/80 shadow-md pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            width: 'calc((100% - 0.75rem) / 4 - 0.4rem)',
            left: `calc(0.375rem + 0.2rem + ${activeIndex} * ((100% - 0.75rem) / 4))`,
          }}
        />

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isPlayingTab = tab.isPlayingTab;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              aria-label={tab.label}
              className={`flex-1 h-full mx-0.5 flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 relative z-10 ${
                isActive ? 'text-content-primary' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {isPlayingTab ? (
                <div className="relative w-7 h-7 flex items-center justify-center">
                  {currentTrack ? (
                    <>
                      {/* SVG Circular Progress Ring */}
                      <svg className="absolute -inset-0.5 w-8 h-8 -rotate-90 pointer-events-none" viewBox="0 0 28 28">
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          className="stroke-border-subtle"
                          strokeWidth="2"
                          fill="transparent"
                        />
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          className="stroke-brand-500 transition-all duration-300"
                          strokeWidth="2.4"
                          strokeDasharray="69.115"
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </svg>
                      {/* Spinning Album Artwork Disc */}
                      <img
                        src={resolveCoverUrl(currentTrack)}
                        alt=""
                        className={`w-5 h-5 rounded-full object-cover shadow-sm ${
                          isPlaying ? 'animate-spin-slow' : ''
                        }`}
                      />
                    </>
                  ) : (
                    <Icon size={22} className={isActive ? 'stroke-[2.5] text-content-primary' : 'stroke-[1.9]'} />
                  )}
                </div>
              ) : (
                <Icon
                  size={22}
                  className={isActive ? 'stroke-[2.5] text-content-primary' : 'stroke-[1.9]'}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
