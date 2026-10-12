import React from 'react';
import { Library, Plus, Heart, Music, Disc3, Mic2, X } from 'lucide-react';

export const LibrarySidebar = ({
  activeTab,
  setActiveTab,
  playlists = [],
  onSelectPlaylist,
  onCreatePlaylistPrompt,
  stats,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex flex-col h-full bg-[#121212] rounded-lg overflow-hidden select-none">
      {/* Island Header */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5 text-[#b3b3b3]">
          <Library size={22} className="stroke-[2.2]" />
          <span className="font-bold text-sm text-[#b3b3b3] tracking-tight">Your Library</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onCreatePlaylistPrompt}
            className="w-8 h-8 rounded-full hover:bg-[#1f1f1f] text-[#b3b3b3] hover:text-white flex items-center justify-center transition"
            title="Create playlist"
          >
            <Plus size={18} />
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden w-8 h-8 rounded-full hover:bg-[#1f1f1f] text-[#b3b3b3] hover:text-white flex items-center justify-center"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Filter / Category Pills */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5">
        <button
          onClick={() => {
            setActiveTab('albums');
            if (onCloseMobile) onCloseMobile();
          }}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
            activeTab === 'albums'
              ? 'bg-white text-black'
              : 'bg-[#1f1f1f] text-white hover:bg-[#282828]'
          }`}
        >
          Albums
        </button>
        <button
          onClick={() => {
            setActiveTab('artists');
            if (onCloseMobile) onCloseMobile();
          }}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
            activeTab === 'artists'
              ? 'bg-white text-black'
              : 'bg-[#1f1f1f] text-white hover:bg-[#282828]'
          }`}
        >
          Artists
        </button>
      </div>

      {/* Playlists & Liked Songs Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* Liked Songs Special Item */}
        <div
          onClick={() => {
            setActiveTab('favorites');
            if (onCloseMobile) onCloseMobile();
          }}
          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition ${
            activeTab === 'favorites'
              ? 'bg-[#242424]'
              : 'hover:bg-[#1f1f1f]'
          }`}
        >
          <div className="w-12 h-12 rounded-md bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-900 flex items-center justify-center shrink-0 shadow">
            <Heart size={20} className="fill-white text-white" />
          </div>
          <div className="truncate flex-1">
            <p className={`text-sm font-semibold truncate ${
              activeTab === 'favorites' ? 'text-[#1ed760]' : 'text-white'
            }`}>
              Liked Songs
            </p>
            <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
              Playlist • Auto-collected
            </p>
          </div>
        </div>

        {/* User Playlists */}
        {playlists.map((pl) => {
          const isSelected = activeTab === 'playlist-detail' && pl.id === onSelectPlaylist?.currentId;
          return (
            <div
              key={pl.id}
              onClick={() => {
                onSelectPlaylist(pl.id);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition ${
                isSelected ? 'bg-[#242424]' : 'hover:bg-[#1f1f1f]'
              }`}
            >
              <div className="w-12 h-12 rounded-md bg-[#242424] flex items-center justify-center shrink-0 border border-white/5">
                <Music size={20} className="text-[#b3b3b3]" />
              </div>
              <div className="truncate flex-1">
                <p className={`text-sm font-semibold truncate ${
                  isSelected ? 'text-[#1ed760]' : 'text-white'
                }`}>
                  {pl.name}
                </p>
                <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                  Playlist • {pl.track_count} {pl.track_count === 1 ? 'song' : 'songs'}
                </p>
              </div>
            </div>
          );
        })}

        {playlists.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-[#666]">
            No custom playlists yet. Tap <span className="text-white">+</span> to create one!
          </div>
        )}
      </div>

      {/* Subtle Library Counter Widget at the Bottom */}
      {stats && (
        <div className="px-4 py-3 bg-[#121212] border-t border-white/5 text-[11px] text-[#b3b3b3] flex items-center justify-between">
          <span>{stats.tracks.toLocaleString()} songs</span>
          <span className="text-[#555]">•</span>
          <span>{stats.albums.toLocaleString()} albums</span>
          <span className="text-[#555]">•</span>
          <span>{stats.artists.toLocaleString()} artists</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Island */}
      <aside className="hidden md:flex flex-col h-full w-[280px] shrink-0">
        {content}
      </aside>

      {/* Mobile Drawer (When Opened on Mobile) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative w-72 max-w-[85vw] h-full p-2 z-10">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
