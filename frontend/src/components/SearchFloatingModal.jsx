import React, { useEffect } from 'react';
import { Play, Pause, Mic2, DownloadCloud, Sparkles } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const SearchFloatingModal = ({
  isOpen,
  onClose,
  query,
  results,
  isLoading,
  selectedIndex,
  setSelectedIndex,
  onSelectTrack,
  onSelectAlbum,
  onSelectArtist,
  onRequestMusic,
  onContextMenu,
}) => {
  const { currentTrack, isPlaying, togglePlay } = usePlayer();

  // Auto-scroll selected element into view when selectedIndex changes
  useEffect(() => {
    if (isOpen && selectedIndex >= 0) {
      const el = document.getElementById(`search-float-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const tracks = results?.tracks || [];
  const albums = results?.albums || [];
  const artists = results?.artists || [];
  const totalResults = tracks.length + albums.length + artists.length;

  return (
    <>
      {/* Soft Backdrop to close on click outside without switching active screen */}
      <div
        className="fixed inset-0 top-16 bg-black/50 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Floating Results Card Dropdown: matching search bar width 1:1 */}
      <div
        className="absolute top-full left-0 right-0 w-full mt-2 max-h-[72vh] bg-[#181818]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-150 select-none text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Results Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-[#888] gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
              <span className="text-xs">Searching library...</span>
            </div>
          )}

          {/* Corrected Query Banner */}
          {results?.correctedQuery && (
            <div className="flex items-center gap-2 px-3 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl text-xs text-white">
              <Sparkles size={14} className="text-brand-500 shrink-0" />
              <span>
                Showing results for <strong className="text-brand-500 font-bold">{results.correctedQuery}</strong>
              </span>
            </div>
          )}

          {/* Empty Search Results State */}
          {!isLoading && query && totalResults === 0 && (
            <div className="py-8 text-center text-[#888]">
              <p className="text-sm">No results in your library for "{query}"</p>
              <button
                id="search-float-item-0"
                onMouseEnter={() => setSelectedIndex(0)}
                onClick={() => onRequestMusic(query)}
                className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition shadow-lg active:scale-95 ${
                  selectedIndex === 0
                    ? 'bg-brand-400 text-black ring-2 ring-white/30 scale-105'
                    : 'bg-brand-500 text-black hover:bg-brand-400'
                }`}
              >
                <DownloadCloud size={14} />
                <span>Request & Download "{query}" from Torrent/Spotify</span>
              </button>
            </div>
          )}

          {/* Songs / Tracks Section */}
          {tracks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Songs
              </p>
              <div className="space-y-1">
                {tracks.map((track, idx) => {
                  const itemIndex = idx;
                  const isSelected = selectedIndex === itemIndex;
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrentTrack && isPlaying;
                  return (
                    <div
                      id={`search-float-item-${itemIndex}`}
                      key={track.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => onSelectTrack(track)}
                      onContextMenu={(e) => onContextMenu && onContextMenu(e, 'track', track)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                        {/* Spotify-style Cover Artwork with Play/Pause overlay */}
                        <div className="relative w-10 h-10 rounded overflow-hidden bg-[#222] shrink-0 shadow-sm">
                          <img
                            src={track.cover_url || '/api/covers/0'}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div
                            className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${
                              isThisPlaying
                                ? 'opacity-100'
                                : isSelected
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isThisPlaying ? (
                              <Pause size={16} className="text-white fill-white" />
                            ) : (
                              <Play size={16} className="text-white fill-white ml-0.5" />
                            )}
                          </div>
                        </div>

                        <div className="truncate flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate transition ${
                              isThisPlaying
                                ? 'text-brand-400 font-bold'
                                : isSelected
                                ? 'text-brand-400'
                                : 'text-white group-hover:text-brand-400'
                            }`}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                            {track.artist_name} • {track.album_title}
                          </p>
                        </div>
                      </div>

                      {/* Track Duration on right */}
                      {track.duration > 0 && (
                        <span className="text-xs text-[#888] group-hover:text-white shrink-0 ml-3 font-mono">
                          {formatDuration(track.duration)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Albums Section */}
          {albums.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Albums
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {albums.map((album, idx) => {
                  const itemIndex = tracks.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      id={`search-float-item-${itemIndex}`}
                      key={album.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => onSelectAlbum(album.id)}
                      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <img
                        src={album.cover_url || `/api/covers/${album.id}`}
                        alt=""
                        className="w-10 h-10 rounded object-cover bg-[#222] shrink-0"
                      />
                      <div className="truncate flex-1 min-w-0">
                        <p
                          className={`text-xs font-bold truncate transition ${
                            isSelected ? 'text-brand-400' : 'text-white group-hover:text-brand-400'
                          }`}
                        >
                          {album.title}
                        </p>
                        <p className="text-[11px] text-[#b3b3b3] truncate">
                          {album.artist_name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Artists Section */}
          {artists.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-[#888] px-3 mb-1.5 tracking-wider">
                Artists
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {artists.map((artist, idx) => {
                  const itemIndex = tracks.length + albums.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      id={`search-float-item-${itemIndex}`}
                      key={artist.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => onSelectArtist(artist.id)}
                      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#242424] flex items-center justify-center text-brand-500 shrink-0">
                        <Mic2 size={18} />
                      </div>
                      <div className="truncate flex-1 min-w-0">
                        <p
                          className={`text-xs font-bold truncate transition ${
                            isSelected ? 'text-brand-400' : 'text-white group-hover:text-brand-400'
                          }`}
                        >
                          {artist.name}
                        </p>
                        <p className="text-[11px] text-[#b3b3b3]">Artist</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Request Button at Bottom */}
          {query?.trim().length > 0 && (
            <div className="pt-2 border-t border-white/5">
              {(() => {
                const requestIndex = tracks.length + albums.length + artists.length;
                const isSelected = selectedIndex === requestIndex;
                return (
                  <button
                    id={`search-float-item-${requestIndex}`}
                    onMouseEnter={() => setSelectedIndex(requestIndex)}
                    onClick={() => onRequestMusic(results?.correctedQuery || query)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition text-left group ${
                      isSelected
                        ? 'bg-brand-500/20 ring-1 ring-brand-500/40 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <DownloadCloud size={18} className="text-brand-500" />
                      <div>
                        <p className="text-xs font-bold text-white group-hover:text-brand-400 transition">
                          Request "{results?.correctedQuery || query}" via Torrent / Spotify
                          {results?.correctedQuery && (
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
                );
              })()}
            </div>
          )}
        </div>

        {/* Keyboard Navigation Footer Hints */}
        <div className="px-3.5 py-2 bg-[#121212] border-t border-white/5 flex items-center justify-between text-[11px] text-[#777]">
          <div className="flex items-center gap-2">
            <span>
              <kbd className="bg-white/10 px-1 py-0.5 rounded text-white/80 font-mono text-[10px]">↑</kbd>{' '}
              <kbd className="bg-white/10 px-1 py-0.5 rounded text-white/80 font-mono text-[10px]">↓</kbd> Navigate
            </span>
            <span>•</span>
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">Enter</kbd> Select
            </span>
            <span>•</span>
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">Esc</kbd> Close
            </span>
          </div>
          <span className="text-[#555] hidden sm:inline">MattLab Search</span>
        </div>
      </div>
    </>
  );
};
