import React, { useEffect, useState } from 'react';
import { Play, Pause, Trash2, ArrowLeft, Clock, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const PlaylistDetail = ({ 
  playlistId, 
  onBack, 
  onPlaylistDeleted, 
  onSelectAlbum, 
  onSelectArtist, 
  onContextMenu 
}) => {
  const [playlist, setPlaylist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();

  const fetchPlaylist = () => {
    setIsLoading(true);
    fetch(`/api/playlists/${playlistId}`)
      .then((res) => res.json())
      .then((data) => {
        setPlaylist(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load playlist:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchPlaylist();
  }, [playlistId]);

  if (isLoading || !playlist) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1ed760]" />
      </div>
    );
  }

  const isCurrentPlayingInPlaylist =
    currentTrack && playlist.tracks.some((t) => t.id === currentTrack.id);

  const handlePlayAll = () => {
    if (isCurrentPlayingInPlaylist) {
      togglePlay();
    } else if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks);
    }
  };

  const handleRemoveTrack = async (e, trackId) => {
    e.stopPropagation();
    try {
      await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
      setPlaylist((prev) => ({
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      }));
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!window.confirm(`Are you sure you want to delete "${playlist.name}"?`)) return;
    try {
      await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      onPlaylistDeleted(playlistId);
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const totalSeconds = playlist.tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);

  return (
    <div className="pb-12 select-none">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#b3b3b3] hover:text-white mb-6 transition font-medium"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-8">
        <div className="w-48 h-48 md:w-56 md:h-56 rounded-lg shadow-2xl bg-gradient-to-br from-emerald-800 via-teal-950 to-[#121212] flex items-center justify-center shrink-0 border border-white/5">
          <Music size={64} className="text-white/60" />
        </div>
        <div className="flex-1">
          <span className="text-xs uppercase font-bold tracking-wider text-[#b3b3b3]">Playlist</span>
          <h1 className="text-3xl md:text-5xl font-black text-white mt-1 mb-2 tracking-tight">
            {playlist.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#b3b3b3] font-medium">
            <span className="text-white font-semibold">{playlist.tracks.length} songs</span>
            {totalMins > 0 && ` • ${totalMins} min`}
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePlayAll}
          disabled={playlist.tracks.length === 0}
          className="w-14 h-14 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition disabled:opacity-40"
          title="Play Playlist"
        >
          {isCurrentPlayingInPlaylist && isPlaying ? (
            <Pause size={24} className="fill-black" />
          ) : (
            <Play size={24} className="fill-black ml-1" />
          )}
        </button>

        <button
          onClick={handleDeletePlaylist}
          className="flex items-center gap-2 text-xs font-semibold text-[#888] hover:text-red-400 p-2 rounded-lg transition"
          title="Delete playlist"
        >
          <Trash2 size={16} />
          Delete Playlist
        </button>
      </div>

      {/* Tracklist */}
      {playlist.tracks.length === 0 ? (
        <div className="text-center py-20 text-[#666]">
          <p className="text-sm">This playlist is currently empty.</p>
          <p className="text-xs text-[#555] mt-1">Add songs from albums or search to build this playlist.</p>
        </div>
      ) : (
        <div className="bg-[#181818]/70 rounded-lg p-2 border border-white/5">
          <div className="grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-2 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/5">
            <span>#</span>
            <span>Title</span>
            <span className="hidden md:block">Album</span>
            <span />
            <span className="text-right flex items-center justify-end">
              <Clock size={14} />
            </span>
          </div>

          <div className="divide-y divide-transparent">
            {playlist.tracks.map((track, idx) => {
              const isThisTrack = currentTrack?.id === track.id;
              const isThisPlaying = isThisTrack && isPlaying;
              return (
                <div
                  key={track.id}
                  onClick={() => {
                    if (isThisTrack) {
                      togglePlay();
                    } else {
                      playTrack(track, playlist.tracks);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', track);
                    }
                  }}
                  className={`grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-3 rounded-md group transition items-center cursor-pointer ${
                    isThisTrack ? 'bg-[#242424] text-[#1ed760]' : 'hover:bg-[#1f1f1f] text-white'
                  }`}
                >
                  <span className="text-sm font-medium text-[#b3b3b3] group-hover:hidden">
                    {isThisPlaying ? <span className="text-[#1ed760]">▶</span> : idx + 1}
                  </span>
                  <span className="hidden group-hover:block text-[#1ed760]">
                    {isThisPlaying ? (
                      <Pause size={16} className="fill-current" />
                    ) : (
                      <Play size={16} className="fill-current" />
                    )}
                  </span>

                  <div className="flex items-center gap-3 truncate pr-4">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-[#1f1f1f] shrink-0"
                    />
                    <div className="truncate">
                      <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-[#1ed760]' : 'text-white'}`}>
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

                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectAlbum) onSelectAlbum(track.album_id);
                    }}
                    className="hidden md:block text-xs text-[#b3b3b3] hover:text-white hover:underline truncate cursor-pointer pr-4"
                  >
                    {track.album_title}
                  </span>

                  <button
                    onClick={(e) => handleRemoveTrack(e, track.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-red-400 transition"
                    title="Remove from playlist"
                  >
                    <Trash2 size={16} />
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
