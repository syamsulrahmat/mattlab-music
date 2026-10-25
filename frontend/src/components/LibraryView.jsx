import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Library, Plus, Heart, Music, Disc3, Mic2, Search, ArrowUpDown, ChevronDown, Check, MoreVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';
import { SpotifyIcon } from './SpotifyIcon';

export const LibraryView = ({
  playlists = [],
  onSelectPlaylist,
  onSelectTab,
  onCreatePlaylistPrompt,
  onImportSpotifyPrompt,
  onContextMenu,
  stats,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState(() => {
    try {
      return localStorage.getItem('library_playlist_sort') || 'recent';
    } catch (_) {
      return 'recent';
    }
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

  const { isFavorite, currentTrack, isPlaying } = usePlayer();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSortMenuOpen]);

  const handleSetSort = (mode) => {
    setSortMode(mode);
    setIsSortMenuOpen(false);
    try {
      localStorage.setItem('library_playlist_sort', mode);
    } catch (_) {}
  };

  const displayPlaylists = useMemo(() => {
    let list = [...playlists];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sortMode === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'name_desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === 'recent') {
      list.sort((a, b) => {
        const timeA = new Date((a.created_at || '').replace(' ', 'T') + (a.created_at?.includes('Z') ? '' : 'Z')).getTime() || 0;
        const timeB = new Date((b.created_at || '').replace(' ', 'T') + (b.created_at?.includes('Z') ? '' : 'Z')).getTime() || 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || 0) - (a.id || 0);
      });
    } else if (sortMode === 'tracks') {
      list.sort((a, b) => (b.track_count || 0) - (a.track_count || 0));
    }
    return list;
  }, [playlists, searchQuery, sortMode]);

  const showLikedSongs = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return 'liked songs'.includes(q) || 'favorites'.includes(q);
  }, [searchQuery]);

  return (
    <div 
      data-dev-component="LibraryView"
      data-dev-file="src/components/LibraryView.jsx"
      data-dev-desc="Dedicated full-screen library view featuring Liked Songs, user playlists, and fast filtering"
      className="p-4 sm:p-6 pb-28 md:pb-12 max-w-7xl mx-auto w-full select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-500/5 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-lg">
            <Library size={22} className="stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Your Library</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} • Liked songs
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onImportSpotifyPrompt && (
            <button
              onClick={onImportSpotifyPrompt}
              className="w-9 h-9 rounded-full bg-surface-elevated hover:bg-surface-hover text-neutral-300 hover:text-brand-500 flex items-center justify-center transition border border-white/5 active:scale-95"
              title="Import Spotify Playlist"
              aria-label="Import Spotify playlist"
            >
              <SpotifyIcon size={16} />
            </button>
          )}
          {onCreatePlaylistPrompt && (
            <button
              onClick={onCreatePlaylistPrompt}
              className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center transition shadow-lg active:scale-95"
              title="Create Playlist"
              aria-label="Create playlist"
            >
              <Plus size={18} className="stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        {/* Category Navigation Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => onSelectTab && onSelectTab('albums')}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-neutral-300 transition shrink-0 active:scale-95 border border-white/5"
          >
            Albums
          </button>
          <button
            onClick={() => onSelectTab && onSelectTab('artists')}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-neutral-300 transition shrink-0 active:scale-95 border border-white/5"
          >
            Artists
          </button>
          <button
            onClick={() => onSelectTab && onSelectTab('favorites')}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-neutral-300 transition shrink-0 active:scale-95 border border-white/5 flex items-center gap-1.5"
          >
            <Heart size={12} className="fill-brand-500 text-brand-500" />
            <span>Liked Songs</span>
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-panel hover:bg-surface-elevated focus:bg-surface-elevated text-white text-xs pl-8 pr-3 py-2 rounded-full border border-border-subtle focus:border-border-strong outline-none transition placeholder:text-neutral-500"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative shrink-0" ref={sortMenuRef}>
            <button
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 bg-surface-panel hover:bg-surface-elevated border border-border-subtle text-neutral-300 hover:text-white px-3 py-2 rounded-full text-xs font-medium transition cursor-pointer"
            >
              <ArrowUpDown size={13} className="text-brand-400" />
              <span className="capitalize">{sortMode === 'tracks' ? 'Songs' : sortMode.replace('_', ' ')}</span>
              <ChevronDown size={12} />
            </button>

            {isSortMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-surface-panel border border-border-medium rounded-xl shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => handleSetSort('recent')}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortMode === 'recent' ? 'text-brand-500 font-bold' : 'text-neutral-200'
                  }`}
                >
                  <span>Recents</span>
                  {sortMode === 'recent' && <Check size={13} />}
                </button>
                <button
                  onClick={() => handleSetSort('name_asc')}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortMode === 'name_asc' ? 'text-brand-500 font-bold' : 'text-neutral-200'
                  }`}
                >
                  <span>Name (A - Z)</span>
                  {sortMode === 'name_asc' && <Check size={13} />}
                </button>
                <button
                  onClick={() => handleSetSort('name_desc')}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortMode === 'name_desc' ? 'text-brand-500 font-bold' : 'text-neutral-200'
                  }`}
                >
                  <span>Name (Z - A)</span>
                  {sortMode === 'name_desc' && <Check size={13} />}
                </button>
                <button
                  onClick={() => handleSetSort('tracks')}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortMode === 'tracks' ? 'text-brand-500 font-bold' : 'text-neutral-200'
                  }`}
                >
                  <span>Most Songs</span>
                  {sortMode === 'tracks' && <Check size={13} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Playlist Grid / List */}
      <div className="space-y-2">
        {/* Liked Songs Primary Hero Card */}
        {showLikedSongs && (
          <div
            onClick={() => onSelectTab && onSelectTab('favorites')}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                onContextMenu(e, 'favorites', { id: 'favorites', name: 'Liked Songs' });
              }
            }}
            className="group flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-purple-950/40 via-surface-panel to-surface-island border border-purple-500/20 hover:border-purple-500/40 hover:bg-surface-elevated transition cursor-pointer shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-lg">
                <Heart size={24} className="fill-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white truncate">Liked Songs</h3>
                  {isPlaying && currentTrack?.playlist_id === 'favorites' && (
                    <div className="flex items-end gap-[2px] w-3 h-3 pb-0.5">
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-1" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-2" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-3" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-4" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Playlist • Auto-collected favorite tracks
                </p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onContextMenu) {
                  onContextMenu(e, 'favorites', { id: 'favorites', name: 'Liked Songs' });
                }
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition shrink-0"
              title="Options"
            >
              <MoreVertical size={18} />
            </button>
          </div>
        )}

        {/* User Playlists */}
        {displayPlaylists.map((pl) => {
          const isPlayingThis = isPlaying && currentTrack?.playlist_id === pl.id;

          return (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl.id)}
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  onContextMenu(e, 'playlist', pl);
                }
              }}
              className="group flex items-center justify-between p-3 rounded-2xl bg-surface-panel hover:bg-surface-elevated border border-border-subtle hover:border-border-medium transition cursor-pointer shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-md">
                  <PlaylistCover covers={pl.covers || []} size="w-14 h-14" iconSize={24} />
                  {isPlayingThis && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex items-end gap-[2px] w-4 h-4 pb-0.5">
                        <span className="w-[2px] bg-brand-400 rounded-full animate-eq-1" />
                        <span className="w-[2px] bg-brand-400 rounded-full animate-eq-2" />
                        <span className="w-[2px] bg-brand-400 rounded-full animate-eq-3" />
                        <span className="w-[2px] bg-brand-400 rounded-full animate-eq-4" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-semibold truncate ${
                      isPlayingThis ? 'text-brand-500 font-bold' : 'text-white'
                    }`}>
                      {pl.name}
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5">
                    {pl.spotify_id && (
                      <span className="text-brand-500 shrink-0" title="Synced with Spotify">
                        <SpotifyIcon size={12} />
                      </span>
                    )}
                    <span>Playlist • {pl.track_count} {pl.track_count === 1 ? 'song' : 'songs'}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onContextMenu) {
                    onContextMenu(e, 'playlist', pl);
                  }
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition shrink-0"
                title="Options"
              >
                <MoreVertical size={18} />
              </button>
            </div>
          );
        })}

        {displayPlaylists.length === 0 && !showLikedSongs && (
          <div className="p-12 text-center text-neutral-500">
            <p className="text-sm">No playlists match "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-brand-500 font-semibold mt-2 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
