import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Headphones, Heart, Clock3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const HomeTopTables = ({
  userTopTracks = [],
  popularTracks = [],
  onSelectAlbum,
  onSelectArtist,
  onContextMenu,
}) => {
  const { playTrack, currentTrack, isPlaying, togglePlay, isFavorite, toggleFavorite } = usePlayer();
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [lastSelectedTrackIdx, setLastSelectedTrackIdx] = useState(null);
  const containerRef = useRef(null);

  const top10 = userTopTracks.slice(0, 10);

  // Build continuous queue with deduplicated popular tracks appended for endless playback continuity
  const getContinuityQueue = useCallback((baseTracks) => {
    const baseIds = new Set(baseTracks.map((t) => t.id));
    const continuityList = popularTracks.filter((t) => !baseIds.has(t.id));
    return [...baseTracks, ...continuityList];
  }, [popularTracks]);

  // Play track from list with full queue continuity and multi-selection support
  const handlePlayFromList = useCallback((track) => {
    // If multiple tracks are selected and the track is one of them, queue all selected tracks
    if (selectedTrackIds.size > 1 && selectedTrackIds.has(track.id)) {
      const selectedTracks = top10.filter((t) => selectedTrackIds.has(t.id));
      const fullQueue = getContinuityQueue(selectedTracks);
      playTrack(track, fullQueue);
    } else {
      // Standard playback: queue the Top 10 tracks seamlessly followed by continuous popular tracks
      const fullQueue = getContinuityQueue(top10);
      playTrack(track, fullQueue);
    }
  }, [selectedTrackIds, top10, getContinuityQueue, playTrack]);

  // Single-click selection matching PlaylistDetail behavior (supports Shift & Ctrl/Cmd)
  const handleRowClick = (e, track, idx) => {
    // If clicked directly on interactive child buttons or links, ignore row selection
    if (e.target.closest('button, a')) return;

    if (e.shiftKey && lastSelectedTrackIdx !== null) {
      const start = Math.min(lastSelectedTrackIdx, idx);
      const end = Math.max(lastSelectedTrackIdx, idx);
      const nextSet = new Set(selectedTrackIds);
      for (let i = start; i <= end; i++) {
        if (top10[i]) nextSet.add(top10[i].id);
      }
      setSelectedTrackIds(nextSet);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      setLastSelectedTrackIdx(idx);
    } else {
      setSelectedTrackIds(new Set([track.id]));
      setLastSelectedTrackIdx(idx);
    }
  };

  // Double-click: play the selected track (like in playlist view)
  const handleRowDoubleClick = (track) => {
    handlePlayFromList(track);
  };

  // Keyboard navigation matching PlaylistDetail
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input, textarea, or search field
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (selectedTrackIds.size === 0) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedTrackIds.size > 1) {
          // Play all selected tracks starting with the first selected track in the list
          const selectedTracks = top10.filter((t) => selectedTrackIds.has(t.id));
          if (selectedTracks.length > 0) {
            const firstTrack = selectedTracks[0];
            const fullQueue = getContinuityQueue(selectedTracks);
            playTrack(firstTrack, fullQueue);
          }
        } else if (selectedTrackIds.size === 1) {
          const [singleId] = Array.from(selectedTrackIds);
          const found = top10.find((t) => t.id === singleId);
          if (found) {
            handlePlayFromList(found);
          }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = lastSelectedTrackIdx ?? top10.findIndex((t) => selectedTrackIds.has(t.id));
        const nextIdx = Math.min(top10.length - 1, currentIdx >= 0 ? currentIdx + 1 : 0);
        const nextTrack = top10[nextIdx];
        if (nextTrack) {
          setSelectedTrackIds(new Set([nextTrack.id]));
          setLastSelectedTrackIdx(nextIdx);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = lastSelectedTrackIdx ?? top10.findIndex((t) => selectedTrackIds.has(t.id));
        const prevIdx = Math.max(0, currentIdx >= 0 ? currentIdx - 1 : 0);
        const prevTrack = top10[prevIdx];
        if (prevTrack) {
          setSelectedTrackIds(new Set([prevTrack.id]));
          setLastSelectedTrackIdx(prevIdx);
        }
      } else if (e.key === 'Escape') {
        setSelectedTrackIds(new Set());
        setLastSelectedTrackIdx(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackIds, lastSelectedTrackIdx, top10, getContinuityQueue, handlePlayFromList, playTrack]);

  // Clear selection on clicking outside container
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSelectedTrackIds(new Set());
        setLastSelectedTrackIdx(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (top10.length === 0) {
    return null;
  }

  const isWholeListPlaying = top10.some((t) => t.id === currentTrack?.id) && isPlaying;

  return (
    <section ref={containerRef} className="space-y-4">
      <div className="bg-surface-island rounded-2xl p-5 sm:p-6 border border-border-subtle shadow-xl">
        {/* Header & Quick Play Action */}
        <div className="flex items-center justify-between pb-5 border-b border-border-subtle">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-surface-elevated text-brand-400 flex items-center justify-center shadow-inner">
              <Headphones size={22} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight">
                Your Top 10 Tracks
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isWholeListPlaying) {
                togglePlay();
              } else {
                handlePlayFromList(top10[0]);
              }
            }}
            className="w-10 h-10 rounded-full bg-brand-500 hover:scale-105 active:scale-95 transition flex items-center justify-center text-black shadow-lg shrink-0"
            title={isWholeListPlaying ? "Pause Top 10" : "Play Top 10"}
          >
            {isWholeListPlaying ? (
              <Pause size={18} className="fill-black" />
            ) : (
              <Play size={18} className="fill-black ml-0.5" />
            )}
          </button>
        </div>

        {/* Playlist-style Table Column Header */}
        <div className="grid grid-cols-[36px_1fr_40px] md:grid-cols-[40px_4fr_3fr_1fr_100px] px-3.5 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider border-b border-white/5 select-none mt-2">
          <div className="text-center">#</div>
          <div>Title</div>
          <div className="hidden md:block">Album</div>
          <div className="hidden md:block text-right">Plays</div>
          <div className="flex items-center justify-end pr-2">
            <Clock3 size={14} />
          </div>
        </div>

        {/* Table Rows (Exact Playlist View Behavior) */}
        <div className="space-y-1 mt-2">
          {top10.map((track, idx) => {
            const isThisTrack = currentTrack?.id === track.id;
            const isThisPlaying = isThisTrack && isPlaying;
            const isSelected = selectedTrackIds.has(track.id);
            const isFav = isFavorite(track.id);

            return (
              <div
                key={`top-track-${track.id}`}
                onClick={(e) => handleRowClick(e, track, idx)}
                onDoubleClick={() => handleRowDoubleClick(track)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selectedTrackIds.has(track.id)) {
                      setSelectedTrackIds(new Set([track.id]));
                      setLastSelectedTrackIdx(idx);
                    }
                    const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
                    const orderedTracks = isMulti
                      ? top10.filter((t) => selectedTrackIds.has(t.id))
                      : [track];
                    onContextMenu(e, 'track', {
                      ...track,
                      selectedTracks: orderedTracks,
                      track_ids: orderedTracks.map((t) => t.id),
                    });
                  }
                }}
                className={`group grid grid-cols-[36px_1fr_40px] md:grid-cols-[40px_4fr_3fr_1fr_100px] items-center px-3.5 py-2.5 rounded-xl transition cursor-pointer select-none border ${
                  isSelected
                    ? 'border-transparent bg-surface-hover ring-1 ring-white/20 text-content-primary shadow-sm'
                    : isThisTrack
                    ? 'border-transparent bg-surface-elevated/70 text-content-primary'
                    : 'border-transparent hover:bg-surface-elevated text-content-primary'
                }`}
              >
                {/* 1. Rank Number / Play-Pause Indicator (Playlist View Hover & Selection Behavior) */}
                <div className="flex items-center justify-center w-8 h-8 shrink-0">
                  <div className="flex items-center justify-center group-hover:hidden">
                    {isThisPlaying ? (
                      <div className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 pb-0.5" title="Playing">
                        <span className="w-[3px] bg-brand-500 rounded-full animate-eq-1" />
                        <span className="w-[3px] bg-brand-500 rounded-full animate-eq-2" />
                        <span className="w-[3px] bg-brand-500 rounded-full animate-eq-3" />
                        <span className="w-[3px] bg-brand-500 rounded-full animate-eq-4" />
                      </div>
                    ) : (
                      <span className={`text-sm font-medium ${isThisTrack ? 'text-brand-500 font-bold' : 'text-content-secondary'}`}>
                        {idx + 1}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisTrack) {
                        togglePlay();
                      } else {
                        handlePlayFromList(track);
                      }
                    }}
                    className="hidden group-hover:flex items-center justify-center w-7 h-7 text-content-primary hover:text-brand-400 transition"
                    title={isThisPlaying ? "Pause" : "Play"}
                  >
                    {isThisPlaying ? (
                      <Pause size={15} className="fill-current" />
                    ) : (
                      <Play size={15} className="fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                {/* 2. Cover Art, Title & Artist (No accidental link clicking on row hover) */}
                <div className="flex items-center gap-3 truncate pr-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated shrink-0 shadow-md">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="truncate min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate">
                      <p className={`text-sm font-medium truncate ${
                        isThisTrack 
                          ? 'text-brand-500 font-bold' 
                          : isSelected 
                          ? 'text-white font-medium' 
                          : 'text-content-primary'
                      }`}>
                        {track.title}
                      </p>
                    </div>
                    <p className="text-xs text-content-secondary truncate mt-0.5">
                      <span
                        onClick={(e) => {
                          if (onSelectArtist && track.artist_id) {
                            e.stopPropagation();
                            onSelectArtist(track.artist_id);
                          }
                        }}
                        className="hover:underline hover:text-content-primary cursor-pointer inline"
                      >
                        {track.artist_name}
                      </span>
                    </p>
                  </div>
                </div>

                {/* 3. Album Column (Only text link is interactive) */}
                <div className="hidden md:block truncate pr-3 text-xs text-content-secondary">
                  <span
                    onClick={(e) => {
                      if (onSelectAlbum && track.album_id) {
                        e.stopPropagation();
                        onSelectAlbum(track.album_id);
                      }
                    }}
                    className="truncate hover:text-content-primary hover:underline cursor-pointer inline"
                    title={track.album_title}
                  >
                    {track.album_title || '—'}
                  </span>
                </div>

                {/* 4. Plays Badge */}
                <div className="hidden md:block text-right pr-3 text-xs font-mono text-content-secondary">
                  <span className="px-2.5 py-1 rounded-full bg-white/5 font-semibold text-content-primary text-[11px]">
                    {track.user_play_count > 0 ? `${track.user_play_count} plays` : 'Top pick'}
                  </span>
                </div>

                {/* 5. Heart Favorite & Duration */}
                <div className="flex items-center justify-end gap-2 text-xs text-content-muted">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(track.id);
                    }}
                    className={`p-1.5 rounded-full hover:bg-white/10 transition ${
                      isFav
                        ? 'text-brand-500'
                        : 'text-content-muted hover:text-content-primary opacity-0 group-hover:opacity-100'
                    }`}
                    title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  >
                    <Heart size={15} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                  </button>

                  <span className="font-mono text-xs w-10 text-right text-content-secondary">
                    {formatDuration(track.duration_seconds)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
