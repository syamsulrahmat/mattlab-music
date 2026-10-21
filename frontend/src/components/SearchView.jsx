import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  Play,
  Pause,
  Disc3,
  Mic2,
  Music,
  Heart,
  Plus,
  DownloadCloud,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

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
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const { playTrack, currentTrack, isPlaying, togglePlay, isFavorite, toggleFavorite, showToast } =
    usePlayer();

  const handleQuickDownload = async (track, e) => {
    if (e) e.stopPropagation();
    const trackKey = track.spotify_id || `${track.artist_name}-${track.title}`;
    if (downloadingIds.has(trackKey)) return;

    setDownloadingIds((prev) => new Set(prev).add(trackKey));
    if (showToast) {
      showToast(`⚡ Dispatching 320k download for "${track.title}"...`);
    }

    try {
      const res = await fetch('/api/request/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          album: {
            artist_name: track.artist_name,
            title: track.album_title || track.title,
            source_track: track.title,
            cover_url: track.cover_url,
            force_direct: true,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) {
          showToast(`✅ Queued "${track.title}" via Lidarr/qBittorrent!`);
        }
      } else {
        if (showToast) {
          showToast(`⚠️ ${data.detail || 'Download request failed'}`);
        }
      }
    } catch (err) {
      if (showToast) {
        showToast(`⚠️ Failed to request download: ${err.message}`);
      }
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(trackKey);
        return next;
      });
    }
  };

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
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=15`)
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

  const topResult =
    results?.top_result ||
    (results?.primary_artist ? { type: 'artist', ...results.primary_artist } : null);

  const displayTracks = (results?.tracks || []).filter(
    (t) => !(topResult?.type === 'track' && topResult.id === t.id)
  );

  const trendingTracks = (results?.trending_tracks || []).filter(
    (t) =>
      !(
        topResult?.type === 'track' &&
        (topResult.spotify_id === t.spotify_id || (topResult.id && topResult.id === t.id))
      )
  );

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
          Searching your library & live trends...
        </div>
      )}

      {/* Empty State */}
      {!query && (
        <div className="text-center py-20 text-content-subtle">
          <Music size={48} className="mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-bold text-content-secondary">Search your music library</h3>
          <p className="text-xs text-content-subtle mt-1">Find tracks, artists, and trending music from Spotify.</p>
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

          {/* Top Result / Best Match Card */}
          {topResult && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-content-primary">Top Result</h2>

              {topResult.type === 'track' ? (
                <div
                  onClick={() => {
                    if (topResult.in_library || topResult.id) {
                      playTrack(topResult, results.tracks || [topResult]);
                    }
                  }}
                  className="relative overflow-hidden bg-gradient-to-r from-surface-elevated via-surface-elevated/80 to-surface-panel border border-border-subtle hover:border-brand-500/40 p-5 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-xl group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
                >
                  <div className="flex items-center gap-5 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img
                        src={topResult.cover_url || '/api/covers/0'}
                        alt={topResult.title}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-2xl bg-surface-elevated2 border-2 border-white/10 group-hover:scale-105 group-hover:border-brand-500/50 transition duration-300"
                      />
                      {(topResult.in_library || topResult.id) && (
                        <div className="absolute inset-0 rounded-2xl bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {currentTrack?.id === topResult.id && isPlaying ? (
                            <Pause size={28} className="text-white fill-white" />
                          ) : (
                            <Play size={28} className="text-white fill-white ml-0.5" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20">
                          Song
                        </span>
                        {topResult.is_trending && (
                          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                            <TrendingUp size={12} />
                            <span>Trending Global Hit</span>
                          </span>
                        )}
                        {topResult.in_library ? (
                          <span className="text-[11px] font-semibold text-white/70 bg-white/10 px-2.5 py-0.5 rounded-full">
                            In Library
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                            Available in 320k MP3
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white truncate group-hover:text-brand-400 transition">
                        {topResult.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-content-secondary mt-1 truncate">
                        <span className="font-semibold text-white/90">{topResult.artist_name}</span>
                        {topResult.album_title ? ` • ${topResult.album_title}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    {topResult.in_library || topResult.id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentTrack?.id === topResult.id) {
                            togglePlay();
                          } else {
                            playTrack(topResult, results.tracks || [topResult]);
                          }
                        }}
                        className="w-12 h-12 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-lg transition active:scale-95 group-hover:scale-105"
                        title="Play Track"
                      >
                        {currentTrack?.id === topResult.id && isPlaying ? (
                          <Pause size={22} className="fill-black" />
                        ) : (
                          <Play size={22} className="fill-black ml-0.5" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleQuickDownload(topResult, e)}
                        disabled={downloadingIds.has(
                          topResult.spotify_id || `${topResult.artist_name}-${topResult.title}`
                        )}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black text-xs font-bold rounded-full transition duration-200 shadow-lg active:scale-95"
                      >
                        {downloadingIds.has(
                          topResult.spotify_id || `${topResult.artist_name}-${topResult.title}`
                        ) ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Dispatching Download...</span>
                          </>
                        ) : (
                          <>
                            <DownloadCloud size={15} />
                            <span>Download Song (320k)</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => onSelectArtist && onSelectArtist(topResult.id)}
                  className="relative overflow-hidden bg-gradient-to-r from-surface-elevated via-surface-elevated/80 to-surface-panel border border-border-subtle hover:border-brand-500/40 p-5 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-xl group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
                >
                  <div className="flex items-center gap-5 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img
                        src={topResult.image_url || `/api/artists/${topResult.id}/image`}
                        alt={topResult.name}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/api/covers/0';
                        }}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover shadow-2xl bg-surface-elevated2 border-2 border-white/10 group-hover:scale-105 group-hover:border-brand-500/50 transition duration-300"
                      />
                      <div className="absolute inset-0 rounded-full bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={24} className="text-white fill-white ml-0.5" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full mb-1 border border-brand-500/20">
                        Artist
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white truncate group-hover:text-brand-400 transition">
                        {topResult.name}
                      </h2>
                      <p className="text-xs sm:text-sm text-content-secondary mt-1 flex items-center gap-2">
                        <span>{topResult.track_count || results.tracks?.length || 0} songs</span>
                        <span>•</span>
                        <span>{topResult.album_count || results.albums?.length || 0} albums</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectArtist) onSelectArtist(topResult.id);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-brand-500 hover:text-black text-white text-xs font-bold rounded-full transition duration-200 group/btn shadow-md"
                    >
                      <span>View Artist</span>
                      <ChevronRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trending Global Hits Section */}
          {trendingTracks.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
                  <TrendingUp size={20} className="text-emerald-400" />
                  <span>Trending Global Hits</span>
                </h2>
                <span className="text-xs text-content-secondary">Spotify Chart Trends</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {trendingTracks.map((track, idx) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isPlayingThis = isCurrentTrack && isPlaying;
                  const isDownloading = downloadingIds.has(
                    track.spotify_id || `${track.artist_name}-${track.title}`
                  );
                  return (
                    <div
                      key={track.spotify_id || `${track.title}-${idx}`}
                      onClick={() => {
                        if (track.in_library) {
                          playTrack(track, results.tracks || [track]);
                        } else {
                          handleQuickDownload(track);
                        }
                      }}
                      className="flex items-center justify-between p-3 rounded-lg group cursor-pointer bg-surface-elevated hover:bg-surface-hover transition select-none"
                    >
                      <div className="flex items-center gap-3 truncate min-w-0 flex-1 mr-3">
                        <img
                          src={track.cover_url || '/api/covers/0'}
                          alt={track.title}
                          className="w-11 h-11 rounded object-cover bg-surface-elevated2 shrink-0 shadow-sm"
                        />
                        <div className="truncate min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate text-content-primary group-hover:text-brand-400 transition">
                              {track.title}
                            </p>
                            {track.in_library && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 shrink-0">
                                In Library
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-content-secondary truncate mt-0.5">
                            {track.artist_name} {track.album_title ? `• ${track.album_title}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {track.in_library ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isCurrentTrack) {
                                togglePlay();
                              } else {
                                playTrack(track, results.tracks || [track]);
                              }
                            }}
                            className="p-1.5 text-brand-500 hover:scale-110 transition"
                            title={isPlayingThis ? 'Pause' : 'Play'}
                          >
                            {isPlayingThis ? (
                              <Pause size={18} className="fill-brand-500" />
                            ) : (
                              <Play size={18} className="fill-brand-500" />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleQuickDownload(track, e)}
                            disabled={isDownloading}
                            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-brand-500 hover:text-black text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                            title="Download 320k via Lidarr"
                          >
                            {isDownloading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <DownloadCloud size={13} />
                            )}
                            <span>Download (320k)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tracks in Library Section */}
          {displayTracks && displayTracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-content-primary mb-4">
                {topResult?.type === 'artist' ? `Songs by ${topResult.name}` : 'Songs in Library'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {displayTracks.map((track) => {
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
                      <div className="flex items-center gap-3 truncate min-w-0 flex-1 mr-3">
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          className="w-11 h-11 rounded object-cover bg-surface-elevated2 shrink-0"
                        />
                        <div className="truncate min-w-0 flex-1">
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
              <h2 className="text-xl font-bold text-white mb-4">
                {topResult?.type === 'artist' ? `Albums by ${topResult.name}` : 'Albums'}
              </h2>
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
          {results.artists && results.artists.filter((a) => !topResult || (topResult.type === 'artist' && a.id !== topResult.id)).length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-content-primary mb-4">
                {topResult?.type === 'artist' ? 'Other Artists' : 'Artists'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.artists
                  .filter((a) => !topResult || (topResult.type === 'artist' && a.id !== topResult.id))
                  .map((artist) => (
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

          {results.tracks?.length === 0 && (!results.trending_tracks || results.trending_tracks.length === 0) && results.albums?.length === 0 && results.artists?.length === 0 && (
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
