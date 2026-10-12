import React, { useEffect, useState } from 'react';
import { Play, Pause, ArrowLeft, Clock, CheckCircle2, Heart, Plus, Disc3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const ArtistDetail = ({ 
  artistId, 
  onBack, 
  onSelectAlbum, 
  onAddToPlaylist,
  onContextMenu 
}) => {
  const [artist, setArtist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { currentTrack, isPlaying, playTrack, togglePlay, isFavorite, toggleFavorite } = usePlayer();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/artists/${artistId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setArtist(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load artist:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [artistId]);

  if (isLoading || !artist) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1ed760]" />
      </div>
    );
  }

  const isCurrentArtistPlaying =
    currentTrack && artist.tracks.some((t) => t.id === currentTrack.id);

  const handlePlayAll = () => {
    if (isCurrentArtistPlaying) {
      togglePlay();
    } else if (artist.tracks.length > 0) {
      playTrack(artist.tracks[0], artist.tracks);
    }
  };

  return (
    <div className="pb-12">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#b3b3b3] hover:text-white mb-6 transition font-medium"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-8 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-6 sm:p-8 bg-gradient-to-b from-[#2a2a2a] via-[#1a1a1a] to-[#121212] rounded-t-lg border-b border-white/5">
        <div className="relative group">
          <img
            src={artist.image_url || `/api/artists/${artist.id}/image`}
            alt={artist.name}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/api/covers/0';
            }}
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full shadow-2xl object-cover bg-[#242424] shrink-0 border-2 border-white/10 group-hover:scale-105 transition duration-300"
          />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider text-[#1ed760]">
            <CheckCircle2 size={16} className="fill-[#1ed760] text-black" />
            <span>Verified Artist</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white mt-1 mb-3 tracking-tight">
            {artist.name}
          </h1>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[#b3b3b3] font-medium flex-wrap">
            <span className="text-white font-semibold">{artist.tracks?.length || 0} songs</span>
            <span>•</span>
            <span>{artist.albums?.length || 0} albums</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={handlePlayAll}
          disabled={!artist.tracks || artist.tracks.length === 0}
          className="w-14 h-14 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition disabled:opacity-40"
          title={`Play all songs by ${artist.name}`}
        >
          {isCurrentArtistPlaying && isPlaying ? (
            <Pause size={24} className="fill-black" />
          ) : (
            <Play size={24} className="fill-black ml-1" />
          )}
        </button>
      </div>

      {/* Popular Tracks Section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Popular Songs</h2>
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
            {artist.tracks?.slice(0, 20).map((track, idx) => {
              const isThisTrackPlaying = currentTrack?.id === track.id;
              const isFav = isFavorite(track.id);
              return (
                <div
                  key={track.id}
                  onClick={() => playTrack(track, artist.tracks)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', track);
                    }
                  }}
                  className={`grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-3 rounded-md group transition items-center cursor-pointer ${
                    isThisTrackPlaying ? 'bg-[#242424] text-[#1ed760]' : 'hover:bg-[#1f1f1f] text-white'
                  }`}
                >
                  <span className="text-sm font-medium text-[#b3b3b3] group-hover:hidden">
                    {isThisTrackPlaying && isPlaying ? (
                      <span className="text-[#1ed760]">▶</span>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span className="hidden group-hover:block text-[#1ed760]">
                    <Play size={16} className="fill-current" />
                  </span>

                  <div className="flex items-center gap-3 truncate pr-4">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-[#1f1f1f] shrink-0"
                    />
                    <div className="truncate">
                      <p className={`text-sm font-medium truncate ${isThisTrackPlaying ? 'text-[#1ed760]' : 'text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-[#b3b3b3] truncate md:hidden">
                        {track.album_title}
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

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(track.id);
                      }}
                      className={`p-1.5 transition ${
                        isFav ? 'text-[#1ed760]' : 'opacity-0 group-hover:opacity-100 text-[#b3b3b3] hover:text-white'
                      }`}
                      title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                    >
                      <Heart size={16} className={isFav ? 'fill-[#1ed760]' : ''} />
                    </button>
                    {onAddToPlaylist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToPlaylist(track);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-[#b3b3b3] hover:text-white transition"
                        title="Add to playlist"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>

                  <span className="text-right text-xs font-mono text-[#b3b3b3]">
                    {formatDuration(track.duration_seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Discography / Albums Shelf */}
      {artist.albums && artist.albums.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Discography</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {artist.albums.map((album) => (
              <div
                key={album.id}
                onClick={() => onSelectAlbum(album.id)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'album', { ...album, artist_id: artist.id });
                  }
                }}
                className="group bg-[#1f1f1f] hover:bg-[#282828] p-3 rounded-lg transition duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div className="relative aspect-square mb-3 rounded-md overflow-hidden bg-[#242424] shadow-md">
                  <img
                    src={album.cover_url}
                    alt={album.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-white truncate group-hover:text-[#1ed760] transition">
                    {album.title}
                  </h3>
                  <p className="text-[11px] text-[#b3b3b3] truncate mt-0.5">
                    {album.year ? `Album • ${album.year}` : 'Album'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
