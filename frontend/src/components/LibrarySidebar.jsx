import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Library, Plus, Heart, Music, Disc3, Mic2, X, Check, GripVertical, Search, ArrowUpDown } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';
import { SpotifyIcon } from './SpotifyIcon';

export const LibrarySidebar = ({
  activeTab,
  setActiveTab,
  playlists = [],
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylistPrompt,
  onImportSpotifyPrompt,
  onAddTrackToPlaylist,
  onReorderPlaylists,
  stats,
  isMobileOpen = false,
  onCloseMobile,
  onContextMenu,
}) => {
  const [dragOverId, setDragOverId] = useState(null);
  const [dropFeedback, setDropFeedback] = useState(null);
  const [draggedPlaylistIdx, setDraggedPlaylistIdx] = useState(null);
  const [playlistDropTarget, setPlaylistDropTarget] = useState(null);
  
  // Library search and sorting states
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [playlistSort, setPlaylistSort] = useState('custom'); // 'custom', 'name_asc', 'name_desc', 'recent', 'tracks'
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const sortMenuRef = useRef(null);

  const { toggleFavorite, currentTrack, isPlaying } = usePlayer();

  // Close sort menu on click outside
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

  // Filter & sort playlists
  const displayPlaylists = useMemo(() => {
    let list = [...playlists];
    if (librarySearchQuery.trim()) {
      const q = librarySearchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (playlistSort === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (playlistSort === 'name_desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (playlistSort === 'recent') {
      list.sort((a, b) => new Date(b.created_at || b.added_at || 0) - new Date(a.created_at || a.added_at || 0));
    } else if (playlistSort === 'tracks') {
      list.sort((a, b) => (b.track_count || 0) - (a.track_count || 0));
    }
    return list;
  }, [playlists, librarySearchQuery, playlistSort]);

  const showLikedSongs = useMemo(() => {
    if (!librarySearchQuery.trim()) return true;
    const q = librarySearchQuery.toLowerCase().trim();
    return 'liked songs'.includes(q) || 'favorites'.includes(q);
  }, [librarySearchQuery]);

  // Combined matched items list for keyboard navigation
  const filteredItems = useMemo(() => {
    const items = [];
    if (showLikedSongs) {
      items.push({ type: 'favorites', id: 'favorites', name: 'Liked Songs' });
    }
    displayPlaylists.forEach((pl) => {
      items.push({ type: 'playlist', id: pl.id, data: pl, name: pl.name });
    });
    return items;
  }, [showLikedSongs, displayPlaylists]);

  // Reset focus when user types so typing is never interrupted
  useEffect(() => {
    setFocusedIndex(-1);
  }, [librarySearchQuery]);

  // Auto-scroll the focused item into view when navigating with arrow keys
  useEffect(() => {
    if (focusedIndex >= 0) {
      const el = document.getElementById(`library-item-${focusedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedIndex]);

  const handleSearchKeyDown = (e) => {
    if (filteredItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (prev < 0) return 0; // Down arrow on search activates focus on the first row!
        return prev < filteredItems.length - 1 ? prev + 1 : prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (prev <= 0) return -1; // Up arrow from top row returns focus to input
        return prev - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIdx = focusedIndex >= 0 ? focusedIndex : 0;
      const targetItem = filteredItems[targetIdx];
      if (targetItem) {
        if (targetItem.type === 'favorites') {
          setActiveTab('favorites');
          if (onCloseMobile) onCloseMobile();
        } else if (targetItem.type === 'playlist') {
          onSelectPlaylist(targetItem.id);
          if (onCloseMobile) onCloseMobile();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (focusedIndex >= 0) {
        setFocusedIndex(-1);
      } else {
        setLibrarySearchQuery('');
      }
    }
  };

  const isCustomOrder = playlistSort === 'custom' && !librarySearchQuery.trim();

  const content = (
    <div className="flex flex-col h-full min-h-0 bg-[#121212] rounded-lg overflow-hidden select-none">
      {/* Island Header */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5 text-[#b3b3b3]">
          <Library size={22} className="stroke-[2.2]" />
          <span className="font-bold text-sm text-[#b3b3b3] tracking-tight">Your Library</span>
        </div>

        <div className="flex items-center gap-1">
          {onImportSpotifyPrompt && (
            <button
              onClick={onImportSpotifyPrompt}
              className="w-8 h-8 rounded-full hover:bg-[#1f1f1f] text-[#b3b3b3] hover:text-[#1DB954] flex items-center justify-center transition"
              title="Import Spotify playlist"
            >
              <SpotifyIcon size={16} />
            </button>
          )}
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
      <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5 shrink-0">
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

      {/* Sub-bar: Search in library (left) & Playlist reordering (right) */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-white/5 shrink-0">
        {/* Left: Search input to filter playlists */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777]" />
          <input
            type="text"
            placeholder="Search in library..."
            value={librarySearchQuery}
            onChange={(e) => setLibrarySearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full bg-[#181818] hover:bg-[#202020] focus:bg-[#202020] text-xs text-white pl-7 pr-6 py-1.5 rounded-full border border-white/5 focus:border-white/20 outline-none transition placeholder:text-[#666]"
          />
          {librarySearchQuery && (
            <button
              onClick={() => setLibrarySearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777] hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Right: Reordering / Sorting dropdown */}
        <div className="relative shrink-0" ref={sortMenuRef}>
          <button
            onClick={() => setIsSortMenuOpen((prev) => !prev)}
            className={`p-1.5 rounded-md hover:bg-[#202020] text-xs flex items-center gap-1 transition ${
              playlistSort !== 'custom' ? 'text-brand-400 bg-brand-500/10' : 'text-[#888] hover:text-white'
            }`}
            title="Sort playlists"
          >
            <ArrowUpDown size={14} />
            <span className="text-[11px] font-medium hidden sm:inline">
              {playlistSort === 'custom'
                ? 'Custom'
                : playlistSort === 'name_asc'
                ? 'A-Z'
                : playlistSort === 'name_desc'
                ? 'Z-A'
                : playlistSort === 'recent'
                ? 'Recent'
                : 'Songs'}
            </span>
          </button>

          {isSortMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#1f1f1f] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-xs">
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#666] tracking-wider">
                Sort Playlists
              </div>
              <button
                onClick={() => {
                  setPlaylistSort('custom');
                  setIsSortMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/10 transition ${
                  playlistSort === 'custom' ? 'text-brand-500 font-bold' : 'text-white'
                }`}
              >
                <span>Custom order</span>
                {playlistSort === 'custom' && <Check size={13} />}
              </button>
              <button
                onClick={() => {
                  setPlaylistSort('name_asc');
                  setIsSortMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/10 transition ${
                  playlistSort === 'name_asc' ? 'text-brand-500 font-bold' : 'text-white'
                }`}
              >
                <span>Alphabetical (A–Z)</span>
                {playlistSort === 'name_asc' && <Check size={13} />}
              </button>
              <button
                onClick={() => {
                  setPlaylistSort('name_desc');
                  setIsSortMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/10 transition ${
                  playlistSort === 'name_desc' ? 'text-brand-500 font-bold' : 'text-white'
                }`}
              >
                <span>Alphabetical (Z–A)</span>
                {playlistSort === 'name_desc' && <Check size={13} />}
              </button>
              <button
                onClick={() => {
                  setPlaylistSort('recent');
                  setIsSortMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/10 transition ${
                  playlistSort === 'recent' ? 'text-brand-500 font-bold' : 'text-white'
                }`}
              >
                <span>Recently added</span>
                {playlistSort === 'recent' && <Check size={13} />}
              </button>
              <button
                onClick={() => {
                  setPlaylistSort('tracks');
                  setIsSortMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/10 transition ${
                  playlistSort === 'tracks' ? 'text-brand-500 font-bold' : 'text-white'
                }`}
              >
                <span>Most songs</span>
                {playlistSort === 'tracks' && <Check size={13} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Playlists & Liked Songs Section */}
      <div 
        onContextMenu={(e) => {
          if (e.target === e.currentTarget && onContextMenu) {
            onContextMenu(e, 'library-blank', {});
          }
        }}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1"
      >
        {/* Liked Songs Special Item */}
        {showLikedSongs && (() => {
          const isFavoritesSelected = activeTab === 'favorites';
          const isPlayingFavorites = isPlaying && currentTrack?.playlist_id === 'favorites';
          const isFavoritesFocused = focusedIndex === 0;

          return (
            <div
              id="library-item-0"
              onMouseEnter={() => librarySearchQuery.trim() && setFocusedIndex(0)}
              onClick={() => {
                setActiveTab('favorites');
                if (onCloseMobile) onCloseMobile();
              }}
              onContextMenu={(e) => {
                if (onContextMenu) {
                  onContextMenu(e, 'favorites', { id: 'favorites', name: 'Liked Songs' });
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragOverId('favorites');
              }}
              onDragLeave={() => {
                if (dragOverId === 'favorites') setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverId(null);
                let trackId = null;
                try {
                  const json = e.dataTransfer.getData('application/json');
                  if (json) trackId = JSON.parse(json).id;
                } catch (_) {}
                if (!trackId) {
                  trackId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                }
                if (trackId) {
                  toggleFavorite(trackId);
                  setDropFeedback({ id: 'favorites', message: 'Added to Liked Songs!' });
                  setTimeout(() => setDropFeedback(null), 2500);
                }
              }}
              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition border relative ${
                dragOverId === 'favorites'
                  ? 'bg-brand-500/20 border-brand-500 scale-[1.02] shadow-lg'
                  : isFavoritesFocused
                  ? 'bg-[#2a2a2a] border-brand-500/60 ring-1 ring-brand-500/40 shadow-md'
                  : isFavoritesSelected
                  ? 'bg-[#282828] border-brand-500/40 shadow-sm'
                  : 'hover:bg-[#1f1f1f] border-transparent'
              }`}
            >
              {(isFavoritesSelected || isFavoritesFocused) && (
                <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full shadow-sm ${
                  isFavoritesFocused ? 'bg-brand-400 shadow-brand-400/50' : 'bg-brand-500 shadow-brand-500/50'
                }`} />
              )}
              <div className="w-12 h-12 rounded-md bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-900 flex items-center justify-center shrink-0 shadow">
                <Heart size={20} className="fill-white text-white" />
              </div>
              <div className="truncate flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <p className={`text-sm font-semibold truncate ${
                      isFavoritesFocused
                        ? 'text-brand-300 font-bold'
                        : isFavoritesSelected
                        ? 'text-brand-400 font-bold'
                        : isPlayingFavorites
                        ? 'text-brand-500 font-bold'
                        : 'text-white'
                    }`}>
                      Liked Songs
                    </p>
                    {isPlayingFavorites && (
                      <div className="flex items-end justify-center gap-[2px] w-3 h-3 pb-0.5 shrink-0" title="Playing">
                        <span className="w-[2px] bg-brand-500 rounded-full animate-eq-1" />
                        <span className="w-[2px] bg-brand-500 rounded-full animate-eq-2" />
                        <span className="w-[2px] bg-brand-500 rounded-full animate-eq-3" />
                        <span className="w-[2px] bg-brand-500 rounded-full animate-eq-4" />
                      </div>
                    )}
                  </div>
                  {dropFeedback?.id === 'favorites' && (
                    <span className="text-[10px] text-brand-500 font-bold flex items-center gap-0.5">
                      <Check size={11} /> Added!
                    </span>
                  )}
                  {dragOverId === 'favorites' && !dropFeedback && (
                    <span className="text-[10px] text-brand-500 font-bold">
                      + Drop to save
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                  Playlist • Auto-collected
                </p>
              </div>
            </div>
          );
        })()}

        {/* User Playlists */}
        {displayPlaylists.map((pl, idx) => {
          const isSelected = activeTab === 'playlist-detail' && pl.id === selectedPlaylistId;
          const isPlayingThis = isPlaying && currentTrack?.playlist_id === pl.id;
          const isDragOverTrack = dragOverId === pl.id;
          const hasFeedback = dropFeedback?.id === pl.id;
          const isTargetAbove = playlistDropTarget?.idx === idx && playlistDropTarget?.position === 'above';
          const isTargetBelow = playlistDropTarget?.idx === idx && playlistDropTarget?.position === 'below';
          const isBeingDragged = draggedPlaylistIdx === idx;
          const itemIndex = (showLikedSongs ? 1 : 0) + idx;
          const isItemFocused = focusedIndex === itemIndex;

          return (
            <React.Fragment key={pl.id}>
              {isCustomOrder && isTargetAbove && (
                <div className="h-0.5 w-full bg-brand-500 rounded-full my-1 shadow-sm shadow-brand-500/50" />
              )}
              <div
                id={`library-item-${itemIndex}`}
                onMouseEnter={() => librarySearchQuery.trim() && setFocusedIndex(itemIndex)}
                onClick={() => {
                  onSelectPlaylist(pl.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    onContextMenu(e, 'playlist', pl);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (isCustomOrder && draggedPlaylistIdx !== null) {
                    e.dataTransfer.dropEffect = 'move';
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    setPlaylistDropTarget({
                      idx,
                      position: e.clientY < midY ? 'above' : 'below',
                    });
                    return;
                  }
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverId(pl.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === pl.id) setDragOverId(null);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverId(null);

                  // 1. If dragging a playlist to reorder (only in custom order mode)
                  if (isCustomOrder && draggedPlaylistIdx !== null) {
                    const fromIdx = draggedPlaylistIdx;
                    let toIdx = idx;
                    if (playlistDropTarget?.position === 'below' && fromIdx > idx) {
                      toIdx = idx + 1;
                    } else if (playlistDropTarget?.position === 'above' && fromIdx < idx) {
                      toIdx = idx - 1;
                    }
                    toIdx = Math.max(0, Math.min(playlists.length - 1, toIdx));

                    setDraggedPlaylistIdx(null);
                    setPlaylistDropTarget(null);

                    if (fromIdx === toIdx) return;

                    const newPlaylists = [...playlists];
                    const [moved] = newPlaylists.splice(fromIdx, 1);
                    newPlaylists.splice(toIdx, 0, moved);

                    if (onReorderPlaylists) {
                      onReorderPlaylists(newPlaylists);
                    }

                    try {
                      await fetch('/api/playlists/reorder', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ playlist_ids: newPlaylists.map((p) => p.id) }),
                      });
                    } catch (err) {
                      console.error('Failed to persist playlist reorder:', err);
                    }
                    return;
                  }

                  // 2. Otherwise dragging a track to add into playlist
                  let trackData = null;
                  try {
                    const json = e.dataTransfer.getData('application/json');
                    if (json) trackData = JSON.parse(json);
                  } catch (_) {}
                  const trackId = trackData?.id || parseInt(e.dataTransfer.getData('text/plain'), 10);
                  if (trackId && onAddTrackToPlaylist) {
                    const res = await onAddTrackToPlaylist(pl.id, trackId);
                    if (res?.already_exists) {
                      setDropFeedback({ id: pl.id, error: true, message: '⚠️ Already exists' });
                    } else {
                      setDropFeedback({ id: pl.id, message: `Added to ${pl.name}!` });
                    }
                    setTimeout(() => setDropFeedback(null), 3000);
                  }
                }}
                className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer group transition border relative ${
                  isBeingDragged
                    ? 'opacity-40 border-dashed border-white/20'
                    : isDragOverTrack
                    ? 'bg-brand-500/20 border-brand-500 scale-[1.02] shadow-lg'
                    : isItemFocused
                    ? 'bg-[#2a2a2a] border-brand-500/60 ring-1 ring-brand-500/40 shadow-md'
                    : isSelected
                    ? 'bg-[#282828] border-brand-500/40 shadow-sm'
                    : 'hover:bg-[#1f1f1f] border-transparent'
                }`}
              >
                {(isSelected || isItemFocused) && (
                  <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full shadow-sm ${
                    isItemFocused ? 'bg-brand-400 shadow-brand-400/50' : 'bg-brand-500 shadow-brand-500/50'
                  }`} />
                )}
                <div className="relative shrink-0">
                  <PlaylistCover covers={pl.covers || []} size="w-12 h-12" iconSize={20} />
                  {isDragOverTrack && (
                    <div className="absolute inset-0 bg-brand-500/30 border-2 border-brand-500 rounded-md pointer-events-none" />
                  )}
                </div>
                <div className="truncate flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <p className={`text-sm font-semibold truncate ${
                        isItemFocused
                          ? 'text-brand-300 font-bold'
                          : isSelected
                          ? 'text-brand-400 font-bold'
                          : isPlayingThis
                          ? 'text-brand-500 font-bold'
                          : isDragOverTrack
                          ? 'text-brand-400'
                          : 'text-white'
                      }`}>
                        {pl.name}
                      </p>
                      {isPlayingThis && (
                        <div className="flex items-end justify-center gap-[2px] w-3 h-3 pb-0.5 shrink-0" title="Playing">
                          <span className="w-[2px] bg-brand-500 rounded-full animate-eq-1" />
                          <span className="w-[2px] bg-brand-500 rounded-full animate-eq-2" />
                          <span className="w-[2px] bg-brand-500 rounded-full animate-eq-3" />
                          <span className="w-[2px] bg-brand-500 rounded-full animate-eq-4" />
                        </div>
                      )}
                    </div>
                    {hasFeedback && (
                      <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                        dropFeedback?.error ? 'text-amber-400' : 'text-brand-500'
                      }`}>
                        {dropFeedback?.error ? dropFeedback.message : <><Check size={11} /> Added!</>}
                      </span>
                    )}
                    {isDragOverTrack && !hasFeedback && (
                      <span className="text-[10px] text-brand-500 font-bold animate-pulse">
                        + Drop here
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#b3b3b3] truncate mt-0.5 flex items-center gap-1.5">
                    {pl.spotify_id && (
                      <span className="text-[#1DB954] shrink-0" title="Synced with Spotify">
                        <SpotifyIcon size={12} />
                      </span>
                    )}
                    <span>Playlist • {pl.track_count} {pl.track_count === 1 ? 'song' : 'songs'}</span>
                  </p>
                </div>
                {isCustomOrder && (
                  <div 
                    draggable="true"
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('application/x-playlist-id', String(pl.id));
                      e.dataTransfer.setData('application/x-playlist-idx', String(idx));
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedPlaylistIdx(idx);
                    }}
                    onDragEnd={() => {
                      setDraggedPlaylistIdx(null);
                      setPlaylistDropTarget(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-white/0 group-hover:text-white/30 hover:!text-white cursor-grab active:cursor-grabbing p-1 transition"
                    title="Drag to rearrange playlist order"
                  >
                    <GripVertical size={14} />
                  </div>
                )}
              </div>
              {isCustomOrder && isTargetBelow && (
                <div className="h-0.5 w-full bg-brand-500 rounded-full my-1 shadow-sm shadow-brand-500/50" />
              )}
            </React.Fragment>
          );
        })}

        {displayPlaylists.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-[#666]">
            {librarySearchQuery.trim()
              ? 'No matching playlists found.'
              : 'No custom playlists yet. Tap + to create one!'}
          </div>
        )}
      </div>

      {/* Subtle Library Counter Widget at the Bottom */}
      {stats && (
        <div className="px-4 py-3 bg-[#121212] border-t border-white/5 text-[11px] text-[#b3b3b3] flex items-center justify-between shrink-0">
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
      <aside className="hidden md:flex flex-col h-full min-h-0 w-[280px] shrink-0 overflow-hidden">
        {content}
      </aside>

      {/* Mobile Drawer (When Opened on Mobile) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative w-72 max-w-[85vw] h-full min-h-0 flex flex-col p-2 z-10 overflow-hidden">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
