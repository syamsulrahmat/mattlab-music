import React from 'react';
import { Home, Disc3, Search, Mic2, Heart, ListMusic } from 'lucide-react';

export const MobileNav = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'albums', label: 'Albums', icon: Disc3 },
    { id: 'favorites', label: 'Liked', icon: Heart },
    { id: 'playlists-tab', label: 'Library', icon: ListMusic },
  ];

  return (
    <nav className="md:hidden bg-[#000000] border-t border-[#181818] px-2 py-1 flex items-center justify-around z-40 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-lg transition ${
              isActive ? 'text-brand-500' : 'text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Icon size={20} className={isActive ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] font-semibold mt-1">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
