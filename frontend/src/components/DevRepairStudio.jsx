import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Wrench, 
  Music, 
  Image as ImageIcon, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Loader2, 
  DownloadCloud, 
  ExternalLink,
  ShieldCheck,
  Disc3,
  Layers
} from 'lucide-react';

export const DevRepairStudio = ({ showToast }) => {
  const [auditData, setAuditData] = useState(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [processingTrackId, setProcessingTrackId] = useState(null);
  const [processingAction, setProcessingAction] = useState(null);
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'broken_audio' | 'missing_covers' | 'logs'
  const [workerStatus, setWorkerStatus] = useState(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const searchDebounceRef = useRef(null);

  // Fetch library health audit
  const fetchAudit = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/dev/repair/audit', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
        if (data.worker_status) {
          setWorkerStatus(data.worker_status);
          setIsBatchRunning(Boolean(data.worker_status.is_running));
        }
      }
    } catch (err) {
      console.error('Failed to load repair audit:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  // Poll worker status if batch job is running
  useEffect(() => {
    let interval = null;
    if (isBatchRunning) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/dev/repair/status', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setWorkerStatus(data);
            if (!data.is_running) {
              setIsBatchRunning(false);
              fetchAudit();
              showToast?.('✨ Batch repair job completed!');
            }
          }
        } catch (_) {}
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isBatchRunning, fetchAudit, showToast]);

  // Debounced track search
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/dev/repair/search?q=${encodeURIComponent(val)}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error('Track repair search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  };

  // Re-download Audio for a track
  const handleRedownloadAudio = async (track) => {
    setProcessingTrackId(track.id);
    setProcessingAction('audio');
    showToast?.(`⚡ Searching canonical release for "${track.title}"...`, 3000);

    try {
      const res = await fetch(`/api/dev/repair/track/${track.id}/audio`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.(`✅ Audio repaired: "${track.title}" (${data.new_duration}s)`, 4500);
        fetchAudit();
        // Update local search result if present
        setSearchResults((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, duration: data.new_duration, is_suspicious: false } : t))
        );
      } else {
        showToast?.(`⚠️ Audio repair failed: ${data.detail || data.error || 'Unknown error'}`);
      }
    } catch (err) {
      showToast?.(`⚠️ Network error repairing audio: ${err.message}`);
    } finally {
      setProcessingTrackId(null);
      setProcessingAction(null);
    }
  };

  // Re-download Cover Art for a track/album
  const handleRedownloadCover = async (track) => {
    setProcessingTrackId(track.id);
    setProcessingAction('cover');
    showToast?.(`🖼️ Fetching 1400px cover art for "${track.album}"...`, 3000);

    try {
      const res = await fetch(`/api/dev/repair/track/${track.id}/cover`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.(`✅ 1400px Cover art applied to "${track.album}"!`, 4000);
        fetchAudit();
        // Update local search result cover thumbnail cache bust
        setSearchResults((prev) =>
          prev.map((t) =>
            t.album_id === track.album_id
              ? { ...t, has_cover: true, cover_url: `/api/covers/${track.album_id}?v=${Date.now()}` }
              : t
          )
        );
      } else {
        showToast?.(`⚠️ Cover art fetch failed: ${data.detail || data.error || 'Not found'}`);
      }
    } catch (err) {
      showToast?.(`⚠️ Network error fetching cover: ${err.message}`);
    } finally {
      setProcessingTrackId(null);
      setProcessingAction(null);
    }
  };

  // Full Re-download (Audio + Cover)
  const handleFullRepair = async (track) => {
    setProcessingTrackId(track.id);
    setProcessingAction('full');
    showToast?.(`⚡ Running full repair (Audio + Cover) for "${track.title}"...`, 3500);

    try {
      const res = await fetch(`/api/dev/repair/track/${track.id}/full`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.(`✅ Full repair completed for "${track.title}"!`, 4500);
        fetchAudit();
        setSearchResults((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  duration: data.audio?.new_duration || t.duration,
                  has_cover: true,
                  cover_url: `/api/covers/${track.album_id}?v=${Date.now()}`,
                  is_suspicious: false,
                }
              : t
          )
        );
      } else {
        showToast?.(`⚠️ Repair notice: ${data.audio?.error || data.cover?.error || 'Partial failure'}`);
      }
    } catch (err) {
      showToast?.(`⚠️ Network error: ${err.message}`);
    } finally {
      setProcessingTrackId(null);
      setProcessingAction(null);
    }
  };

  // Trigger Batch Audio Repair
  const handleBatchAudio = async () => {
    try {
      const res = await fetch('/api/dev/repair/batch-audio', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.started) {
        setIsBatchRunning(true);
        showToast?.('🚀 Batch audio repair job started in background');
      } else {
        showToast?.(data.message || 'Job already running');
      }
    } catch (err) {
      showToast?.('⚠️ Failed to start batch job');
    }
  };

  // Trigger Batch Covers Fetch
  const handleBatchCovers = async () => {
    try {
      const res = await fetch('/api/dev/repair/batch-covers', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.started) {
        setIsBatchRunning(true);
        showToast?.('🚀 Batch 1400px cover fetch started in background');
      } else {
        showToast?.(data.message || 'Job already running');
      }
    } catch (err) {
      showToast?.('⚠️ Failed to start batch job');
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Studio Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-surface-elevated via-surface-panel to-surface-island border border-border-medium flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0 shadow-lg">
            <Wrench size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Track & Artwork Repair Studio
              </h3>
              <span className="text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded-full uppercase">
                Dev Engine
              </span>
            </div>
            <p className="text-xs text-content-secondary mt-0.5">
              Re-download full-length audio via iTunes canonical matching & pull 1400x1400 artwork
            </p>
          </div>
        </div>

        <button
          onClick={fetchAudit}
          disabled={isLoadingAudit}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-subtle flex items-center justify-center gap-2 transition active:scale-95 shrink-0"
        >
          <RefreshCw size={13} className={isLoadingAudit ? 'animate-spin text-brand-400' : ''} />
          <span>Refresh Audit</span>
        </button>
      </div>

      {/* Audit Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Suspicious Audio */}
        <div 
          onClick={() => setActiveTab('broken_audio')}
          className={`p-4 rounded-xl border transition cursor-pointer select-none ${
            activeTab === 'broken_audio'
              ? 'bg-amber-500/15 border-amber-500/40 shadow-lg'
              : 'bg-surface-panel/60 border-border-subtle hover:bg-surface-elevated'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-1.5">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Suspicious Audio</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-content-muted">Issues</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-white">
              {auditData ? auditData.broken_audio_count : '...'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBatchAudio();
              }}
              disabled={isBatchRunning || !auditData || auditData.broken_audio_count === 0}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition active:scale-95 disabled:opacity-40"
            >
              Repair All
            </button>
          </div>
          <p className="text-[11px] text-content-secondary mt-1">
            Preview-capped (~180s/30s) or truncated rips
          </p>
        </div>

        {/* Card 2: Missing Covers */}
        <div 
          onClick={() => setActiveTab('missing_covers')}
          className={`p-4 rounded-xl border transition cursor-pointer select-none ${
            activeTab === 'missing_covers'
              ? 'bg-brand-500/15 border-brand-500/40 shadow-lg'
              : 'bg-surface-panel/60 border-border-subtle hover:bg-surface-elevated'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-brand-400 font-semibold mb-1.5">
            <span className="flex items-center gap-1.5">
              <ImageIcon size={14} />
              <span>Missing Album Art</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-content-muted">Albums</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-white">
              {auditData ? auditData.missing_covers_count : '...'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBatchCovers();
              }}
              disabled={isBatchRunning || !auditData || auditData.missing_covers_count === 0}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-brand-500 hover:bg-brand-400 text-black transition active:scale-95 disabled:opacity-40"
            >
              Fetch 1400px
            </button>
          </div>
          <p className="text-[11px] text-content-secondary mt-1">
            Albums currently rendering fallback SVG vinyls
          </p>
        </div>

        {/* Card 3: Engine Verification Status */}
        <div className="p-4 rounded-xl bg-surface-panel/60 border border-border-subtle">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mb-1.5">
            <ShieldCheck size={14} />
            <span>Integrity Pipeline</span>
          </div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            <span>Canonical Validation</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
              FFmpeg OK
            </span>
          </div>
          <p className="text-[11px] text-content-secondary mt-1 leading-relaxed">
            Strict ±6s duration matching & stream frame check
          </p>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-border-medium pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'search'
              ? 'bg-white/15 text-white font-bold'
              : 'text-content-secondary hover:text-white hover:bg-white/5'
          }`}
        >
          <Search size={14} />
          <span>Inspect & Search Tracks</span>
        </button>

        <button
          onClick={() => setActiveTab('broken_audio')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'broken_audio'
              ? 'bg-amber-500 text-black font-bold shadow-md'
              : 'text-content-secondary hover:text-white hover:bg-white/5'
          }`}
        >
          <Music size={14} />
          <span>Detected Audio Issues ({auditData?.broken_audio_count || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('missing_covers')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'missing_covers'
              ? 'bg-brand-500 text-black font-bold shadow-md'
              : 'text-content-secondary hover:text-white hover:bg-white/5'
          }`}
        >
          <ImageIcon size={14} />
          <span>Missing Covers ({auditData?.missing_covers_count || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-2 ml-auto ${
            activeTab === 'logs'
              ? 'bg-white/15 text-white font-bold'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          <span>Activity Log</span>
          {isBatchRunning && <Loader2 size={12} className="animate-spin text-brand-400" />}
        </button>
      </div>

      {/* Tab Content: Search & Targeted Inspector */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search any song or artist to inspect and re-download (e.g. Dua Lipa, Houdini)..."
              className="w-full bg-surface-panel hover:bg-surface-elevated focus:bg-surface-elevated text-white pl-10 pr-10 py-2.5 rounded-xl text-xs font-medium outline-none border border-border-subtle focus:border-brand-500/50 transition placeholder-content-muted"
            />
            {isSearching && (
              <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-brand-400" />
            )}
          </div>

          {/* Search Results List */}
          <div className="space-y-2">
            {searchResults.map((track) => {
              const isWorking = processingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className="p-3.5 rounded-xl bg-surface-panel/50 border border-border-subtle hover:border-border-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Cover Thumbnail */}
                    <div className="w-11 h-11 rounded-lg bg-surface-elevated overflow-hidden shrink-0 border border-border-subtle relative group">
                      {track.has_cover && track.cover_url ? (
                        <img 
                          src={track.cover_url} 
                          alt="" 
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-110" 
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-content-muted">
                          <Disc3 size={18} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {track.title}
                        </span>
                        {track.is_suspicious && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            Suspicious
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-content-secondary truncate mt-0.5">
                        {track.artist} • <span className="text-content-muted">{track.album}</span>
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-content-muted mt-1 font-mono">
                        <span>{formatSeconds(track.duration)}</span>
                        <span>•</span>
                        <span className="uppercase">{track.file_format || 'MP3'}</span>
                        {track.bitrate && (
                          <>
                            <span>•</span>
                            <span>{Math.round(track.bitrate / 1000)}k</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleRedownloadAudio(track)}
                      disabled={isWorking}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-content-primary border border-border-subtle flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      title="Re-download audio using canonical duration matching"
                    >
                      {isWorking && processingAction === 'audio' ? (
                        <Loader2 size={12} className="animate-spin text-brand-400" />
                      ) : (
                        <Music size={12} className="text-brand-400" />
                      )}
                      <span>Redownload Audio</span>
                    </button>

                    <button
                      onClick={() => handleRedownloadCover(track)}
                      disabled={isWorking}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-content-primary border border-border-subtle flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      title="Fetch 1400x1400 cover art from iTunes"
                    >
                      {isWorking && processingAction === 'cover' ? (
                        <Loader2 size={12} className="animate-spin text-amber-400" />
                      ) : (
                        <ImageIcon size={12} className="text-amber-400" />
                      )}
                      <span>Redownload Cover</span>
                    </button>

                    <button
                      onClick={() => handleFullRepair(track)}
                      disabled={isWorking}
                      className="p-1.5 rounded-lg text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-black transition active:scale-95 disabled:opacity-50"
                      title="Full Re-download (Audio + Cover)"
                    >
                      {isWorking && processingAction === 'full' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
              <div className="p-8 text-center text-xs text-content-secondary bg-surface-panel/20 rounded-xl border border-dashed border-border-subtle">
                No tracks found matching "{searchQuery}".
              </div>
            )}

            {!searchQuery.trim() && (
              <div className="p-8 text-center text-xs text-content-muted bg-surface-panel/20 rounded-xl border border-dashed border-border-subtle">
                Type any artist or song name above to inspect audio duration and trigger repairs.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Broken Audio List */}
      {activeTab === 'broken_audio' && (
        <div className="space-y-3">
          {auditData?.broken_audio?.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-white tracking-tight">
                    {item.title}
                  </h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                </div>
                <p className="text-[11px] text-content-secondary mt-0.5">
                  {item.artist} • <span className="text-content-muted">{item.album}</span>
                </p>
                <div className="text-[10px] text-amber-400 font-mono mt-1">
                  Reason: {item.reason} (Duration: {formatSeconds(item.duration)})
                </div>
              </div>

              <button
                onClick={() => handleRedownloadAudio(item)}
                disabled={processingTrackId === item.id}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition active:scale-95 shrink-0 self-end sm:self-center"
              >
                {processingTrackId === item.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                <span>Repair Audio</span>
              </button>
            </div>
          ))}

          {auditData?.broken_audio_count === 0 && (
            <div className="p-8 text-center text-xs text-emerald-400 font-semibold bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              <span>Zero broken or preview-capped audio tracks detected! Library is pristine.</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Missing Covers List */}
      {activeTab === 'missing_covers' && (
        <div className="space-y-3">
          {auditData?.missing_covers?.slice(0, 40).map((album) => (
            <div
              key={album.id}
              className="p-3.5 rounded-xl bg-surface-panel/50 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <h4 className="text-xs font-bold text-white tracking-tight">
                  {album.title}
                </h4>
                <p className="text-[11px] text-content-secondary mt-0.5">
                  {album.artist} • <span className="text-content-muted">{album.track_count} tracks</span>
                </p>
              </div>

              <button
                onClick={async () => {
                  try {
                    showToast?.(`🖼️ Fetching 1400px cover for "${album.title}"...`, 3000);
                    const res = await fetch(`/api/dev/repair/album/${album.id}/cover`, {
                      method: 'POST',
                      credentials: 'include',
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      showToast?.(`✅ 1400px Cover applied to "${album.title}"!`, 4000);
                      fetchAudit();
                    } else {
                      showToast?.(`⚠️ Cover fetch failed: ${data.detail || 'Not found'}`);
                    }
                  } catch (e) {
                    showToast?.('⚠️ Network error fetching cover');
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black flex items-center gap-1.5 transition active:scale-95 shrink-0 self-end sm:self-center"
              >
                <ImageIcon size={12} />
                <span>Fetch 1400px Cover</span>
              </button>
            </div>
          ))}

          {auditData?.missing_covers_count === 0 && (
            <div className="p-8 text-center text-xs text-emerald-400 font-semibold bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              <span>All albums in the library have high-resolution cover artwork!</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Activity Log */}
      {activeTab === 'logs' && (
        <div className="p-4 rounded-xl bg-black/60 border border-border-subtle font-mono text-[11px] text-content-secondary space-y-1.5 max-h-72 overflow-y-auto">
          {workerStatus?.log && workerStatus.log.length > 0 ? (
            workerStatus.log.map((entry, idx) => (
              <div key={idx} className="leading-relaxed">
                {entry}
              </div>
            ))
          ) : (
            <div className="text-content-muted text-center py-6">
              No recent repair operations logged yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
