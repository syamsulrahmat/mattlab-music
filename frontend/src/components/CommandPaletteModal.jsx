import React, { useState, useEffect, useRef } from 'react';
import { Search, Play, Pause, Disc3, Mic2, DownloadCloud, X, Music, Sparkles } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const CommandPaletteModal = ({
  isOpen,
  onClose,
  onSelectAlbum,
  onSelectArtist,
  onRequestMusic,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tracks: [], albums: [], artists: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({ tracks: [], albums: [], artists: [] });
      setSelectedIndex(0);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle global Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Live search debounced
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (!q) {
      setResults({ tracks: [], albums: [], artists: [] });
      setIsLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          setResults({
            tracks: Array.isArray(data.tracks) ? data.tracks.slice(0, 5) : [],
            albums: Array.isArray(data.albums) ? data.albums.slice(0, 4) : [],
            artists: Array.isArray(data.artists) ? data.artists.slice(0, 4) : [],
            correctedQuery: data.corrected_query || null,
          });
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const totalResults =
    (results.tracks?.length || 0) +
    (results.albums?.length || 0) +
    (results.artists?.length || 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-[#1f1f1f]">
          <Search size={20} className="text-brand-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, albums, artists, or type to request..."
            className="flex-1 bg-transparent text-white placeholder-[#888] text-base font-medium outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                if (inputRef.current) inputRef.current.focus();
              }}
              className="text-[#888] hover:text-white p-1"
            >
              <X size={16} />
            </button>
          )}
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold text-[#777] bg-black/40 px-2 py-0.5 rounded border border-white/5">
            ESC to close
          </span>
        </div>

        {/* Search Results Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-[#888] gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
              <span className="text-xs">Searching library...</span>
            </div>
          )}

          {!isLoading && query && totalResults === 0 && (
            <div className="py-8 text-center text-[#888]">
              <p className="text-sm">No results in your library for "{query}"</p>
              <button
                onClick={() => {
                  onClose();
                  if (onRequestMusic) onRequestMusic(query);
                }}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500 text-black font-bold text-xs hover:bg-brand-400 transition shadow-lg active:scale-95"
              >
                <DownloadCloud size={14} />
                <span>Request & Download "{query}" from Torrent/Spotify</span>
              </button>
            </div>
          )}

          {!query && (
            <div className="py-8 px-4 text-center text-[#777]">
              <Sparkles size={28} className="mx-auto mb-2 text-[#555]" />
              <p className="text-xs font-medium">Quick search your library or request new songs.</p>
              <p className="text-[11px] text-[#555] mt-1">Press <kbd className="bg-white/10 px-1 rounded text-white/70">Ctrl+K</kbd> anytime to open.</p>
            </div>
          )}

          {/* Tracks Section */}
          {results.tracks?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Tracks
              </p>
              <div className="space-y-1">
                {results.tracks.map((track) => {
                  const isThisPlaying = currentTrack?.id === track.id && isPlaying;
                  return (
                    <div
                      key={track.id}
                      onClick={() => {
                        playTrack(track);
                        onClose();
                      }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer group transition"
                    >
                      <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                        <img
                          src={track.cover_url || '/api/covers/0'}
                          alt=""
                          className="w-10 h-10 rounded object-cover bg-[#222] shrink-0"
                        />
                        <div className="truncate flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white group-hover:text-brand-400 truncate transition">
                            {track.title}
                          </p>
                          <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                            {track.artist_name} • {track.album_title}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentTrack?.id === track.id) {
                            togglePlay();
                          } else {
                            playTrack(track);
                          }
                          onClose();
                        }}
                        className="w-8 h-8 rounded-full bg-brand-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow hover:scale-105 active:scale-95 ml-2"
                        title={isThisPlaying ? 'Pause' : 'Play'}
                      >
                        {isThisPlaying ? (
                          <Pause size={14} className="fill-black" />
                        ) : (
                          <Play size={14} className="fill-black ml-0.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Albums Section */}
          {results.albums?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Albums
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {results.albums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => {
                      if (onSelectAlbum) onSelectAlbum(album.id);
                      onClose();
                    }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 cursor-pointer group transition"
                  >
                    <img
                      src={album.cover_url || `/api/covers/${album.id}`}
                      alt=""
                      className="w-10 h-10 rounded object-cover bg-[#222] shrink-0"
                    />
                    <div className="truncate flex-1 min-w-0">
                      <p className="text-xs font-bold text-white group-hover:text-brand-400 truncate">
                        {album.title}
                      </p>
                      <p className="text-[11px] text-[#b3b3b3] truncate">
                        {album.artist_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artists Section */}
          {results.artists?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Artists
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {results.artists.map((artist) => (
                  <div
                    key={artist.id}
                    onClick={() => {
                      if (onSelectArtist) onSelectArtist(artist.id);
                      onClose();
                    }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 cursor-pointer group transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#242424] flex items-center justify-center text-brand-500 shrink-0">
                      <Mic2 size={18} />
                    </div>
                    <div className="truncate flex-1 min-w-0">
                      <p className="text-xs font-bold text-white group-hover:text-brand-400 truncate">
                        {artist.name}
                      </p>
                      <p className="text-[11px] text-[#b3b3b3]">Artist</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Request Button at the bottom if user typed query */}
          {query.trim().length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <button
                onClick={() => {
                  onClose();
                  if (onRequestMusic) onRequestMusic(results.correctedQuery || query);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <DownloadCloud size={18} className="text-brand-500" />
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-brand-400 transition">
                      Request "{results.correctedQuery || query}" via Torrent / Spotify
                      {results.correctedQuery && (
                        <span className="text-brand-500 text-[10px] ml-1.5 font-normal">(corrected)</span>
                      )}
                    </p>
                    <p className="text-[10px] text-[#888]">
                      Search Lidarr & torrent indexers to download
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[#888] group-hover:text-white">→</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
