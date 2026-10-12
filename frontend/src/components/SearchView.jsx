import React, { useState, useEffect } from 'react';
import { Search, X, Play, Pause, Disc3, Mic2, Music, Heart, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const SearchView = ({ 
  onSelectAlbum, 
  onSelectArtist, 
  onAddToPlaylist, 
  onContextMenu,
  query: propQuery, 
  setQuery: propSetQuery 
}) => {
  const [localQuery, setLocalQuery] = useState('');
  const query = propQuery !== undefined ? propQuery : localQuery;
  const setQuery = propSetQuery || setLocalQuery;

  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { playTrack, currentTrack, isPlaying, togglePlay, isFavorite, toggleFavorite } = usePlayer();

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Search error:', err);
          setIsLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="pb-12 max-w-6xl">
      {/* Search Input Box (fallback if not using TopBar) */}
      {propQuery === undefined && (
        <div className="relative max-w-md mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b3b3b3]" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to play?"
            autoFocus
            className="w-full bg-[#1f1f1f] hover:bg-[#282828] focus:bg-[#282828] text-white pl-12 pr-10 py-3 rounded-full text-sm font-medium outline-none border border-transparent focus:border-white/20 transition placeholder-[#b3b3b3]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b3b3b3] hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-[#b3b3b3] py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#1ed760] border-t-transparent" />
          Searching your library...
        </div>
      )}

      {/* Empty State */}
      {!query && (
        <div className="text-center py-20 text-[#666]">
          <Music size={48} className="mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-bold text-[#999]">Search your music library</h3>
          <p className="text-xs text-[#666] mt-1">Find tracks, artists, and albums indexed from your Unraid server.</p>
        </div>
      )}

      {/* Results View */}
      {results && (
        <div className="space-y-10">
          {/* Tracks Section */}
          {results.tracks && results.tracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Songs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.tracks.map((track) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isPlayingThis = isCurrentTrack && isPlaying;
                  const isFav = isFavorite(track.id);
                  return (
                    <div
                      key={track.id}
                      onClick={() => {
                        if (isCurrentTrack) {
                          togglePlay();
                        } else {
                          playTrack(track, results.tracks);
                        }
                      }}
                      onContextMenu={(e) => {
                        if (onContextMenu) {
                          e.preventDefault();
                          onContextMenu(e, 'track', track);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg group cursor-pointer transition select-none ${
                        isCurrentTrack ? 'bg-[#242424] text-[#1ed760]' : 'hover:bg-[#1f1f1f] text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          className="w-11 h-11 rounded object-cover bg-[#222] shrink-0"
                        />
                        <div className="truncate">
                          <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-[#1ed760]' : 'text-white'}`}>
                            {track.title}
                          </p>
                          <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectArtist) onSelectArtist(track.artist_id);
                              }}
                              className="hover:text-white hover:underline cursor-pointer"
                            >
                              {track.artist_name}
                            </span>
                            {' • '}
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectAlbum) onSelectAlbum(track.album_id);
                              }}
                              className="hover:text-white hover:underline cursor-pointer"
                            >
                              {track.album_title}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
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
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCurrentTrack) {
                              togglePlay();
                            } else {
                              playTrack(track, results.tracks);
                            }
                          }}
                          className={`p-1.5 text-[#1ed760] transition ${
                            isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title={isPlayingThis ? 'Pause' : 'Play'}
                        >
                          {isPlayingThis ? (
                            <Pause size={18} className="fill-[#1ed760]" />
                          ) : (
                            <Play size={18} className="fill-[#1ed760]" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Albums Section */}
          {results.albums && results.albums.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.albums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => onSelectAlbum && onSelectAlbum(album.id)}
                    onContextMenu={(e) => {
                      if (onContextMenu) {
                        e.preventDefault();
                        onContextMenu(e, 'album', album);
                      }
                    }}
                    className="bg-[#1f1f1f] hover:bg-[#282828] p-3.5 rounded-lg cursor-pointer transition group flex flex-col justify-between"
                  >
                    <div>
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        className="w-full aspect-square object-cover rounded-md mb-3 bg-[#222]"
                      />
                      <h4 className="font-semibold text-sm text-white truncate group-hover:text-[#1ed760] transition">
                        {album.title}
                      </h4>
                    </div>
                    <p className="text-xs text-[#b3b3b3] truncate mt-1">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectArtist) onSelectArtist(album.artist_id);
                        }}
                        className="hover:text-white hover:underline cursor-pointer"
                      >
                        {album.artist_name}
                      </span>
                      {album.year ? ` • ${album.year}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Artists Section */}
          {results.artists && results.artists.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.artists.map((artist) => (
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
                    <img
                      src={artist.image_url || `/api/artists/${artist.id}/image`}
                      alt={artist.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/api/covers/0';
                      }}
                      className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full object-cover mb-3 shadow-lg bg-[#242424] group-hover:scale-105 transition duration-300 border border-white/5"
                    />
                    <div className="w-full">
                      <h4 className="font-bold text-sm text-white truncate group-hover:text-[#1ed760] transition">
                        {artist.name}
                      </h4>
                      <p className="text-xs text-[#b3b3b3] mt-1">{artist.track_count} tracks</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.tracks?.length === 0 && results.albums?.length === 0 && results.artists?.length === 0 && (
            <div className="text-center py-16 text-[#888]">
              No results found for "{query}".
            </div>
          )}
        </div>
      )}
    </div>
  );
};
