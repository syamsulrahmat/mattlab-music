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
  onSelectAlbum,
  onSelectArtist,
  onContextMenu,
}) => {
  const { playTrack, currentTrack, isPlaying, togglePlay, isFavorite, toggleFavorite } = usePlayer();
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const containerRef = useRef(null);

  const top10 = userTopTracks.slice(0, 10);

  // Play track and queue the rest of the list
  const handlePlayFromList = useCallback((track, idx) => {
    const queueSlice = [...top10.slice(idx), ...top10.slice(0, idx)];
    playTrack(track, queueSlice);
  }, [top10, playTrack]);

  // Single-click: select the row (like in playlist view)
  const handleRowClick = (e, track) => {
    // If clicked directly on interactive child buttons or links, ignore row selection
    if (e.target.closest('button, a')) return;
    setSelectedTrackId(track.id);
  };

  // Double-click: play the selected track (like in playlist view)
  const handleRowDoubleClick = (track, idx) => {
    handlePlayFromList(track, idx);
  };

  // Keyboard navigation: Enter to play selected, ArrowUp / ArrowDown to move selection, Escape to clear
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input, textarea, or search field
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (!selectedTrackId) return;

      const currentIdx = top10.findIndex((t) => t.id === selectedTrackId);
      if (currentIdx === -1) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const track = top10[currentIdx];
        if (track) {
          handlePlayFromList(track, currentIdx);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(top10.length - 1, currentIdx + 1);
        const nextTrack = top10[nextIdx];
        if (nextTrack) {
          setSelectedTrackId(nextTrack.id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, currentIdx - 1);
        const prevTrack = top10[prevIdx];
        if (prevTrack) {
          setSelectedTrackId(prevTrack.id);
        }
      } else if (e.key === 'Escape') {
        setSelectedTrackId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, top10, handlePlayFromList]);

  // Clear selection on clicking outside container
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSelectedTrackId(null);
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
              <p className="text-xs sm:text-sm text-content-secondary mt-0.5">
                Your most played tracks based on continuous playback telemetry
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isWholeListPlaying) {
                togglePlay();
              } else {
                handlePlayFromList(top10[0], 0);
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

        {/* Table Rows (Playlist View Behavior) */}
        <div className="space-y-1 mt-2">
          {top10.map((track, idx) => {
            const isThisTrack = currentTrack?.id === track.id;
            const isThisPlaying = isThisTrack && isPlaying;
            const isSelected = selectedTrackId === track.id;
            const isFav = isFavorite(track.id);

            return (
              <div
                key={`top-track-${track.id}`}
                onClick={(e) => handleRowClick(e, track)}
                onDoubleClick={() => handleRowDoubleClick(track, idx)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedTrackId(track.id);
                    onContextMenu(e, 'track', track);
                  }
                }}
                className={`group grid grid-cols-[36px_1fr_40px] md:grid-cols-[40px_4fr_3fr_1fr_100px] items-center px-3.5 py-2.5 rounded-xl transition cursor-pointer select-none border ${
                  isSelected
                    ? 'bg-surface-elevated2 border-brand-500/50 shadow-md ring-1 ring-brand-500/30'
                    : isThisTrack
                    ? 'bg-surface-elevated/70 border-brand-500/20'
                    : 'hover:bg-surface-elevated border-transparent'
                }`}
              >
                {/* 1. Rank Number / Play/Pause Indicator */}
                <div className="flex items-center justify-center shrink-0">
                  {isThisPlaying ? (
                    <div className="flex items-end justify-center gap-[2px] w-3.5 h-3.5 pb-0.5" title="Playing">
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-1" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-2" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-3" />
                      <span className="w-[2px] bg-brand-500 rounded-full animate-eq-4" />
                    </div>
                  ) : (
                    <>
                      <span className={`text-sm font-semibold transition ${
                        isThisTrack ? 'text-brand-400 font-bold' : 'text-content-muted group-hover:hidden'
                      }`}>
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isThisTrack) {
                            togglePlay();
                          } else {
                            handlePlayFromList(track, idx);
                          }
                        }}
                        className={`hidden ${
                          isThisTrack ? 'text-brand-400' : 'text-content-primary hover:text-brand-400'
                        } group-hover:flex items-center justify-center`}
                        title={isThisPlaying ? 'Pause' : 'Play'}
                      >
                        {isThisPlaying ? (
                          <Pause size={15} className="fill-current" />
                        ) : (
                          <Play size={15} className="fill-current ml-0.5" />
                        )}
                      </button>
                    </>
                  )}
                </div>

                {/* 2. Title & Artist (with Album Cover) */}
                <div className="flex items-center gap-3.5 min-w-0 pr-3">
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-surface-elevated shrink-0 shadow-md">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="truncate flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${
                      isThisTrack ? 'text-brand-400 font-bold' : isSelected ? 'text-white' : 'text-content-primary'
                    }`}>
                      {track.title}
                    </p>
                    <p 
                      onClick={(e) => {
                        if (onSelectArtist && track.artist_id) {
                          e.stopPropagation();
                          onSelectArtist(track.artist_id);
                        }
                      }}
                      className="text-xs text-content-secondary truncate hover:text-content-primary hover:underline mt-0.5"
                    >
                      {track.artist_name}
                    </p>
                  </div>
                </div>

                {/* 3. Album Column */}
                <div className="hidden md:block truncate pr-3 text-xs text-content-secondary">
                  <span
                    onClick={(e) => {
                      if (onSelectAlbum && track.album_id) {
                        e.stopPropagation();
                        onSelectAlbum(track.album_id);
                      }
                    }}
                    className="truncate hover:text-content-primary hover:underline"
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

                  <span className="font-mono text-xs w-10 text-right text-content-muted">
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
