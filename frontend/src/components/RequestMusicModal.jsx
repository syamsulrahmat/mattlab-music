import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Search, DownloadCloud, Link2, Music2, Disc, CheckCircle2, 
  Loader2, ArrowRight, Activity, HardDrive, Sparkles, Check, Play, Pause, Volume2 
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';

export const RequestMusicModal = ({ 
  isOpen, 
  onClose, 
  onSelectAlbum, 
  onLibraryUpdated,
  initialQuery = '' 
}) => {
  const { isPlaying, fadePause, fadeResume } = usePlayer();
  const { isAdmin } = useAuth();
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
        setError(`No audio preview found for "${titleToSearch}".`);
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
      setError('Could not stream preview for this release.');
    }
  };

  // Hoisted fetchActivity so handleDownload can refresh live downloads safely
  const fetchActivity = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/request/activity');
      if (!res.ok) return;
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
      setError(`Error triggering torrent download: ${err.message}`);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer overflow-x-hidden"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-surface-panel border border-border-medium rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden cursor-default min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 border-b border-border-subtle flex items-center justify-between bg-surface-island shrink-0 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 shrink-0">
              <DownloadCloud size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-content-primary tracking-tight flex items-center gap-1.5 flex-wrap">
                <span>Request & Download Music</span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20 shrink-0">
                  Torrent + HQ
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-content-secondary truncate">
                Search albums or paste Spotify tracks & playlists to grab via torrent or 320k direct stream
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 text-content-secondary hover:text-content-primary flex items-center justify-center transition shrink-0"
            title="Close modal (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher: Search vs Live Torrent Activity */}
        <div className="px-3 sm:px-4 pt-3 flex items-center gap-2 border-b border-border-subtle bg-surface-island shrink-0">
          <button
            onClick={() => setActiveTab('search')}
            className={`pb-2.5 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'border-brand-500 text-content-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            <Search size={14} />
            <span>Search & Request</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2.5 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-brand-500 text-content-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            <Activity size={14} className={activities.length > 0 ? 'text-brand-500 animate-pulse' : ''} />
            <span>Live Activity</span>
            {activities.length > 0 && (
              <span className="text-[10px] bg-brand-500 text-black font-extrabold px-1.5 py-0.2 rounded-full">
                {activities.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-4 min-w-0">
          {activeTab === 'search' ? (
            <>
              {/* Search / URL Input Capsule */}
              <div className="space-y-2 min-w-0">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleResolve();
                  }}
                  className="relative flex items-center min-w-0"
                >
                  <div className="absolute left-3.5 text-content-secondary pointer-events-none">
                    {query.includes('spotify.com') ? (
                      <Link2 size={18} className="text-brand-500" />
                    ) : (
                      <Search size={18} />
                    )}
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search artist/album or paste Spotify link..."
                    className="w-full bg-surface-elevated2 hover:bg-surface-hover focus:bg-surface-hover text-content-primary pl-10 pr-24 py-3 rounded-xl text-xs sm:text-sm font-medium outline-none border border-border-medium focus:border-brand-500 transition placeholder-content-muted"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="p-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-white/10"
                      >
                        <X size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="text-[11px] font-semibold text-content-secondary hover:text-content-primary bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition"
                        title="Paste from clipboard"
                      >
                        Paste
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!query.trim() || isResolving}
                      className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1"
                    >
                      {isResolving ? <Loader2 size={13} className="animate-spin" /> : <span>Find</span>}
                    </button>
                  </div>
                </form>

                {/* Quality Preferences Selector (Responsive wrap for mobile) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-content-secondary px-1">
                  <span className="font-medium text-content-muted">Quality Preference:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setQualityProfileId(1)}
                      className={`px-2.5 py-1 sm:py-0.5 rounded-md font-medium transition text-[11px] ${
                        qualityProfileId === 1
                           ? 'bg-brand-500/20 text-brand-500 font-bold border border-brand-500/30'
                          : 'bg-white/5 text-content-muted hover:text-content-primary border border-transparent'
                      }`}
                    >
                      Any Quality (320k or FLAC)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQualityProfileId(2)}
                      className={`px-2.5 py-1 sm:py-0.5 rounded-md font-medium transition text-[11px] ${
                        qualityProfileId === 2
                          ? 'bg-brand-500/20 text-brand-500 font-bold border border-brand-500/30'
                          : 'bg-white/5 text-content-muted hover:text-content-primary border border-transparent'
                      }`}
                    >
                      Lossless Only (FLAC)
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center justify-between gap-2">
                  <span>{error}</span>
                  <button 
                    onClick={() => setError(null)}
                    className="p-1 hover:bg-white/10 rounded-full text-red-400 transition"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Loading Indicator */}
              {isResolving && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 size={32} className="text-brand-500 animate-spin" />
                  <p className="text-xs text-content-secondary">
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
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl text-xs text-white">
                      <Sparkles size={15} className="text-brand-500 shrink-0" />
                      <span>
                        Showing results for <strong className="text-brand-500 font-bold">{result.corrected_query}</strong>
                        {result.query && result.query.toLowerCase() !== result.corrected_query.toLowerCase() && (
                          <span className="text-content-muted ml-1.5">(auto-corrected from "{result.query}")</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Dedicated Song Result Card */}
                  {result.song_result && (
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-brand-500/20 via-surface-elevated2 to-surface-elevated border border-brand-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shadow-xl min-w-0 max-w-full overflow-hidden">
                      <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
                        <img
                          src={result.song_result.cover_url || result.items?.[0]?.cover_url || '/api/covers/0'}
                          alt=""
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover bg-surface-elevated2 shadow-md shrink-0 border border-border-medium"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500 text-black">
                              Track
                            </span>
                            {result.corrected_query && (
                              <span className="text-[10px] text-brand-500 font-medium flex items-center gap-1">
                                <Sparkles size={11} /> Match
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-white truncate mt-1">
                            {result.song_result.title}
                          </h3>
                          <p className="text-xs text-content-secondary truncate mt-0.5">
                            {result.song_result.artist_name} {result.song_result.album_title ? `• ${result.song_result.album_title}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                        {/* Audio Preview for Track */}
                        <button
                          type="button"
                          onClick={() => handleTogglePreview(result.song_result, 'featured_song')}
                          disabled={previewLoadingKey === 'featured_song'}
                          className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial ${
                            previewTrackKey === 'featured_song'
                              ? 'bg-brand-500 text-black border-brand-500 font-bold shadow-md shadow-brand-500/30 animate-pulse'
                              : 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20'
                          }`}
                          title={previewTrackKey === 'featured_song' ? 'Stop Preview' : 'Preview 30s Audio'}
                        >
                          {previewLoadingKey === 'featured_song' ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-brand-500" />
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
                          className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-bold text-xs h-9 px-4 rounded-full transition active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-brand-500/20 flex-1 sm:flex-initial"
                        >
                          {downloadingIds.has(result.song_result.title) ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Dispatching...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud size={14} />
                              <span>Download (320k)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-content-secondary pt-2">
                    <span className="font-semibold text-white truncate mr-2">
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
                    <span className="shrink-0">{result.items?.length || 0} match(es)</span>
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
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-surface-elevated hover:bg-surface-elevated2 border border-border-subtle rounded-xl transition min-w-0 max-w-full overflow-hidden"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <img
                                src={album.cover_url || '/api/covers/0'}
                                alt=""
                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover bg-surface-hover shrink-0 shadow-sm"
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white truncate">
                                  {album.title}
                                </h4>
                                <p className="text-xs text-content-secondary truncate mt-0.5">
                                  {album.artist_name} {album.year ? `• ${album.year}` : ''}
                                </p>
                                {album.source_track && (
                                  <p className="text-[10px] text-brand-500 truncate mt-0.5 font-medium">
                                    Includes: {album.source_track}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons (Full width touch-friendly row on mobile, inline on sm+) */}
                            <div className="shrink-0 flex items-center gap-2 justify-end flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-border-subtle/50">
                              <button
                                type="button"
                                onClick={() => handleTogglePreview(album, albumKey)}
                                disabled={previewLoadingKey === albumKey}
                                className={`h-8 sm:h-8 px-3 rounded-full border text-xs font-medium transition active:scale-95 flex items-center gap-1.5 ${
                                  previewTrackKey === albumKey
                                    ? 'bg-brand-500 text-black border-brand-500 font-bold shadow-md shadow-brand-500/30 animate-pulse'
                                    : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/10 hover:border-white/20'
                                }`}
                                title={previewTrackKey === albumKey ? 'Stop Preview' : 'Preview 30s Audio'}
                              >
                                {previewLoadingKey === albumKey ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin text-brand-500" />
                                    <span className="text-[11px]">Loading...</span>
                                  </>
                                ) : previewTrackKey === albumKey ? (
                                  <>
                                    <Pause size={12} className="fill-current" />
                                    <span className="text-[11px]">Previewing</span>
                                  </>
                                ) : (
                                  <>
                                    <Play size={12} className="fill-current ml-0.5" />
                                    <span className="text-[11px]">Preview</span>
                                  </>
                                )}
                              </button>

                              {album.in_library ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-500 bg-brand-500/10 px-2.5 py-1.5 rounded-full border border-brand-500/20">
                                    <CheckCircle2 size={12} />
                                    <span>In Library</span>
                                  </span>
                                  {isQueued ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-500 bg-brand-500/10 px-2.5 py-1.5 rounded-full border border-brand-500/20">
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
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-500 bg-brand-500/10 px-2.5 py-1.5 rounded-full border border-brand-500/20">
                                  <Check size={12} />
                                  <span>Queued</span>
                                </span>
                              ) : album.source_track ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDownload({ ...album, force_direct: true })}
                                    disabled={isDownloading}
                                    className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-bold text-xs px-3 py-1.5 rounded-full transition active:scale-95 flex items-center gap-1.5 shadow"
                                    title={`Download single track: ${album.source_track}`}
                                  >
                                    {isDownloading ? (
                                      <>
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>Dispatching...</span>
                                      </>
                                    ) : (
                                      <>
                                        <DownloadCloud size={13} />
                                        <span>Download Track</span>
                                      </>
                                    )}
                                  </button>
                                  {album.lidarr_album_id && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownload({ ...album, force_direct: false })}
                                      disabled={isDownloading}
                                      className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-medium text-xs px-2.5 py-1.5 rounded-full transition border border-white/10 flex items-center gap-1"
                                      title={`Request full album: ${album.title}`}
                                    >
                                      <Disc size={12} />
                                      <span className="text-[11px]">Full Album</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(album)}
                                  disabled={isDownloading}
                                  className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-bold text-xs px-3.5 py-1.5 rounded-full transition active:scale-95 flex items-center gap-1.5 shadow"
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
                    <div className="py-8 text-center text-xs text-content-muted">
                      No releases found matching this request. Try adjusting your search query.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Live Torrent & Lidarr Activity Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>Active Download Activity (Torrents & Direct HQ)</span>
                <span className="text-[10px] text-brand-500">Auto-refreshing live</span>
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
                        className="p-3.5 bg-surface-elevated border border-border-subtle rounded-xl space-y-2 min-w-0 max-w-full overflow-hidden"
                      >
                        <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                          <span className="font-bold text-white truncate min-w-0 flex-1" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-brand-500 shrink-0">
                            {item.progress}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 w-full bg-surface-island rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                          />
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center justify-between text-[10px] text-content-muted font-mono">
                          <div className="flex items-center gap-2">
                            <span>
                              {item.state === 'completed' || item.progress >= 100 ? (
                                <span className="text-brand-500 font-bold flex items-center gap-1">
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
                              <span className="text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20 text-[9px]">
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
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-content-subtle">
                    <Activity size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-white">No Active Downloads</h4>
                  <p className="text-xs text-content-muted max-w-xs">
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
