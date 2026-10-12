import React, { useState } from 'react';
import { Library, Plus, Heart, Music, Disc3, Mic2, X, Check, GripVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';

export const LibrarySidebar = ({
  activeTab,
  setActiveTab,
  playlists = [],
  onSelectPlaylist,
  onCreatePlaylistPrompt,
  onAddTrackToPlaylist,
  onReorderPlaylists,
  stats,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const [dragOverId, setDragOverId] = useState(null);
  const [dropFeedback, setDropFeedback] = useState(null);
  const [draggedPlaylistIdx, setDraggedPlaylistIdx] = useState(null);
  const [playlistDropTarget, setPlaylistDropTarget] = useState(null);
  const { toggleFavorite } = usePlayer();

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
          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition border ${
            dragOverId === 'favorites'
              ? 'bg-[#1ed760]/20 border-[#1ed760] scale-[1.02] shadow-lg'
              : activeTab === 'favorites'
              ? 'bg-[#242424] border-transparent'
              : 'hover:bg-[#1f1f1f] border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-md bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-900 flex items-center justify-center shrink-0 shadow">
            <Heart size={20} className="fill-white text-white" />
          </div>
          <div className="truncate flex-1">
            <div className="flex items-center justify-between">
              <p className={`text-sm font-semibold truncate ${
                activeTab === 'favorites' ? 'text-[#1ed760]' : 'text-white'
              }`}>
                Liked Songs
              </p>
              {dropFeedback?.id === 'favorites' && (
                <span className="text-[10px] text-[#1ed760] font-bold flex items-center gap-0.5">
                  <Check size={11} /> Added!
                </span>
              )}
              {dragOverId === 'favorites' && !dropFeedback && (
                <span className="text-[10px] text-[#1ed760] font-bold">
                  + Drop to save
                </span>
              )}
            </div>
            <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
              Playlist • Auto-collected
            </p>
          </div>
        </div>

        {/* User Playlists */}
        {playlists.map((pl, idx) => {
          const isSelected = activeTab === 'playlist-detail' && pl.id === onSelectPlaylist?.currentId;
          const isDragOverTrack = dragOverId === pl.id;
          const hasFeedback = dropFeedback?.id === pl.id;
          const isTargetAbove = playlistDropTarget?.idx === idx && playlistDropTarget?.position === 'above';
          const isTargetBelow = playlistDropTarget?.idx === idx && playlistDropTarget?.position === 'below';
          const isBeingDragged = draggedPlaylistIdx === idx;

          return (
            <React.Fragment key={pl.id}>
              {isTargetAbove && (
                <div className="h-0.5 w-full bg-[#1ed760] rounded-full my-1 shadow-sm shadow-[#1ed760]/50" />
              )}
              <div
                onClick={() => {
                  onSelectPlaylist(pl.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedPlaylistIdx !== null) {
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

                  // 1. If dragging a playlist to reorder
                  if (draggedPlaylistIdx !== null) {
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
                className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer group transition border ${
                  isBeingDragged
                    ? 'opacity-40 border-dashed border-white/20'
                    : isDragOverTrack
                    ? 'bg-[#1ed760]/20 border-[#1ed760] scale-[1.02] shadow-lg'
                    : isSelected
                    ? 'bg-[#242424] border-transparent'
                    : 'hover:bg-[#1f1f1f] border-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <PlaylistCover covers={pl.covers || []} size="w-12 h-12" iconSize={20} />
                  {isDragOverTrack && (
                    <div className="absolute inset-0 bg-[#1ed760]/30 border-2 border-[#1ed760] rounded-md pointer-events-none" />
                  )}
                </div>
                <div className="truncate flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold truncate ${
                      isSelected || isDragOverTrack ? 'text-[#1ed760]' : 'text-white'
                    }`}>
                      {pl.name}
                    </p>
                    {hasFeedback && (
                      <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                        dropFeedback?.error ? 'text-amber-400' : 'text-[#1ed760]'
                      }`}>
                        {dropFeedback?.error ? dropFeedback.message : <><Check size={11} /> Added!</>}
                      </span>
                    )}
                    {isDragOverTrack && !hasFeedback && (
                      <span className="text-[10px] text-[#1ed760] font-bold animate-pulse">
                        + Drop here
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                    Playlist • {pl.track_count} {pl.track_count === 1 ? 'song' : 'songs'}
                  </p>
                </div>
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
              </div>
              {isTargetBelow && (
                <div className="h-0.5 w-full bg-[#1ed760] rounded-full my-1 shadow-sm shadow-[#1ed760]/50" />
              )}
            </React.Fragment>
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
