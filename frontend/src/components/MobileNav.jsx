import React from 'react';
import { Home, Disc3, Search, Mic2, Heart, ListMusic } from 'lucide-react';

export const MobileNav = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'favorites', label: 'Liked', icon: Heart },
    { id: 'library', label: 'Library', icon: ListMusic },
  ];

  return (
    <nav className="pointer-events-auto md:hidden bg-black border-t border-white/5 px-3 pt-1 flex items-center justify-around z-40 select-none pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
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
