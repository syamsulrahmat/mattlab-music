import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Play,
  Pause,
  Disc3,
  Mic2,
  DownloadCloud,
  X,
  Music,
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

export const CommandPaletteModal = ({
  isOpen,
  onClose,
  onSelectAlbum,
  onSelectArtist,
  onRequestMusic,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({
    tracks: [],
    albums: [],
    artists: [],
    trending_tracks: [],
    top_result: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const { currentTrack, isPlaying, playTrack, togglePlay, showToast } = usePlayer();

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

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({
        tracks: [],
        albums: [],
        artists: [],
        trending_tracks: [],
        top_result: null,
      });
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
    const q = query.trim();
    if (!q) {
      setResults({
        tracks: [],
        albums: [],
        artists: [],
        trending_tracks: [],
        top_result: null,
      });
      setIsLoading(false);
      setSelectedIndex(0);
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
            top_result: data.top_result || null,
            trending_tracks: Array.isArray(data.trending_tracks) ? data.trending_tracks : [],
            tracks: Array.isArray(data.tracks) ? data.tracks.slice(0, 5) : [],
            albums: Array.isArray(data.albums) ? data.albums.slice(0, 4) : [],
            artists: Array.isArray(data.artists) ? data.artists.slice(0, 4) : [],
            primary_artist: data.primary_artist || null,
            match_type: data.match_type || 'general',
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

  const topResult =
    results.top_result ||
    (results.primary_artist ? { type: 'artist', ...results.primary_artist } : null);
  const hasTopResult = Boolean(topResult);
  const topResultOffset = hasTopResult ? 1 : 0;

  const rawTracks = results.tracks || [];
  const tracks = rawTracks.filter(
    (t) => !(topResult?.type === 'track' && topResult.id === t.id)
  );

  const rawTrending = results.trending_tracks || [];
  const trendingTracks = rawTrending
    .slice(0, 4)
    .filter(
      (t) =>
        !(
          topResult?.type === 'track' &&
          (topResult.spotify_id === t.spotify_id || (topResult.id && topResult.id === t.id))
        )
    );

  const albums = results.albums || [];
  const topArtistId = topResult?.type === 'artist' ? topResult.id : results.primary_artist?.id;
  const otherArtists = (results.artists || []).filter(
    (a) => !topArtistId || a.id !== topArtistId
  );

  // Flat linear list of navigable items for Up/Down selection
  const navigableItems = useMemo(() => {
    const items = [];
    if (topResult) {
      if (topResult.type === 'track') {
        items.push({ type: 'top_track', data: topResult });
      } else if (topResult.type === 'artist') {
        items.push({ type: 'artist', data: topResult });
      }
    }
    tracks.forEach((track) => items.push({ type: 'track', data: track }));
    trendingTracks.forEach((trend) => items.push({ type: 'trending_track', data: trend }));
    albums.forEach((album) => items.push({ type: 'album', data: album }));
    otherArtists.forEach((artist) => items.push({ type: 'artist', data: artist }));
    if (query.trim().length > 0) {
      items.push({
        type: 'request',
        query: results.correctedQuery || query.trim(),
      });
    }
    return items;
  }, [topResult, tracks, trendingTracks, albums, otherArtists, query, results.correctedQuery]);

  // Auto-scroll selected element into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`cp-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const executeItem = (item) => {
    if (!item) return;
    if (item.type === 'top_track' || item.type === 'track' || item.type === 'trending_track') {
      const track = item.data;
      if (track.in_library || track.id) {
        if (currentTrack?.id === track.id) {
          togglePlay();
        } else {
          playTrack(track, results.tracks || [track]);
        }
      } else {
        handleQuickDownload(track);
      }
    } else if (item.type === 'album') {
      if (onSelectAlbum) onSelectAlbum(item.data.id);
      onClose();
    } else if (item.type === 'artist') {
      if (onSelectArtist) onSelectArtist(item.data.id);
      onClose();
    } else if (item.type === 'request') {
      if (onRequestMusic) onRequestMusic(item.query);
      onClose();
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (navigableItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < navigableItems.length) {
        executeItem(navigableItems[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  const totalResults =
    topResultOffset + tracks.length + trendingTracks.length + albums.length + otherArtists.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-panel border border-border-medium rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-medium bg-surface-elevated">
          <Search size={20} className="text-brand-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search tracks, trends, albums, artists, or type to request..."
            className="flex-1 bg-transparent text-content-primary placeholder:text-content-muted text-base font-medium outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                if (inputRef.current) inputRef.current.focus();
              }}
              className="text-content-muted hover:text-white p-1"
            >
              <X size={16} />
            </button>
          )}
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold text-content-subtle bg-black/40 px-2 py-0.5 rounded border border-border-subtle">
            ESC to close
          </span>
        </div>

        {/* Search Results Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-content-muted gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
              <span className="text-xs">Searching library & live trends...</span>
            </div>
          )}

          {!isLoading && query && totalResults === 0 && (
            <div className="py-8 text-center text-content-muted">
              <p className="text-sm">No results in your library for "{query}"</p>
              <button
                id="cp-item-0"
                onMouseEnter={() => setSelectedIndex(0)}
                onClick={() => {
                  onClose();
                  if (onRequestMusic) onRequestMusic(query);
                }}
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

          {!query && (
            <div className="py-8 px-4 text-center text-content-subtle">
              <Sparkles size={28} className="mx-auto mb-2 text-content-subtle" />
              <p className="text-xs font-medium">Quick search your library or discover trending music.</p>
              <p className="text-[11px] text-content-subtle mt-1">
                Press <kbd className="bg-white/10 px-1 rounded text-white/70">Ctrl+K</kbd> anytime to open.
              </p>
            </div>
          )}

          {/* Top Result / Best Match Section */}
          {topResult && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                Top Result
              </p>

              {topResult.type === 'track' ? (
                <div
                  id="cp-item-0"
                  onMouseEnter={() => setSelectedIndex(0)}
                  onClick={() => {
                    if (topResult.in_library || topResult.id) {
                      playTrack(topResult, results.tracks || [topResult]);
                    } else {
                      handleQuickDownload(topResult);
                    }
                  }}
                  className={`p-3.5 rounded-2xl cursor-pointer group transition border ${
                    selectedIndex === 0
                      ? 'bg-white/15 ring-1 ring-brand-500/50 border-brand-500/40 shadow-lg'
                      : 'bg-surface-elevated hover:bg-white/10 border-border-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-surface-elevated2 shadow-md shrink-0 border border-white/10">
                        <img
                          src={topResult.cover_url || '/api/covers/0'}
                          alt={topResult.title}
                          className="w-full h-full object-cover"
                        />
                        {(topResult.in_library || topResult.id) && (
                          <div
                            className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${
                              currentTrack?.id === topResult.id && isPlaying
                                ? 'opacity-100'
                                : selectedIndex === 0
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {currentTrack?.id === topResult.id && isPlaying ? (
                              <Pause size={18} className="text-white fill-white" />
                            ) : (
                              <Play size={18} className="text-white fill-white ml-0.5" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                            Song
                          </span>
                          {topResult.is_trending && (
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                              <TrendingUp size={10} />
                              <span>Trending</span>
                            </span>
                          )}
                          {topResult.in_library ? (
                            <span className="text-[10px] font-semibold text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                              In Library
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              320k Available
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-white truncate group-hover:text-brand-400 transition">
                          {topResult.title}
                        </p>
                        <p className="text-xs text-content-secondary truncate mt-0.5">
                          {topResult.artist_name} {topResult.album_title ? `• ${topResult.album_title}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {topResult.in_library || topResult.id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playTrack(topResult, results.tracks || [topResult]);
                          }}
                          className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-lg transition active:scale-95 group-hover:scale-105"
                          title="Play Track"
                        >
                          {currentTrack?.id === topResult.id && isPlaying ? (
                            <Pause size={18} className="fill-black" />
                          ) : (
                            <Play size={18} className="fill-black ml-0.5" />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleQuickDownload(topResult, e)}
                          disabled={downloadingIds.has(
                            topResult.spotify_id || `${topResult.artist_name}-${topResult.title}`
                          )}
                          className="px-3.5 py-1.5 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-bold text-xs flex items-center gap-1.5 shadow-md transition active:scale-95"
                          title="Download 320k MP3"
                        >
                          {downloadingIds.has(
                            topResult.spotify_id || `${topResult.artist_name}-${topResult.title}`
                          ) ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Queuing...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud size={13} />
                              <span>Download</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  id="cp-item-0"
                  onMouseEnter={() => setSelectedIndex(0)}
                  onClick={() => {
                    if (onSelectArtist) onSelectArtist(topResult.id);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer group transition border ${
                    selectedIndex === 0
                      ? 'bg-white/15 ring-1 ring-brand-500/40 border-brand-500/40'
                      : 'bg-surface-elevated hover:bg-white/10 border-border-subtle'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={topResult.image_url || `/api/artists/${topResult.id}/image`}
                      alt=""
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/api/covers/0';
                      }}
                      className="w-12 h-12 rounded-full object-cover bg-surface-elevated2 shadow-md shrink-0 border border-white/10"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                        Artist
                      </span>
                      <p className="text-sm font-bold text-white truncate mt-0.5 group-hover:text-brand-400 transition">
                        {topResult.name}
                      </p>
                      <p className="text-[11px] text-content-secondary truncate">
                        {topResult.track_count || 0} songs • {topResult.album_count || 0} albums
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center text-content-muted group-hover:text-brand-400 text-xs font-semibold gap-1">
                    <span>View</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tracks Section */}
          {tracks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                {topResult?.type === 'artist' ? `Songs by ${topResult.name}` : 'Tracks in Library'}
              </p>
              <div className="space-y-1">
                {tracks.map((track, idx) => {
                  const itemIndex = topResultOffset + idx;
                  const isSelected = selectedIndex === itemIndex;
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrentTrack && isPlaying;
                  return (
                    <div
                      id={`cp-item-${itemIndex}`}
                      key={track.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => {
                        if (currentTrack?.id === track.id) {
                          togglePlay();
                        } else {
                          playTrack(track, results.tracks);
                        }
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                        <div className="relative w-10 h-10 rounded overflow-hidden bg-surface-elevated2 shrink-0 shadow-sm">
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
                          <p className="text-xs text-content-secondary truncate mt-0.5">
                            {track.artist_name} • {track.album_title}
                          </p>
                        </div>
                      </div>

                      {track.duration > 0 && (
                        <span className="text-xs text-content-muted group-hover:text-white shrink-0 ml-3 font-mono">
                          {formatDuration(track.duration)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trending Global Hits Section */}
          {trendingTracks.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 mb-1.5">
                <p className="text-[11px] font-bold uppercase text-content-muted tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-emerald-400" />
                  <span>Trending Global Hits</span>
                </p>
                <span className="text-[10px] text-content-subtle">Spotify Live Charts</span>
              </div>
              <div className="space-y-1">
                {trendingTracks.map((track, idx) => {
                  const itemIndex = topResultOffset + tracks.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  const isCurrent = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrent && isPlaying;
                  const isDownloading = downloadingIds.has(
                    track.spotify_id || `${track.artist_name}-${track.title}`
                  );

                  return (
                    <div
                      id={`cp-item-${itemIndex}`}
                      key={track.spotify_id || `${track.title}-${idx}`}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => {
                        if (track.in_library) {
                          playTrack(track, results.tracks || [track]);
                        } else {
                          handleQuickDownload(track);
                        }
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer group transition ${
                        isSelected ? 'bg-white/15 ring-1 ring-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                        <div className="relative w-10 h-10 rounded overflow-hidden bg-surface-elevated2 shrink-0 shadow-sm">
                          <img
                            src={track.cover_url || '/api/covers/0'}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {track.in_library && (
                            <div
                              className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${
                                isThisPlaying ? 'opacity-100' : isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              {isThisPlaying ? (
                                <Pause size={16} className="text-white fill-white" />
                              ) : (
                                <Play size={16} className="text-white fill-white ml-0.5" />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="truncate flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
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

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {track.in_library ? (
                          track.duration > 0 && (
                            <span className="text-xs text-content-muted group-hover:text-white font-mono">
                              {formatDuration(track.duration)}
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleQuickDownload(track, e)}
                            disabled={isDownloading}
                            className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-brand-500 hover:text-black text-white text-[11px] font-bold transition flex items-center gap-1"
                            title="Download 320k via Lidarr"
                          >
                            {isDownloading ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <DownloadCloud size={11} />
                            )}
                            <span>320k</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Albums Section */}
          {albums.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                {topResult?.type === 'artist' ? `Albums by ${topResult.name}` : 'Albums'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {albums.map((album, idx) => {
                  const itemIndex = topResultOffset + tracks.length + trendingTracks.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      id={`cp-item-${itemIndex}`}
                      key={album.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => {
                        if (onSelectAlbum) onSelectAlbum(album.id);
                        onClose();
                      }}
                      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <img
                        src={album.cover_url || `/api/covers/${album.id}`}
                        alt=""
                        className="w-10 h-10 rounded object-cover bg-surface-elevated2 shrink-0"
                      />
                      <div className="truncate flex-1 min-w-0">
                        <p
                          className={`text-xs font-bold truncate transition ${
                            isSelected ? 'text-brand-400' : 'text-white group-hover:text-brand-400'
                          }`}
                        >
                          {album.title}
                        </p>
                        <p className="text-[11px] text-content-secondary truncate">
                          {album.artist_name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other Artists Section */}
          {otherArtists.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                {topResult?.type === 'artist' ? 'Other Artists' : 'Artists'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {otherArtists.map((artist, idx) => {
                  const itemIndex =
                    topResultOffset + tracks.length + trendingTracks.length + albums.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      id={`cp-item-${itemIndex}`}
                      key={artist.id}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => {
                        if (onSelectArtist) onSelectArtist(artist.id);
                        onClose();
                      }}
                      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer group transition ${
                        isSelected
                          ? 'bg-white/15 ring-1 ring-white/20'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <img
                        src={artist.image_url || `/api/artists/${artist.id}/image`}
                        alt=""
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/api/covers/0';
                        }}
                        className="w-10 h-10 rounded-full object-cover bg-surface-elevated2 shadow-sm shrink-0 border border-white/10"
                      />
                      <div className="truncate flex-1 min-w-0">
                        <p
                          className={`text-xs font-bold truncate transition ${
                            isSelected ? 'text-brand-400' : 'text-white group-hover:text-brand-400'
                          }`}
                        >
                          {artist.name}
                        </p>
                        <p className="text-[11px] text-content-secondary">Artist</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Request Button at Bottom */}
          {query.trim().length > 0 && (
            <div className="pt-2 border-t border-border-subtle">
              {(() => {
                const requestIndex =
                  topResultOffset +
                  tracks.length +
                  trendingTracks.length +
                  albums.length +
                  otherArtists.length;
                const isSelected = selectedIndex === requestIndex;
                return (
                  <button
                    id={`cp-item-${requestIndex}`}
                    onMouseEnter={() => setSelectedIndex(requestIndex)}
                    onClick={() => {
                      onClose();
                      if (onRequestMusic) onRequestMusic(results.correctedQuery || query);
                    }}
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
                          Request "{results.correctedQuery || query}" via Torrent / Spotify
                          {results.correctedQuery && (
                            <span className="text-brand-500 text-[10px] ml-1.5 font-normal">(corrected)</span>
                          )}
                        </p>
                        <p className="text-[10px] text-content-muted">
                          Search Lidarr & torrent indexers to download
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-content-muted group-hover:text-white">→</span>
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        {/* Keyboard Navigation Footer Hints */}
        <div className="px-4 py-2.5 bg-surface-island border-t border-border-medium flex items-center justify-between text-xs text-content-muted">
          <div className="flex items-center gap-2">
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">↑</kbd>{' '}
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">↓</kbd> Navigate
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
          <span className="text-content-subtle">MattLab Quick Switcher</span>
        </div>
      </div>
    </div>
  );
};
