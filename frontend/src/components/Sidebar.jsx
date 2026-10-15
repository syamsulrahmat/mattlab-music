import React, { useState } from 'react';
import { Search, Disc3, Mic2, RefreshCw, Music2, Heart, ListPlus, Music, X } from 'lucide-react';

export const Sidebar = ({ 
  activeTab, 
  setActiveTab, 
  stats, 
  onRefreshScan, 
  playlists = [], 
  onSelectPlaylist,
  onCreatePlaylistPrompt,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScanClick = async () => {
    setIsScanning(true);
    await onRefreshScan();
    setTimeout(() => setIsScanning(false), 2000);
  };

  const navItems = [
    { id: 'albums', label: 'Albums', icon: Disc3 },
    { id: 'artists', label: 'Artists', icon: Mic2 },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'favorites', label: 'Liked Songs', icon: Heart, isSpecial: true },
  ];

  const handleNavClick = (id) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  const handlePlaylistClick = (id) => {
    onSelectPlaylist(id);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full p-5 select-none">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Brand */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavClick('albums')}>
            <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-black font-bold shadow-lg shadow-brand-500/20">
              <Music2 size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-content-primary">MattLab</h1>
              <p className="text-xs text-content-secondary font-medium -mt-0.5">Music Library</p>
            </div>
          </div>
          {onCloseMobile && (
            <button onClick={onCloseMobile} className="md:hidden text-content-muted hover:text-content-primary p-1">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="space-y-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-surface-hover text-content-primary shadow-sm'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-panel'
                }`}
              >
                {item.isSpecial ? (
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
                    <Icon size={14} className="fill-white text-white" />
                  </div>
                ) : (
                  <Icon size={20} className={isActive ? 'text-brand-500' : ''} />
                )}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Playlists Section */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-border-subtle pt-4">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-bold text-content-muted uppercase tracking-wider">Playlists</span>
            <button
              onClick={() => {
                onCreatePlaylistPrompt();
                if (onCloseMobile) onCloseMobile();
              }}
              className="text-content-muted hover:text-content-primary p-1 rounded transition"
              title="Create Playlist"
            >
              <ListPlus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 text-xs">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handlePlaylistClick(pl.id)}
                className={`w-full text-left px-3 py-2 rounded-md truncate transition font-medium ${
                  activeTab === 'playlist-detail' && pl.id === onSelectPlaylist?.currentId
                    ? 'text-brand-500 bg-surface-elevated2'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-panel'
                }`}
              >
                {pl.name}
              </button>
            ))}
            {playlists.length === 0 && (
              <p className="text-[11px] text-content-subtle px-3 py-1">No playlists yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Library Stats & Refresh */}
      <div className="bg-surface-panel rounded-xl p-3.5 border border-border-medium mt-4">
        <div className="text-[11px] font-semibold text-content-muted uppercase tracking-wider mb-1.5">
          Library Info
        </div>
        {stats ? (
          <div className="text-[11px] text-content-muted space-y-0.5 mb-2.5">
            <p><span className="text-content-primary font-medium">{stats.tracks.toLocaleString()}</span> songs</p>
            <p><span className="text-content-primary font-medium">{stats.albums.toLocaleString()}</span> albums</p>
            <p><span className="text-content-primary font-medium">{stats.artists.toLocaleString()}</span> artists</p>
            <p><span className="text-content-primary font-medium">{stats.total_duration_hours}</span> hours total</p>
          </div>
        ) : (
          <div className="text-[11px] text-content-subtle mb-2.5">Loading stats...</div>
        )}

        <button
          onClick={handleScanClick}
          disabled={isScanning}
          className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-surface-hover hover:bg-surface-active text-content-primary text-xs font-semibold rounded-md transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={isScanning ? 'animate-spin text-brand-500' : ''} />
          {isScanning ? 'Scanning...' : 'Rescan Library'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Hidden on Mobile) */}
      <aside className="hidden md:flex md:w-64 bg-surface-base flex-col shrink-0 border-r border-border-subtle">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Out Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[80vw] bg-surface-base h-full border-r border-border-subtle shadow-2xl z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
