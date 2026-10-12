import React, { useState, useEffect } from 'react';
import { 
  X, Search, DownloadCloud, Link2, Music2, Disc, CheckCircle2, 
  Loader2, ArrowRight, Activity, HardDrive, Sparkles, Check, Play 
} from 'lucide-react';

export const RequestMusicModal = ({ isOpen, onClose, onSelectAlbum }) => {
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

  // Poll active downloads when modal is open or when viewing activity tab
  useEffect(() => {
    if (!isOpen) return;

    const fetchActivity = async () => {
      try {
        const res = await fetch('/api/request/activity');
        const data = await res.json();
        setActivities(data.active_downloads || []);
      } catch (err) {
        console.error('Failed to load torrent activity:', err);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

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
          album: album.raw || album,
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

      // Switch tab to activity to show immediate progress
      setTimeout(() => {
        setActiveTab('activity');
      }, 1000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#181818] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
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
                  Lidarr + qBittorrent
                </span>
              </h2>
              <p className="text-xs text-[#b3b3b3]">
                Search albums or paste Spotify tracks, albums & playlists to grab via torrent
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
                  <div className="flex items-center justify-between text-xs text-[#b3b3b3]">
                    <span className="font-semibold text-white">
                      {result.type === 'spotify_playlist' && (
                        <span>Playlist: {result.playlist_name} ({result.total_tracks} tracks)</span>
                      )}
                      {result.type === 'spotify_album' && (
                        <span>Detected Album: {result.detected_album}</span>
                      )}
                      {result.type === 'spotify_track' && (
                        <span>Detected Song: {result.detected_track}</span>
                      )}
                      {result.type === 'search' && (
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
                              {album.in_library ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2.5 py-1 rounded-full border border-[#1ed760]/20">
                                  <CheckCircle2 size={12} />
                                  <span>In Library</span>
                                </span>
                              ) : isQueued ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1ed760] bg-[#1ed760]/10 px-2.5 py-1 rounded-full border border-[#1ed760]/20">
                                  <Check size={12} />
                                  <span>Queued</span>
                                </span>
                              ) : (
                                <button
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
                                      <span>Download Torrent</span>
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
                <span>Active qBittorrent & Lidarr Downloads</span>
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
                          <span>
                            State: <span className="text-white capitalize">{item.state}</span>
                          </span>
                          {speedMb > 0 && <span>Speed: {speedMb} MB/s</span>}
                          {sizeMb > 0 && <span>Size: {sizeMb} MB</span>}
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
