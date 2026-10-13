import React from 'react';
import { Play, Pause } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const AlbumGrid = ({ 
  albums, 
  onSelectAlbum, 
  onSelectArtist, 
  onContextMenu, 
  isLoading 
}) => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const handleQuickPlay = async (e, album) => {
    e.stopPropagation();
    const isThisAlbum = currentTrack && currentTrack.album_id === album.id;
    if (isThisAlbum) {
      togglePlay();
      return;
    }

    try {
      const res = await fetch(`/api/albums/${album.id}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        playTrack(data.tracks[0], data.tracks);
      }
    } catch (err) {
      console.error('Failed to quick play album:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="bg-[#1f1f1f] p-3.5 rounded-lg animate-pulse">
            <div className="aspect-square bg-[#242424] rounded-md mb-3" />
            <div className="h-4 bg-[#242424] rounded w-3/4 mb-2" />
            <div className="h-3 bg-[#242424] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 select-none">
      {albums.map((album) => {
        const isThisAlbum = currentTrack && currentTrack.album_id === album.id;
        const isThisPlaying = isThisAlbum && isPlaying;

        return (
          <div
            key={album.id}
            onClick={() => onSelectAlbum(album.id)}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                onContextMenu(e, 'album', album);
              }
            }}
            className="group bg-[#1f1f1f] hover:bg-[#282828] p-3.5 rounded-lg transition duration-200 cursor-pointer flex flex-col justify-between"
          >
            {/* Cover Container */}
            <div className="relative aspect-square mb-3 rounded-md overflow-hidden bg-[#242424] shadow-md">
              <img
                src={album.cover_url}
                alt={album.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
              {/* Green Play/Pause Button on Hover / Active */}
              <button
                onClick={(e) => handleQuickPlay(e, album)}
                className={`absolute bottom-2.5 right-2.5 w-11 h-11 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition duration-200 z-10 ${
                  isThisAlbum
                    ? 'opacity-100 translate-y-0 ring-2 ring-white/20'
                    : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                }`}
                title={isThisPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
              >
                {isThisPlaying ? (
                  <Pause size={20} className="fill-black" />
                ) : (
                  <Play size={20} className="fill-black ml-0.5" />
                )}
              </button>
            </div>

            {/* Details */}
            <div>
              <h3 className={`font-bold text-xs sm:text-sm truncate transition ${
                isThisAlbum ? 'text-brand-500' : 'text-white'
              }`}>
                {album.title}
              </h3>
              <p className="text-[11px] text-[#b3b3b3] truncate mt-1">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectArtist && album.artist_id) onSelectArtist(album.artist_id);
                  }}
                  className="hover:text-white hover:underline cursor-pointer"
                >
                  {album.artist_name}
                </span>
                {album.year ? ` • ${album.year}` : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
