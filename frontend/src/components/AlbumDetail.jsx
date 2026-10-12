import React, { useEffect, useState } from 'react';
import { Play, Pause, ArrowLeft, Clock, Heart, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const AlbumDetail = ({ 
  albumId, 
  onBack, 
  onAddToPlaylist, 
  onSelectArtist, 
  onContextMenu 
}) => {
  const [album, setAlbum] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { currentTrack, isPlaying, playTrack, togglePlay, isFavorite, toggleFavorite } = usePlayer();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/albums/${albumId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setAlbum(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load album:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [albumId]);

  if (isLoading || !album) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1ed760]" />
      </div>
    );
  }

  const isCurrentAlbumPlaying =
    currentTrack && album.tracks.some((t) => t.id === currentTrack.id);

  const handlePlayAll = () => {
    if (isCurrentAlbumPlaying) {
      togglePlay();
    } else if (album.tracks.length > 0) {
      playTrack(album.tracks[0], album.tracks);
    }
  };

  const totalSeconds = album.tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);

  return (
    <div className="pb-12 select-none">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#b3b3b3] hover:text-white mb-6 transition font-medium"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Album Header Hero */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-8">
        <img
          src={album.cover_url}
          alt={album.title}
          className="w-48 h-48 md:w-56 md:h-56 rounded-lg shadow-2xl object-cover bg-[#1f1f1f] shrink-0 border border-white/5"
        />
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-[#b3b3b3]">Album</span>
          <h1 className="text-3xl md:text-5xl font-black text-white mt-1 mb-3 tracking-tight">
            {album.title}
          </h1>
          <div className="flex items-center gap-2 text-sm text-[#b3b3b3] font-medium flex-wrap">
            <span 
              onClick={() => onSelectArtist && onSelectArtist(album.artist_id)}
              className="text-white font-semibold hover:underline cursor-pointer"
            >
              {album.artist_name}
            </span>
            {album.year && <span>• {album.year}</span>}
            <span>• {album.tracks.length} songs</span>
            <span>• {totalMins} min</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-6 mb-6">
        <button
          onClick={handlePlayAll}
          className="w-14 h-14 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition"
          title="Play Album"
        >
          {isCurrentAlbumPlaying && isPlaying ? (
            <Pause size={24} className="fill-black" />
          ) : (
            <Play size={24} className="fill-black ml-1" />
          )}
        </button>
      </div>

      {/* Tracklist Table */}
      <div className="bg-[#181818]/70 rounded-lg p-2 border border-white/5">
        <div className="grid grid-cols-[40px_1fr_40px_40px_70px] px-4 py-2 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/5">
          <span>#</span>
          <span>Title</span>
          <span />
          <span />
          <span className="text-right flex items-center justify-end">
            <Clock size={14} />
          </span>
        </div>

        <div className="divide-y divide-transparent">
          {album.tracks.map((track, idx) => {
            const isThisTrack = currentTrack?.id === track.id;
            const isThisPlaying = isThisTrack && isPlaying;
            const isFav = isFavorite(track.id);
            return (
              <div
                key={track.id}
                onClick={() => {
                  if (isThisTrack) {
                    togglePlay();
                  } else {
                    playTrack(track, album.tracks);
                  }
                }}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'track', {
                      ...track,
                      album_id: album.id,
                      album_title: album.title,
                      cover_url: album.cover_url,
                    });
                  }
                }}
                className={`grid grid-cols-[40px_1fr_40px_40px_70px] px-4 py-3 rounded-md group transition items-center cursor-pointer ${
                  isThisTrack ? 'bg-[#242424] text-[#1ed760]' : 'hover:bg-[#1f1f1f] text-white'
                }`}
              >
                <span className="text-sm font-medium text-[#b3b3b3] group-hover:hidden">
                  {isThisPlaying ? (
                    <span className="text-[#1ed760]">▶</span>
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="hidden group-hover:block text-[#1ed760]">
                  {isThisPlaying ? (
                    <Pause size={16} className="fill-current" />
                  ) : (
                    <Play size={16} className="fill-current" />
                  )}
                </span>

                <div className="truncate pr-4">
                  <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-[#1ed760]' : 'text-white'}`}>
                    {track.title}
                  </p>
                  <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectArtist) onSelectArtist(track.artist_id || album.artist_id);
                      }}
                      className="hover:underline hover:text-white cursor-pointer"
                    >
                      {track.artist_name}
                    </span>
                    {' • '}
                    <span className="uppercase text-[10px]">{track.file_format}</span>
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddToPlaylist) onAddToPlaylist(track);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#b3b3b3] hover:text-white transition"
                  title="Add to playlist"
                >
                  <Plus size={16} />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(track.id);
                  }}
                  className={`p-1 transition ${
                    isFav ? 'text-[#1ed760]' : 'opacity-0 group-hover:opacity-100 text-[#b3b3b3] hover:text-white'
                  }`}
                  title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <Heart size={16} className={isFav ? 'fill-[#1ed760]' : ''} />
                </button>

                <span className="text-right text-xs font-mono text-[#b3b3b3]">
                  {formatDuration(track.duration_seconds)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
