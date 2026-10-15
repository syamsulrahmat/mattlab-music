import React, { useState, useEffect } from 'react';
import { Search, X, Play, Pause, Disc3, Mic2, Music, Heart, Plus, DownloadCloud, Sparkles } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const SearchView = ({ 
  onSelectAlbum, 
  onSelectArtist, 
  onAddToPlaylist, 
  onContextMenu,
  onRequestMusic,
  query: propQuery, 
  setQuery: propSetQuery,
  refreshTrigger = 0
}) => {
  const [localQuery, setLocalQuery] = useState('');
  const query = propQuery !== undefined ? propQuery : localQuery;
  const setQuery = propSetQuery || setLocalQuery;

  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const { playTrack, currentTrack, isPlaying, togglePlay, isFavorite, toggleFavorite } = usePlayer();

  // Keyboard navigation: Enter or Space to play selected track
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Enter' && selectedTrackId && results?.tracks) {
        const found = results.tracks.find((t) => t.id === selectedTrackId);
        if (found) {
          e.preventDefault();
          playTrack(found, results.tracks);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, results?.tracks, playTrack]);

  const performSearch = (searchVal) => {
    const trimmed = (searchVal || '').trim();
    if (!trimmed) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data) => {
        setResults(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Search error:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, refreshTrigger]);

  // When window regains focus, auto-refresh search results
  useEffect(() => {
    const handleFocus = () => {
      if (query.trim()) {
        performSearch(query);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [query]);

  return (
    <div className="pb-12 max-w-6xl">
      {/* Search Input Box (fallback if not using TopBar) */}
      {propQuery === undefined && (
        <div className="relative max-w-md mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-secondary" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to play?"
            autoFocus
            className="w-full bg-surface-elevated hover:bg-surface-hover focus:bg-surface-hover text-content-primary pl-12 pr-10 py-3 rounded-full text-sm font-medium outline-none border border-transparent focus:border-border-strong transition placeholder:text-content-secondary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-content-secondary hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-content-secondary py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
          Searching your library...
        </div>
      )}

      {/* Empty State */}
      {!query && (
        <div className="text-center py-20 text-content-subtle">
          <Music size={48} className="mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-bold text-content-secondary">Search your music library</h3>
          <p className="text-xs text-content-subtle mt-1">Find tracks, artists, and albums indexed from your Unraid server.</p>
        </div>
      )}

      {/* Results View */}
      {results && (
        <div className="space-y-10">
          {results.corrected_query && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-500/10 border border-brand-500/20 rounded-xl text-xs text-content-primary">
              <Sparkles size={16} className="text-brand-500 shrink-0" />
              <span>
                Showing results for <strong className="text-brand-500 font-bold">{results.corrected_query}</strong>
                {results.query && results.query.toLowerCase() !== results.corrected_query.toLowerCase() && (
                  <span className="text-content-muted ml-1.5">(auto-corrected from "{results.query}")</span>
                )}
              </span>
            </div>
          )}

          {/* Tracks Section */}
          {results.tracks && results.tracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-content-primary mb-4">Songs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.tracks.map((track) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isPlayingThis = isCurrentTrack && isPlaying;
                  const isFav = isFavorite(track.id);
                  return (
                    <div
                      key={track.id}
                      onClick={() => setSelectedTrackId(track.id)}
                      onDoubleClick={() => playTrack(track, results.tracks)}
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
                      className={`flex items-center justify-between p-3 rounded-lg group cursor-pointer active:cursor-grabbing transition select-none ${
                        isCurrentTrack
                          ? 'bg-surface-elevated2 text-brand-500'
                          : selectedTrackId === track.id
                          ? 'bg-surface-hover ring-1 ring-white/20 text-content-primary'
                          : 'hover:bg-surface-elevated text-content-primary'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          className="w-11 h-11 rounded object-cover bg-surface-elevated2 shrink-0"
                        />
                        <div className="truncate">
                          <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-brand-500' : 'text-content-primary'}`}>
                            {track.title}
                          </p>
                          <p className="text-xs text-content-secondary truncate mt-0.5">
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
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-content-secondary hover:text-white transition"
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
                            isFav ? 'text-brand-500' : 'opacity-0 group-hover:opacity-100 text-content-secondary hover:text-white'
                          }`}
                          title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                        >
                          <Heart size={16} className={isFav ? 'fill-brand-500' : ''} />
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
                          className={`p-1.5 text-brand-500 transition ${
                            isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title={isPlayingThis ? 'Pause' : 'Play'}
                        >
                          {isPlayingThis ? (
                            <Pause size={18} className="fill-brand-500" />
                          ) : (
                            <Play size={18} className="fill-brand-500" />
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
                    className="bg-surface-elevated hover:bg-surface-hover p-3.5 rounded-lg cursor-pointer transition group flex flex-col justify-between"
                  >
                    <div>
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        className="w-full aspect-square object-cover rounded-md mb-3 bg-surface-elevated2"
                      />
                      <h4 className="font-semibold text-sm text-content-primary truncate group-hover:text-brand-400 transition">
                        {album.title}
                      </h4>
                    </div>
                    <p className="text-xs text-content-secondary truncate mt-1">
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
              <h2 className="text-xl font-bold text-content-primary mb-4">Artists</h2>
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
                    className="bg-surface-elevated hover:bg-surface-hover p-4 rounded-lg cursor-pointer transition text-center group flex flex-col items-center justify-between"
                  >
                    <img
                      src={artist.image_url || `/api/artists/${artist.id}/image`}
                      alt={artist.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/api/covers/0';
                      }}
                      className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full object-cover mb-3 shadow-lg bg-surface-elevated2 group-hover:scale-105 transition duration-300 border border-border-subtle"
                    />
                    <div className="w-full">
                      <h4 className="font-bold text-sm text-content-primary truncate group-hover:text-brand-400 transition">
                        {artist.name}
                      </h4>
                      <p className="text-xs text-content-secondary mt-1">{artist.track_count} tracks</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.tracks?.length === 0 && results.albums?.length === 0 && results.artists?.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <p className="text-sm text-content-muted">
                {results.corrected_query
                  ? `No local tracks found for "${results.corrected_query}".`
                  : `No local tracks found for "${query}".`}
              </p>
              {onRequestMusic && (
                <div>
                  <button
                    onClick={() => onRequestMusic(results.corrected_query || query)}
                    className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-black font-bold text-xs px-5 py-2.5 rounded-full transition shadow-lg active:scale-95"
                  >
                    <DownloadCloud size={15} />
                    <span>Request "{results.corrected_query || query}" from Torrent / Spotify</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
