import React from 'react';
import { Play, Pause, Headphones, Flame, Heart } from 'lucide-react';
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

  const handleTrackClick = (track, trackList, idx) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
      return;
    }
    // Queue the entire list starting from this track
    const queueSlice = [...trackList.slice(idx), ...trackList.slice(0, idx)];
    playTrack(track, queueSlice);
  };

  const renderTrackRow = (track, idx, trackList, isPopularList = false) => {
    const isThisTrack = currentTrack?.id === track.id;
    const isThisPlaying = isThisTrack && isPlaying;
    const isFav = isFavorite(track.id);

    return (
      <div
        key={`${isPopularList ? 'pop' : 'user'}-${track.id}-${idx}`}
        onClick={() => handleTrackClick(track, trackList, idx)}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, 'track', track);
          }
        }}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer border ${
          isThisTrack
            ? 'bg-surface-elevated2 border-brand-500/30'
            : 'hover:bg-surface-hover border-transparent'
        }`}
      >
        {/* Left Side: Rank, Cover Art, Title & Artist */}
        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
          {/* Rank Number / Active Equalizer / Play Button */}
          <div className="w-6 flex items-center justify-center shrink-0">
            {isThisPlaying ? (
              <div className="flex items-end justify-center gap-[2px] w-3.5 h-3.5 pb-0.5" title="Playing">
                <span className="w-[2px] bg-brand-500 rounded-full animate-eq-1" />
                <span className="w-[2px] bg-brand-500 rounded-full animate-eq-2" />
                <span className="w-[2px] bg-brand-500 rounded-full animate-eq-3" />
                <span className="w-[2px] bg-brand-500 rounded-full animate-eq-4" />
              </div>
            ) : (
              <>
                <span className={`text-xs font-bold transition-opacity ${
                  isThisTrack ? 'text-brand-400' : 'text-content-muted group-hover:hidden'
                }`}>
                  {idx + 1}
                </span>
                <button
                  type="button"
                  className={`hidden ${
                    isThisTrack ? 'text-brand-400' : 'text-content-primary'
                  } group-hover:flex items-center justify-center`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTrackClick(track, trackList, idx);
                  }}
                  title={isThisPlaying ? 'Pause' : 'Play'}
                >
                  {isThisPlaying ? (
                    <Pause size={14} className="fill-current" />
                  ) : (
                    <Play size={14} className="fill-current ml-0.5" />
                  )}
                </button>
              </>
            )}
          </div>

          {/* Cover Art Thumbnail */}
          <div className="relative w-10 h-10 rounded-md overflow-hidden bg-surface-elevated shrink-0 shadow-sm">
            <img
              src={track.cover_url}
              alt={track.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Title & Artist */}
          <div className="flex-1 min-w-0">
            <p
              onClick={(e) => {
                if (onSelectAlbum && track.album_id) {
                  e.stopPropagation();
                  onSelectAlbum(track.album_id);
                }
              }}
              className={`text-sm font-semibold truncate hover:underline ${
                isThisTrack ? 'text-brand-400 font-bold' : 'text-content-primary'
              }`}
              title={track.title}
            >
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
              title={track.artist_name}
            >
              {track.artist_name}
            </p>
          </div>
        </div>

        {/* Right Side: Badges, Heart, and Duration */}
        <div className="flex items-center gap-2.5 shrink-0 text-xs text-content-muted">
          {/* Badge indicator */}
          {!isPopularList ? (
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-content-secondary">
              {track.user_play_count > 0 ? `${track.user_play_count} plays` : 'Top pick'}
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-500/10 text-brand-400">
              <Flame size={11} className="fill-brand-400 text-brand-400" />
              <span>{track.popularity > 0 ? `${track.popularity}%` : 'Trending'}</span>
            </span>
          )}

          {/* Favorite Button */}
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
            <Heart size={14} className={isFav ? 'fill-brand-500 text-brand-500' : ''} />
          </button>

          {/* Duration */}
          <span className="font-mono text-xs w-9 text-right text-content-muted">
            {formatDuration(track.duration_seconds)}
          </span>
        </div>
      </div>
    );
  };

  if (userTopTracks.length === 0 && popularTracks.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      {/* 2-Column Responsive Grid (Side-by-Side on Desktop, Stacked on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Your Top 10 Tracks */}
        <div className="bg-surface-island rounded-xl p-4 sm:p-5 border border-border-subtle shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-elevated text-brand-400 flex items-center justify-center shadow-inner">
                  <Headphones size={18} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-content-primary tracking-tight">
                    Your Top 10 Tracks
                  </h3>
                  <p className="text-xs text-content-muted">
                    Based on your personal listening telemetry
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              {userTopTracks.slice(0, 10).map((track, idx) =>
                renderTrackRow(track, idx, userTopTracks, false)
              )}
            </div>
          </div>
        </div>

        {/* Table 2: 10 Current Popular Songs */}
        <div className="bg-surface-island rounded-xl p-4 sm:p-5 border border-border-subtle shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-elevated text-orange-400 flex items-center justify-center shadow-inner">
                  <Flame size={18} className="fill-orange-400/20 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-content-primary tracking-tight">
                    10 Current Popular Songs
                  </h3>
                  <p className="text-xs text-content-muted">
                    Top rated across your local music library
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              {popularTracks.slice(0, 10).map((track, idx) =>
                renderTrackRow(track, idx, popularTracks, true)
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
