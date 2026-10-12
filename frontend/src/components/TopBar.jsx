import React, { useState } from 'react';
import { Home, Search, X, RefreshCw, Music2, Server, HardDrive, DownloadCloud } from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';

export const TopBar = ({ 
  searchQuery, 
  setSearchQuery, 
  onFocusSearch, 
  onGoHome, 
  stats, 
  onRefreshScan,
  onRequestMusic,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScanClick = async () => {
    setIsScanning(true);
    await onRefreshScan();
    setTimeout(() => setIsScanning(false), 2000);
  };

  return (
    <header className="h-16 bg-[#000000] px-4 md:px-5 flex items-center justify-between gap-4 z-40 select-none shrink-0 border-b border-black">
      {/* Left: MattLab Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div 
          onClick={onGoHome}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
        >
          <MattLabLogo
            variant="badge"
            bgColor="#1ed760"
            color="#000000"
            className="w-9 h-9 rounded-full shadow-md group-hover:scale-105 transition"
          />
          <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-[#1ed760] transition hidden sm:inline">
            MattLab Music
          </span>
        </div>
      </div>

      {/* Center: Circular Home Button + Capsule Search Input */}
      <div className="flex-1 max-w-xl mx-auto flex items-center gap-2.5 justify-center">
        {/* Circular Home button */}
        <button
          onClick={onGoHome}
          className="w-10 h-10 rounded-full bg-[#1f1f1f] hover:bg-[#282828] text-white flex items-center justify-center transition hover:scale-105 active:scale-95 shrink-0"
          title="Home"
        >
          <Home size={20} />
        </button>

        {/* Pill/Capsule Search Input */}
        <div className="relative flex-1 max-w-md flex items-center">
          <div className="absolute left-3.5 pointer-events-none text-[#b3b3b3] flex items-center">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={onFocusSearch}
            placeholder="What do you want to play?"
            className="w-full bg-[#1f1f1f] hover:bg-[#242424] focus:bg-[#242424] text-white pl-10 pr-9 py-2.5 rounded-full text-xs sm:text-sm font-medium outline-none border border-transparent focus:border-white/20 transition placeholder-[#b3b3b3]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-[#b3b3b3] hover:text-white p-0.5 rounded-full"
              title="Clear Search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Right: Unraid Sync Status + Rescan Button + Server Avatar */}
      <div className="flex items-center gap-3 shrink-0">
        {stats && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-[#b3b3b3] font-medium px-2 py-1 bg-[#121212] rounded-full border border-white/5">
            <HardDrive size={13} className="text-[#1ed760]" />
            <span>{stats.tracks.toLocaleString()} tracks</span>
            <span className="text-[#666]">•</span>
            <span>{stats.total_duration_hours} hrs</span>
          </div>
        )}

        <button
          onClick={onRequestMusic}
          className="bg-[#1ed760] hover:bg-[#1fdf64] text-black text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 shadow-md shrink-0"
          title="Request Music via Torrent (Lidarr)"
        >
          <DownloadCloud size={14} className="stroke-[2.5]" />
          <span className="hidden sm:inline">Request</span>
        </button>

        <button
          onClick={handleScanClick}
          disabled={isScanning}
          className="bg-[#1f1f1f] hover:bg-[#282828] text-white text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
          title="Rescan Unraid Music Library"
        >
          <RefreshCw size={13} className={isScanning ? 'animate-spin text-[#1ed760]' : 'text-[#b3b3b3]'} />
          <span className="hidden sm:inline">{isScanning ? 'Syncing...' : 'Rescan'}</span>
        </button>

        <div 
          className="w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#282828] text-[#1ed760] font-bold text-xs flex items-center justify-center ring-1 ring-white/10 shadow transition cursor-pointer"
          title="MattLab Server"
        >
          <Server size={16} />
        </div>
      </div>
    </header>
  );
};
