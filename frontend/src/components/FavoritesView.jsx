import React, { useEffect, useState } from 'react';
import { Play, Pause, Heart, Clock, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const FavoritesView = ({ 
  onSelectAlbum, 
  onSelectArtist, 
  onAddToPlaylist, 
  onContextMenu 
}) => {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const { currentTrack, isPlaying, isBuffering, playTrack, togglePlay, toggleFavorite } = usePlayer();

  // Keyboard navigation: Enter or Space to play selected track
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Enter' && selectedTrackId && tracks.length > 0) {
        const found = tracks.find((t) => t.id === selectedTrackId);
        if (found) {
          e.preventDefault();
          playTrack(found, tracks);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, tracks, playTrack]);

  const fetchFavorites = () => {
    setIsLoading(true);
    fetch('/api/favorites')
      .then((res) => res.json())
      .then((data) => {
        setTracks(data.items || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load favorites:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  const isCurrentPlayingInFav = currentTrack && tracks.some((t) => t.id === currentTrack.id);

  const handlePlayAll = () => {
    if (isCurrentPlayingInFav) {
      togglePlay();
    } else if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handleHeartClick = async (e, trackId) => {
    e.stopPropagation();
    await toggleFavorite(trackId);
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500" />
      </div>
    );
  }

  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);

  return (
    <div className="pb-12 select-none">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-8 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-6 sm:p-8 bg-gradient-to-b from-indigo-900/80 via-indigo-950/40 to-[#121212] rounded-t-lg">
        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-lg shadow-2xl bg-gradient-to-br from-indigo-600 via-indigo-800 to-purple-900 flex items-center justify-center shrink-0">
          <Heart size={72} className="fill-white text-white drop-shadow-md" />
        </div>
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-white/80">Playlist</span>
          <h1 className="text-3xl sm:text-5xl font-black text-white mt-1 mb-2 tracking-tight">
            Liked Songs
          </h1>
          <p className="text-xs sm:text-sm text-[#b3b3b3] font-medium">
            <span className="text-white font-semibold">{tracks.length} songs</span> • {totalMins} minutes
          </p>
        </div>
      </div>

      {/* Action Bar */}
      {tracks.length > 0 && (
        <div className="flex items-center gap-6 mb-6">
          <button
            onClick={handlePlayAll}
            className="w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition"
            title="Play Liked Songs"
          >
            {isCurrentPlayingInFav && isPlaying ? (
              <Pause size={24} className="fill-black" />
            ) : (
              <Play size={24} className="fill-black ml-1" />
            )}
          </button>
        </div>
      )}

      {/* Tracklist */}
      {tracks.length === 0 ? (
        <div className="text-center py-20 text-[#666]">
          <Heart size={44} className="mx-auto mb-3 text-[#444]" />
          <h3 className="text-base font-bold text-[#ccc]">Songs you like will appear here</h3>
          <p className="text-xs text-[#777] mt-1">Tap the heart icon on any song to add it to Liked Songs.</p>
        </div>
      ) : (
        <div className="bg-[#181818]/70 rounded-lg p-2 border border-white/5">
          <div className="sticky top-0 z-20 bg-[#181818] backdrop-blur-md rounded-lg grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-2.5 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/10 items-center shadow-md">
            <span>#</span>
            <span>Title</span>
            <span className="hidden md:block">Album</span>
            <span />
            <span className="text-right flex items-center justify-end">
              <Clock size={14} />
            </span>
          </div>

          <div className="divide-y divide-transparent">
            {tracks.map((track, idx) => {
              const isThisTrack = currentTrack?.id === track.id;
              const isThisPlaying = isThisTrack && isPlaying;
              const isThisBuffering = isThisTrack && isBuffering;
              const isSelected = selectedTrackId === track.id;
              return (
                <div
                  key={track.id}
                  data-track-id={track.id}
                  onClick={() => setSelectedTrackId(track.id)}
                  onDoubleClick={() => playTrack(track, tracks)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', track);
                    }
                  }}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      id: track.id,
                      title: track.title,
                      artist_name: track.artist_name,
                      album_id: track.album_id,
                      album_title: track.album_title,
                      cover_url: track.cover_url
                    }));
                    e.dataTransfer.setData('text/plain', String(track.id));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-2.5 rounded-lg group transition items-center cursor-default select-none ${
                    isSelected
                      ? 'bg-[#2a2a2a] ring-1 ring-white/20 text-white'
                      : 'hover:bg-[#1f1f1f] text-white'
                  }`}
                >
                  {/* Column 1: Index / Play-Pause / Animated Equalizer / Loading Spinner */}
                  <div className="flex items-center justify-center w-8 h-8">
                    {isThisBuffering ? (
                      /* Spinner stays visible even on hover until song actually plays */
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                        }}
                        className="flex items-center justify-center w-7 h-7 cursor-pointer"
                        title="Buffering audio... (click to cancel)"
                      >
                        <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Unfocused state (group-hover:hidden) */}
                        <div className="flex items-center justify-center group-hover:hidden">
                          {isThisPlaying ? (
                            /* Animated Spotify Equalizer Bars */
                            <div className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 pb-0.5" title="Playing">
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-1" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-2" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-3" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-4" />
                            </div>
                          ) : (
                            /* Normal track number (green if current track paused, gray otherwise) */
                            <span className={`text-sm font-medium ${isThisTrack ? 'text-brand-500' : 'text-[#b3b3b3]'}`}>
                              {idx + 1}
                            </span>
                          )}
                        </div>

                        {/* Hover state (hidden group-hover:flex) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isThisTrack) {
                              togglePlay();
                            } else {
                              playTrack(track, tracks);
                            }
                          }}
                          className="hidden group-hover:flex items-center justify-center w-7 h-7 text-white hover:text-brand-400 transition"
                          title={isThisPlaying ? "Pause" : "Play"}
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

                  <div className="flex items-center gap-3 truncate pr-4">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-[#1f1f1f] shrink-0"
                    />
                    <div className="truncate">
                      <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-brand-500' : 'text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectArtist) onSelectArtist(track.artist_id);
                          }}
                          className="hover:underline hover:text-white cursor-pointer"
                        >
                          {track.artist_name}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="hidden md:block truncate pr-4">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectAlbum) onSelectAlbum(track.album_id);
                      }}
                      className="text-xs text-[#b3b3b3] hover:text-white hover:underline truncate cursor-pointer inline"
                    >
                      {track.album_title}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleHeartClick(e, track.id)}
                    className="p-1 text-brand-500 hover:scale-110 transition"
                    title="Remove from Liked Songs"
                  >
                    <Heart size={16} className="fill-brand-500" />
                  </button>

                  <span className="text-right text-xs font-mono text-[#b3b3b3]">
                    {formatDuration(track.duration_seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
