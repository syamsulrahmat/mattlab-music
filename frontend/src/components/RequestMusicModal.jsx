import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Search, DownloadCloud, Link2, Music2, Disc, CheckCircle2, 
  Loader2, ArrowRight, Activity, HardDrive, Sparkles, Check, Play, Pause, Volume2 
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const RequestMusicModal = ({ 
  isOpen, 
  onClose, 
  onSelectAlbum, 
  onLibraryUpdated,
  initialQuery = '' 
}) => {
  const { isPlaying, fadePause, fadeResume } = usePlayer();
  const pausedByPreviewRef = useRef(false);

  const [query, setQuery] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [queuedStatus, setQueuedStatus] = useState({}); // foreign_album_id -> message
  const [qualityProfileId, setQualityProfileId] = useState(1); // 1 = Any, 2 = Lossless
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'activity'
  const [activities, setActivities] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [previewTrackKey, setPreviewTrackKey] = useState(null);
  const [previewLoadingKey, setPreviewLoadingKey] = useState(null);
  const previewAudioRef = useRef(null);

  // Stop preview playback helper & restore background music volume
  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current = null;
    }
    setPreviewTrackKey(null);
    setPreviewLoadingKey(null);

    // If main player was faded out for preview, smoothly fade it back in!
    if (pausedByPreviewRef.current) {
      pausedByPreviewRef.current = false;
      if (fadeResume) fadeResume(400);
    }
  }, [fadeResume]);

  // Clean up preview audio & reset session activities when modal is closed
  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      setActivities([]);
    }
    return () => stopPreview();
  }, [isOpen, stopPreview]);

  const handleTogglePreview = async (album, albumKey) => {
    if (previewTrackKey === albumKey) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewLoadingKey(albumKey);

    const titleToSearch = album.source_track || album.title || '';
    const artistToSearch = album.artist_name || '';

    try {
      const res = await fetch(`/api/request/preview?artist=${encodeURIComponent(artistToSearch)}&title=${encodeURIComponent(titleToSearch)}`);
      if (!res.ok) throw new Error('Preview not found');
      const data = await res.json();

      if (!data.preview_url) {
        alert(`No audio preview found for "${titleToSearch}".`);
        setPreviewLoadingKey(null);
        return;
      }

      // ONLY fade out background playing song right when preview audio is ready to play!
      if (isPlaying && !pausedByPreviewRef.current) {
        pausedByPreviewRef.current = true;
        if (fadePause) await fadePause(300);
      }

      const audio = new Audio(data.preview_url);
      previewAudioRef.current = audio;
      setPreviewTrackKey(albumKey);
      setPreviewLoadingKey(null);

      audio.onended = () => {
        stopPreview();
      };
      audio.onerror = () => {
        stopPreview();
      };

      await audio.play();
    } catch (err) {
      console.warn('Audio preview error:', err);
      setPreviewLoadingKey(null);
      setPreviewTrackKey(null);
      if (pausedByPreviewRef.current) {
        pausedByPreviewRef.current = false;
        if (fadeResume) fadeResume(300);
      }
      alert('Could not stream preview for this release.');
    }
  };

  // Hoisted fetchActivity so handleDownload can refresh live downloads safely
  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/request/activity');
      const data = await res.json();
      const activeList = data.active_downloads || [];
      
      setActivities((prev) => {
        // Map of existing items in this session to persist completed items
        const map = new Map();
        for (const item of prev) {
          map.set(item.id || item.name, item);
        }

        // Merge incoming updates
        for (const inc of activeList) {
          const key = inc.id || inc.name;
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...inc });
          } else {
            // Find by title match if id differs (e.g. temporary app item)
            let matchedKey = null;
            for (const [k, v] of map.entries()) {
              if (v.name && inc.name && (v.name.toLowerCase().includes(inc.name.toLowerCase()) || inc.name.toLowerCase().includes(v.name.toLowerCase()))) {
                matchedKey = k;
                break;
              }
            }
            if (matchedKey) {
              const prevItem = map.get(matchedKey);
              map.delete(matchedKey);
              map.set(key, { ...prevItem, ...inc });
            } else {
              map.set(key, inc);
            }
          }
        }

        return Array.from(map.values());
      });
      
      // If any download completed, notify library to refresh
      if (activeList.some((a) => a.state === 'completed' || a.progress >= 100)) {
        if (onLibraryUpdated) onLibraryUpdated();
      }
    } catch (err) {
      console.error('Failed to load torrent activity:', err);
    }
  }, [onLibraryUpdated]);

  // Poll active downloads when modal is open
  useEffect(() => {
    if (!isOpen) return;
    fetchActivity();
    const interval = setInterval(fetchActivity, 3000);
    return () => clearInterval(interval);
  }, [isOpen, fetchActivity]);

  // Auto-populate query and trigger resolve if initialQuery is supplied
  useEffect(() => {
    if (isOpen) {
      if (initialQuery && initialQuery.trim()) {
        const q = initialQuery.trim();
        setQuery(q);
        handleResolve(q);
      } else {
        setQuery('');
        setResult(null);
        setError(null);
      }
    }
  }, [isOpen, initialQuery]);

  // Global Escape key listener to close modal
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

  if (!isOpen) return null;

  const handleResolve = async (searchQuery = query) => {
    const q = (searchQuery || '').trim();
    if (!q) return;

    setIsResolving(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/request/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to resolve music request');
    } finally {
      setIsResolving(false);
    }
  };

  const handleDownload = async (album) => {
    const albumKey = album.foreign_album_id || album.title;
    setDownloadingIds((prev) => new Set(prev).add(albumKey));

    try {
      const res = await fetch('/api/request/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          album: {
            ...(album.raw || {}),
            ...album,
            cover_url: album.cover_url,
          },
          quality_profile_id: qualityProfileId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Download request failed');
      }

      setQueuedStatus((prev) => ({
        ...prev,
        [albumKey]: data.message || 'Queued in qBittorrent via Lidarr',
      }));

      // Optimistically add to live activity list immediately
      const displayName = `${album.artist_name} - ${album.source_track || album.title}`;
      setActivities((prev) => [
        {
          id: `app_${Date.now()}`,
          name: displayName,
          progress: 5,
          state: 'downloading',
          source: 'Music App',
          dlspeed: 0,
          size: 0,
        },
        ...prev.filter((p) => p.name !== displayName),
      ]);

      // Switch tab to activity immediately to show live progress
      setActiveTab('activity');
      fetchActivity();
    } catch (err) {
      alert(`Error triggering torrent download: ${err.message}`);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(albumKey);
        return next;
      });
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQuery(text);
        handleResolve(text);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[#181818] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#1ed760]/10 flex items-center justify-center text-[#1ed760]">
              <DownloadCloud size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Request & Download Music</span>
                <span className="text-[10px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2 py-0.5 rounded-full border border-[#1ed760]/20">
                  Torrent + Direct HQ
                </span>
              </h2>
              <p className="text-xs text-[#b3b3b3]">
                Search albums or paste Spotify tracks & playlists to grab via torrent or 320k direct stream
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher: Search vs Live Torrent Activity */}
        <div className="px-4 pt-3 flex items-center gap-2 border-b border-white/5 bg-[#121212]">
          <button
            onClick={() => setActiveTab('search')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'border-[#1ed760] text-white'
                : 'border-transparent text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Search size={14} />
            <span>Search & Request</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-[#1ed760] text-white'
                : 'border-transparent text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Activity size={14} className={activities.length > 0 ? 'text-[#1ed760] animate-pulse' : ''} />
            <span>Live Activity</span>
            {activities.length > 0 && (
              <span className="text-[10px] bg-[#1ed760] text-black font-extrabold px-1.5 py-0.2 rounded-full">
                {activities.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'search' ? (
            <>
              {/* Search / URL Input Capsule */}
              <div className="space-y-2">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleResolve();
                  }}
                  className="relative flex items-center"
                >
                  <div className="absolute left-3.5 text-[#b3b3b3] pointer-events-none">
                    {query.includes('spotify.com') ? (
                      <Link2 size={18} className="text-[#1ed760]" />
                    ) : (
                      <Search size={18} />
                    )}
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search artist/album or paste Spotify link..."
                    className="w-full bg-[#242424] hover:bg-[#282828] focus:bg-[#282828] text-white pl-10 pr-24 py-3 rounded-xl text-xs sm:text-sm font-medium outline-none border border-white/10 focus:border-[#1ed760] transition placeholder-[#777]"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="p-1 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10"
                      >
                        <X size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="text-[11px] font-semibold text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition"
                        title="Paste from clipboard"
                      >
                        Paste
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!query.trim() || isResolving}
                      className="bg-[#1ed760] hover:bg-[#1fdf64] disabled:opacity-50 text-black font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1"
                    >
                      {isResolving ? <Loader2 size={13} className="animate-spin" /> : <span>Find</span>}
                    </button>
                  </div>
                </form>

                {/* Quality Preferences Selector */}
                <div className="flex items-center justify-between text-[11px] text-[#b3b3b3] px-1">
                  <span>Quality Preference:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQualityProfileId(1)}
                      className={`px-2 py-0.5 rounded-md font-medium transition ${
                        qualityProfileId === 1
                          ? 'bg-[#1ed760]/20 text-[#1ed760] font-bold border border-[#1ed760]/30'
                          : 'bg-white/5 text-[#888] hover:text-white'
                      }`}
                    >
                      Any Quality (FLAC or 320k)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQualityProfileId(2)}
                      className={`px-2 py-0.5 rounded-md font-medium transition ${
                        qualityProfileId === 2
                          ? 'bg-[#1ed760]/20 text-[#1ed760] font-bold border border-[#1ed760]/30'
                          : 'bg-white/5 text-[#888] hover:text-white'
                      }`}
                    >
                      Lossless Only (FLAC)
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                  {error}
                </div>
              )}

              {/* Loading Indicator */}
              {isResolving && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 size={32} className="text-[#1ed760] animate-spin" />
                  <p className="text-xs text-[#b3b3b3]">
                    {query.includes('spotify.com')
                      ? 'Resolving Spotify metadata & querying MusicBrainz...'
                      : 'Searching releases in Lidarr...'}
                  </p>
                </div>
              )}

              {/* Results List */}
              {result && !isResolving && (
                <div className="space-y-3">
                  {result.corrected_query && (
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-[#1ed760]/10 border border-[#1ed760]/20 rounded-xl text-xs text-white">
                      <Sparkles size={15} className="text-[#1ed760] shrink-0" />
                      <span>
                        Showing results for <strong className="text-[#1ed760] font-bold">{result.corrected_query}</strong>
                        {result.query && result.query.toLowerCase() !== result.corrected_query.toLowerCase() && (
                          <span className="text-[#888] ml-1.5">(auto-corrected from "{result.query}")</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Dedicated Song Result Card */}
                  {result.song_result && (
                    <div className="p-4 bg-gradient-to-r from-[#1ed760]/20 via-[#242424] to-[#1c1c1c] border border-[#1ed760]/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <img
                          src={result.song_result.cover_url || result.items?.[0]?.cover_url || '/api/covers/0'}
                          alt=""
                          className="w-16 h-16 rounded-xl object-cover bg-[#242424] shadow-md shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#1ed760] text-black">
                              Track
                            </span>
                            {result.corrected_query && (
                              <span className="text-[10px] text-[#1ed760] font-medium flex items-center gap-1">
                                <Sparkles size={11} /> Match
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-white truncate mt-1">
                            {result.song_result.title}
                          </h3>
                          <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                            {result.song_result.artist_name} {result.song_result.album_title ? `• ${result.song_result.album_title}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                        {/* Audio Preview for Track */}
                        <button
                          type="button"
                          onClick={() => handleTogglePreview(result.song_result, 'featured_song')}
                          disabled={previewLoadingKey === 'featured_song'}
                          className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
                            previewTrackKey === 'featured_song'
                              ? 'bg-[#1ed760] text-black border-[#1ed760] font-bold shadow-md shadow-[#1ed760]/30 animate-pulse'
                              : 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20'
                          }`}
                          title={previewTrackKey === 'featured_song' ? 'Stop Preview' : 'Preview 30s Audio'}
                        >
                          {previewLoadingKey === 'featured_song' ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-[#1ed760]" />
                              <span>Loading...</span>
                            </>
                          ) : previewTrackKey === 'featured_song' ? (
                            <>
                              <Pause size={13} className="fill-current" />
                              <span>Previewing</span>
                            </>
                          ) : (
                            <>
                              <Play size={13} className="fill-current ml-0.5" />
                              <span>Preview Song</span>
                            </>
                          )}
                        </button>

                        {/* Download Track Button */}
                        <button
                          type="button"
                          onClick={() => handleDownload({
                            title: result.song_result.album_title || result.song_result.title,
                            artist_name: result.song_result.artist_name,
                            source_track: result.song_result.title,
                            cover_url: result.song_result.cover_url,
                            force_direct: true
                          })}
                          disabled={downloadingIds.has(result.song_result.title)}
                          className="bg-[#1ed760] hover:bg-[#1fdf64] disabled:opacity-50 text-black font-bold text-xs h-9 px-4 rounded-full transition active:scale-95 flex items-center gap-1.5 shadow-lg shadow-[#1ed760]/20"
                        >
                          {downloadingIds.has(result.song_result.title) ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Dispatching...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud size={14} />
                              <span>Download Song (320k)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-[#b3b3b3] pt-2">
                    <span className="font-semibold text-white">
                      {result.type === 'spotify_playlist' && (
                        <span>Playlist: {result.playlist_name} ({result.total_tracks} tracks)</span>
                      )}
                      {result.type === 'spotify_album' && (
                        <span>Detected Album: {result.detected_album}</span>
                      )}
                      {result.song_result ? (
                        <span>Full Album Releases</span>
                      ) : result.type === 'spotify_track' ? (
                        <span>Detected Song: {result.detected_track}</span>
                      ) : (
                        <span>Results for "{result.query}"</span>
                      )}
                    </span>
                    <span>{result.items?.length || 0} match(es)</span>
                  </div>

                  {result.items && result.items.length > 0 ? (
                    <div className="grid gap-2.5">
                      {result.items.map((album, idx) => {
                        const albumKey = album.foreign_album_id || album.title;
                        const isDownloading = downloadingIds.has(albumKey);
                        const isQueued = queuedStatus[albumKey];

                        return (
                          <div
                            key={`${albumKey}-${idx}`}
                            className="flex items-center gap-3.5 p-3 bg-[#202020] hover:bg-[#242424] border border-white/5 rounded-xl transition"
                          >
                            <img
                              src={album.cover_url || '/api/covers/0'}
                              alt=""
                              className="w-14 h-14 rounded-lg object-cover bg-[#282828] shrink-0 shadow-sm"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">
                                {album.title}
                              </h4>
                              <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                                {album.artist_name} {album.year ? `• ${album.year}` : ''}
                              </p>
                              {album.source_track && (
                                <p className="text-[10px] text-[#1ed760] truncate mt-0.5">
                                  Includes: {album.source_track}
                                </p>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="shrink-0 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleTogglePreview(album, albumKey)}
                                disabled={previewLoadingKey === albumKey}
                                className={`h-8 px-2.5 rounded-full border text-xs font-medium transition active:scale-95 flex items-center gap-1.5 ${
                                  previewTrackKey === albumKey
                                    ? 'bg-[#1ed760] text-black border-[#1ed760] font-bold shadow-md shadow-[#1ed760]/30 animate-pulse'
                                    : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/10 hover:border-white/20'
                                }`}
                                title={previewTrackKey === albumKey ? 'Stop Preview' : 'Preview 30s Audio'}
                              >
                                {previewLoadingKey === albumKey ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin text-[#1ed760]" />
                                    <span className="text-[11px] hidden sm:inline">Loading...</span>
                                  </>
                                ) : previewTrackKey === albumKey ? (
                                  <>
                                    <Pause size={12} className="fill-current" />
                                    <span className="text-[11px]">Previewing</span>
                                  </>
                                ) : (
                                  <>
                                    <Play size={12} className="fill-current ml-0.5" />
                                    <span className="text-[11px] hidden sm:inline">Preview</span>
                                  </>
                                )}
                              </button>

                              {album.in_library ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2.5 py-1.5 rounded-full border border-[#1ed760]/20">
                                    <CheckCircle2 size={12} />
                                    <span>In Library</span>
                                  </span>
                                  {isQueued ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2.5 py-1.5 rounded-full border border-[#1ed760]/20">
                                      <Check size={12} />
                                      <span>Queued</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleDownload(album)}
                                      disabled={isDownloading}
                                      className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium text-xs px-2.5 py-1.5 rounded-full transition active:scale-95 flex items-center gap-1 border border-white/10"
                                      title="Re-download or grab another release"
                                    >
                                      {isDownloading ? (
                                        <>
                                          <Loader2 size={12} className="animate-spin" />
                                          <span className="hidden sm:inline">Dispatching...</span>
                                        </>
                                      ) : (
                                        <>
                                          <DownloadCloud size={12} />
                                          <span>Re-download</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : isQueued ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2.5 py-1.5 rounded-full border border-[#1ed760]/20">
                                  <Check size={12} />
                                  <span>Queued</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(album)}
                                  disabled={isDownloading}
                                  className="bg-[#1ed760] hover:bg-[#1fdf64] disabled:opacity-50 text-black font-bold text-xs px-3 py-1.5 rounded-full transition active:scale-95 flex items-center gap-1.5 shadow"
                                >
                                  {isDownloading ? (
                                    <>
                                      <Loader2 size={12} className="animate-spin" />
                                      <span>Dispatching...</span>
                                    </>
                                  ) : (
                                    <>
                                      <DownloadCloud size={13} />
                                      <span>Request & Download</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-[#888]">
                      No releases found matching this request. Try adjusting your search query.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Live Torrent & Lidarr Activity Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#b3b3b3]">
                <span>Active Download Activity (Torrents & Direct HQ)</span>
                <span className="text-[10px] text-[#1ed760]">Auto-refreshing live</span>
              </div>

              {activities.length > 0 ? (
                <div className="space-y-2.5">
                  {activities.map((item) => {
                    const isSeeding = item.state === 'uploading' || item.state === 'stalledUP';
                    const speedMb = item.dlspeed ? (item.dlspeed / 1024 / 1024).toFixed(1) : 0;
                    const sizeMb = item.size ? (item.size / 1024 / 1024).toFixed(1) : 0;

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 bg-[#202020] border border-white/5 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white truncate max-w-[340px]" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-[#1ed760]">
                            {item.progress}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 w-full bg-[#141414] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#1ed760] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                          />
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center justify-between text-[10px] text-[#888] font-mono">
                          <div className="flex items-center gap-2">
                            <span>
                              {item.state === 'completed' || item.progress >= 100 ? (
                                <span className="text-[#1ed760] font-bold flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Completed (Ready in Library)
                                </span>
                              ) : item.state === 'downloading' ? (
                                <span className="text-cyan-400 font-bold flex items-center gap-1">
                                  <Loader2 size={11} className="animate-spin" /> Downloading...
                                </span>
                              ) : item.state === 'queued' ? (
                                <span className="text-amber-400 font-bold">Queued...</span>
                              ) : (
                                <span>State: <span className="text-white capitalize">{item.state}</span></span>
                              )}
                            </span>
                            {item.source && (
                              <span className="text-[#1ed760] bg-[#1ed760]/10 px-1.5 py-0.5 rounded border border-[#1ed760]/20 text-[9px]">
                                {item.source}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {speedMb > 0 && <span>Speed: {speedMb} MB/s</span>}
                            {sizeMb > 0 && <span>Size: {sizeMb} MB</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-[#666]">
                    <Activity size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-white">No Active Downloads</h4>
                  <p className="text-xs text-[#888] max-w-xs">
                    When you request an album, qBittorrent and Lidarr download progress will appear here in real-time.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
