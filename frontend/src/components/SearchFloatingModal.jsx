import React, { useEffect, useState } from 'react';
import { Play, Pause, DownloadCloud, Sparkles, ChevronRight, TrendingUp, Loader2 } from 'lucide-react';
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
  const { currentTrack, isPlaying, togglePlay, showToast } = usePlayer();
  const [downloadingIds, setDownloadingIds] = useState(new Set());

  // Auto-scroll selected element into view when selectedIndex changes
  useEffect(() => {
    if (isOpen && selectedIndex >= 0) {
      const el = document.getElementById(`search-float-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen]);

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

  if (!isOpen) return null;

  const topResult =
    results?.top_result ||
    (results?.primary_artist ? { type: 'artist', ...results.primary_artist } : null);
  const hasTopResult = Boolean(topResult);
  const topResultOffset = hasTopResult ? 1 : 0;

  const rawTracks = results?.tracks || [];
  const tracks = rawTracks.filter(
    (t) => !(topResult?.type === 'track' && topResult.id === t.id)
  );

  const rawTrending = results?.trending_tracks || [];
  const trendingTracks = rawTrending
    .slice(0, 4)
    .filter(
      (t) =>
        !(
          topResult?.type === 'track' &&
          (topResult.spotify_id === t.spotify_id || (topResult.id && topResult.id === t.id))
        )
    );

  const albums = results?.albums || [];
  const rawArtists = results?.artists || [];
  const topArtistId = topResult?.type === 'artist' ? topResult.id : results?.primary_artist?.id;
  const otherArtists = rawArtists.filter((a) => !topArtistId || a.id !== topArtistId);

  const totalResults =
    topResultOffset + tracks.length + trendingTracks.length + albums.length + otherArtists.length;

  return (
    <>
      {/* Soft Backdrop to close on click outside without switching active screen */}
      <div
        className="fixed inset-0 top-16 bg-black/50 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Floating Results Card Dropdown: matching search bar width 1:1 */}
      <div
        className="absolute top-full left-0 right-0 w-full mt-2 max-h-[75vh] bg-surface-panel/95 backdrop-blur-xl border border-border-medium rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-150 select-none text-content-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Results Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-content-muted gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
              <span className="text-xs">Searching library & live trends...</span>
            </div>
          )}

          {/* Corrected Query Banner */}
          {results?.correctedQuery && (
            <div className="flex items-center gap-2 px-3 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl text-xs text-content-primary">
              <Sparkles size={14} className="text-brand-500 shrink-0" />
              <span>
                Showing results for <strong className="text-brand-500 font-bold">{results.correctedQuery}</strong>
              </span>
            </div>
          )}

          {/* Empty Search Results State */}
          {!isLoading && query && totalResults === 0 && (
            <div className="py-8 text-center text-content-muted">
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

          {/* Top Result / Best Match Section */}
          {topResult && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                Top Result
              </p>

              {topResult.type === 'track' ? (
                <div
                  id="search-float-item-0"
                  onMouseEnter={() => setSelectedIndex(0)}
                  onClick={() => {
                    if (topResult.in_library || topResult.id) {
                      onSelectTrack(topResult);
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
                      {/* Cover Artwork with Play indicator */}
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

                      {/* Track Details */}
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

                    {/* Action Button */}
                    <div className="shrink-0">
                      {topResult.in_library || topResult.id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTrack(topResult);
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
                          title="Download 320k MP3/FLAC"
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
                  id="search-float-item-0"
                  onMouseEnter={() => setSelectedIndex(0)}
                  onClick={() => onSelectArtist(topResult.id)}
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

          {/* Songs / Tracks in Library Section */}
          {tracks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-content-muted px-3 mb-1.5 tracking-wider">
                {topResult?.type === 'artist' ? `Songs by ${topResult.name}` : 'Songs in Library'}
              </p>
              <div className="space-y-1">
                {tracks.map((track, idx) => {
                  const itemIndex = topResultOffset + idx;
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
                      id={`search-float-item-${itemIndex}`}
                      key={track.spotify_id || `${track.title}-${idx}`}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => {
                        if (track.in_library) {
                          onSelectTrack(track);
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
                            {track.in_library ? (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 shrink-0">
                                In Library
                              </span>
                            ) : null}
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
          {query?.trim().length > 0 && (
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
        <div className="px-3.5 py-2 bg-surface-island border-t border-border-subtle flex items-center justify-between text-[11px] text-content-subtle">
          <div className="flex items-center gap-2">
            <span>
              <kbd className="bg-white/10 px-1 py-0.5 rounded text-white/80 font-mono text-[10px]">↑</kbd>{' '}
              <kbd className="bg-white/10 px-1 py-0.5 rounded text-white/80 font-mono text-[10px]">↓</kbd> Navigate
            </span>
            <span>•</span>
            <span>
              <kbd className="bg-white/15 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">Enter</kbd> Select
            </span>
            <span>•</span>
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono text-[10px]">Esc</kbd> Close
            </span>
          </div>
          <span className="text-content-subtle hidden sm:inline">MattLab Search</span>
        </div>
      </div>
    </>
  );
};
