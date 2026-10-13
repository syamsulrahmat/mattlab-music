import React, { useEffect, useState } from 'react';
import { Mic2 } from 'lucide-react';

export const ArtistsView = ({ onSelectArtist, onContextMenu }) => {
  const [artists, setArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/artists?limit=150')
      .then((res) => res.json())
      .then((data) => {
        setArtists(data.items || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load artists:', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="bg-[#1f1f1f] p-4 rounded-lg animate-pulse text-center">
            <div className="w-24 h-24 mx-auto rounded-full bg-[#242424] mb-3" />
            <div className="h-4 bg-[#242424] rounded w-3/4 mx-auto" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-12 select-none">
      {artists.map((artist) => (
        <div
          key={artist.id}
          onClick={() => onSelectArtist && onSelectArtist(artist.id)}
          onContextMenu={(e) => {
            if (onContextMenu) {
              e.preventDefault();
              onContextMenu(e, 'artist', artist);
            }
          }}
          className="bg-[#1f1f1f] hover:bg-[#282828] p-4 rounded-lg cursor-pointer transition text-center group flex flex-col items-center justify-between"
        >
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-[#242424] group-hover:scale-105 transition duration-300 flex items-center justify-center mb-4 shadow-lg border border-white/5">
            <img
              src={artist.image_url || `/api/artists/${artist.id}/image`}
              alt={artist.name}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/api/covers/0';
              }}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="w-full">
            <h3 className="font-bold text-sm text-white truncate group-hover:text-brand-400 transition">
              {artist.name}
            </h3>
            <p className="text-xs text-[#b3b3b3] mt-1">
              Artist • {artist.album_count} {artist.album_count === 1 ? 'album' : 'albums'} • {artist.track_count} songs
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
