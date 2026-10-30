import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Headphones, Heart, Clock3, MoreVertical } from 'lucide-react';
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
  const hasUserHistory = top10.some((t) => t.is_user_played || (t.user_play_count && t.user_play_count > 0));

  // Build continuous queue with deduplicated popular tracks appended for endless playback continuity
  const getContinuityQueue = useCallback((baseTracks) => {
    const baseIds = new Set(baseTracks.map((t) => t.id));
    const continuityList = popularTracks.filter((t) => !baseIds.has(t.id));
    return [...baseTracks, ...continuityList];
  }, [popularTracks]);

  // Play track from list with full queue continuity and multi-selection support
  const handlePlayFromList = useCallback((track) => {
    // If multiple tracks are selected and the track is one of them, prioritize selected tracks then rest of list
    if (selectedTrackIds.size > 1 && selectedTrackIds.has(track.id)) {
      const selectedTracks = top10.filter((t) => selectedTrackIds.has(t.id));
      const clickedIdx = selectedTracks.findIndex((t) => t.id === track.id);
      const orderedSelected = clickedIdx > 0
        ? [...selectedTracks.slice(clickedIdx), ...selectedTracks.slice(0, clickedIdx)]
        : selectedTracks;
      
      const remainingTop10 = top10.filter((t) => !selectedTrackIds.has(t.id));
      const fullQueue = getContinuityQueue([...orderedSelected, ...remainingTop10]);
      playTrack(track, fullQueue, { preserveOrder: true });
    } else {
      // Standard playback: queue the Top 10 tracks seamlessly followed by continuous popular tracks
      const fullQueue = getContinuityQueue(top10);
      playTrack(track, fullQueue, { preserveOrder: true });
    }
  }, [selectedTrackIds, top10, getContinuityQueue, playTrack]);

  // Single-click: on mobile (<768px) plays track directly; on desktop (>=768px) selects track for double-click/enter/play button
  const handleRowClick = (e, track, idx) => {
    // If clicked directly on interactive child buttons or links, ignore row selection
    if (e.target.closest('button, a')) return;

    // Mobile single tap plays directly, or toggles pause if already currently playing
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (currentTrack?.id === track.id) {
        togglePlay();
      } else {
        handlePlayFromList(track);
      }
      return;
    }

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
      // If clicking an already selected track in a multi-selection on desktop, do not collapse
      if (selectedTrackIds.size > 1 && selectedTrackIds.has(track.id)) {
        return;
      }
      setSelectedTrackIds(new Set([track.id]));
      setLastSelectedTrackIdx(idx);
    }
  };

  // Double-click: play the selected track on desktop
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
          // Play selected tracks prioritized, then remaining Top 10, then popular tracks
          const selectedTracks = top10.filter((t) => selectedTrackIds.has(t.id));
          if (selectedTracks.length > 0) {
            const firstTrack = selectedTracks[0];
            const remainingTop10 = top10.filter((t) => !selectedTrackIds.has(t.id));
            const fullQueue = getContinuityQueue([...selectedTracks, ...remainingTop10]);
            playTrack(firstTrack, fullQueue, { preserveOrder: true });
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
    <section 
      ref={containerRef} 
      data-dev-component="HomeTopTables"
      data-dev-file="src/components/HomeTopTables.jsx"
      data-dev-desc="Your Top 10 Tracks table with prioritized multi-select playback and continuous library streaming"
      className="space-y-4"
    >
      <div className="bg-surface-island rounded-2xl p-5 sm:p-6 border border-border-subtle shadow-xl">
        {/* Header & Quick Play Action */}
        <div className="flex items-center justify-between pb-5 border-b border-border-subtle">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-surface-elevated text-brand-400 flex items-center justify-center shadow-inner">
              <Headphones size={22} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight">
                {hasUserHistory ? 'Your Top 10 Tracks' : 'Top Picks For You'}
              </h3>
              {!hasUserHistory && (
                <p className="text-xs text-content-secondary mt-0.5">
                  Top-rated tracks in your library — your personal top 10 will take shape as you listen
                </p>
              )}
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

        {/* Playlist-style Table (Seamless, borderless, matching Playlist view) */}
        <div className="mt-4">
          {/* Column Header */}
          <div className="hidden md:block bg-surface-island/95 backdrop-blur-md rounded-lg mb-1 border-b border-border-medium shadow-md">
            <div className="grid grid-cols-[4fr_3fr_100px] px-1 md:px-2 py-2.5 text-xs font-semibold uppercase text-content-secondary items-center select-none">
              <div>Title</div>
              <div>Album</div>
              <div className="flex items-center justify-end pr-2">
                <Clock3 size={14} />
              </div>
            </div>
          </div>

          {/* Table Rows (Exact Playlist View Behavior) */}
          <div className="space-y-0.5">
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
                draggable="true"
                onDragStart={(e) => {
                  if (e.target.closest('button, a, input, [data-no-drag]')) {
                    e.preventDefault();
                    return;
                  }

                  const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
                  const orderedTracks = isMulti
                    ? top10.filter((t) => selectedTrackIds.has(t.id))
                    : [track];
                  const trackIds = orderedTracks.map((t) => t.id);

                  e.dataTransfer.setData('application/json', JSON.stringify({
                    id: track.id,
                    track_ids: trackIds,
                    tracks: orderedTracks,
                    title: track.title,
                    artist_name: track.artist_name,
                    album_id: track.album_id,
                    album_title: track.album_title,
                    cover_url: track.cover_url,
                  }));
                  e.dataTransfer.setData('text/plain', trackIds.join(','));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    const isAlreadySelected = selectedTrackIds.has(track.id);
                    if (!isAlreadySelected) {
                      setSelectedTrackIds(new Set([track.id]));
                      setLastSelectedTrackIdx(idx);
                    }
                    const effectiveSelected = isAlreadySelected ? selectedTrackIds : new Set([track.id]);
                    const isMulti = effectiveSelected.size > 1;
                    const selectedList = top10.filter((t) => effectiveSelected.has(t.id));
                    const remainingTop10 = top10.filter((t) => !effectiveSelected.has(t.id));
                    const fullPrioritizedQueue = getContinuityQueue([...selectedList, ...remainingTop10]);
                    const orderedTracks = isMulti ? selectedList : [track];

                    onContextMenu(e, 'track', {
                      ...track,
                      selectedTracks: orderedTracks,
                      fullQueue: isMulti ? fullPrioritizedQueue : getContinuityQueue(top10),
                      preserveOrder: true,
                      track_ids: orderedTracks.map((t) => t.id),
                    });
                  }
                }}
                className={`group grid grid-cols-[1fr_auto] md:grid-cols-[4fr_3fr_100px] items-center px-0 md:px-2 py-2.5 rounded-xl transition cursor-default select-none border ${
                  isSelected
                    ? 'border-transparent bg-surface-hover ring-1 ring-white/20 text-content-primary shadow-sm'
                    : isThisTrack
                    ? 'border-transparent bg-surface-elevated/70 text-content-primary'
                    : 'border-transparent hover:bg-surface-elevated text-content-primary'
                }`}
              >
                {/* 1. Cover Art (with play/pause overlay on web hover), Title & Artist */}
                <div className="flex items-center gap-3 truncate pr-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated shrink-0 shadow-md group/cover">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {/* Desktop Play / Equalizer Overlay */}
                    <div 
                      data-no-drag="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isThisTrack) {
                          togglePlay();
                        } else {
                          handlePlayFromList(track);
                        }
                      }}
                      className={`hidden md:flex absolute inset-0 bg-black/50 items-center justify-center transition cursor-pointer ${
                        isThisPlaying 
                          ? 'opacity-100' 
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isThisPlaying ? (
                        <div className="group-hover/cover:hidden flex items-end justify-center gap-[2.5px] w-4 h-4 pb-0.5" title="Playing">
                          <span className="w-[3px] bg-brand-500 rounded-full animate-eq-1" />
                          <span className="w-[3px] bg-brand-500 rounded-full animate-eq-2" />
                          <span className="w-[3px] bg-brand-500 rounded-full animate-eq-3" />
                          <span className="w-[3px] bg-brand-500 rounded-full animate-eq-4" />
                        </div>
                      ) : null}
                      <span className={isThisPlaying ? "hidden group-hover/cover:inline-block" : ""}>
                        {isThisPlaying ? (
                          <Pause size={16} className="text-white fill-white" />
                        ) : (
                          <Play size={16} className="text-white fill-white ml-0.5" />
                        )}
                      </span>
                    </div>
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

                {/* 4. Heart Favorite, Duration & Mobile 3-Dots */}
                <div className="flex items-center justify-end gap-2 text-xs text-content-muted">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(track.id);
                    }}
                    className={`hidden md:inline-flex p-1.5 rounded-full hover:bg-white/10 transition ${
                      isFav
                        ? 'text-brand-500'
                        : 'text-content-muted hover:text-content-primary opacity-0 group-hover:opacity-100'
                    }`}
                    title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  >
                    <Heart size={15} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
                  </button>

                  <span className="hidden md:inline font-mono text-xs w-10 text-right text-content-secondary">
                    {formatDuration(track.duration_seconds)}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onContextMenu) {
                        onContextMenu(e, 'track', {
                          ...track,
                          selectedTracks: [track],
                          track_ids: [track.id],
                        });
                      }
                    }}
                    className="md:hidden w-7 h-7 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition shrink-0 -mr-1"
                    title="Track Options"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </section>
);
};
