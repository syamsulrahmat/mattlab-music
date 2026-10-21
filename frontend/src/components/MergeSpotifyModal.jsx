import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, RefreshCw, AlertCircle, Sparkles, Layers, ListPlus, Check, ExternalLink } from 'lucide-react';
import { SpotifyIcon } from './SpotifyIcon';

export const MergeSpotifyModal = ({ 
  isOpen, 
  onClose, 
  playlist, 
  onMergeSuccess 
}) => {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState(playlist?.sources || []);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSpotifyUrl('');
      setIsSubmitting(false);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 60);

      // Fetch latest sources
      if (playlist?.id) {
        setIsLoadingSources(true);
        fetch(`/api/spotify/sources/${playlist.id}`, { credentials: 'include' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.sources) setSources(data.sources);
          })
          .catch(() => {})
          .finally(() => setIsLoadingSources(false));
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, playlist?.id]);

  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  const detectedUrls = useMemo(() => {
    return spotifyUrl
      .split(/[\r\n,]+/)
      .map((u) => u.trim())
      .filter((u) => 
        u.includes('spotify.com/playlist') || u.startsWith('spotify:playlist:') ||
        u.includes('spotify.com/track') || u.startsWith('spotify:track:')
      );
  }, [spotifyUrl]);

  const playlistCount = detectedUrls.filter((u) => u.includes('/playlist/') || u.startsWith('spotify:playlist:')).length;
  const trackCount = detectedUrls.filter((u) => u.includes('/track/') || u.startsWith('spotify:track:')).length;

  if (!isOpen || !playlist) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (detectedUrls.length === 0) {
      setError('Please enter at least one valid Spotify playlist link.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/spotify/merge-sources/${playlist.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls: detectedUrls }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to merge Spotify playlists');
      }

      const result = await res.json();
      if (onMergeSuccess) {
        onMergeSuccess(result);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to merge playlists. Make sure the playlists are public.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-surface-elevated border border-border-medium rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-white select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-surface-island flex items-center justify-center text-brand-500 border border-border-subtle shadow-inner">
              <ListPlus size={20} />
            </div>
            <div>
              <h3 className="font-bold text-content-primary text-base">
                Add Spotify Playlists to "{playlist.name}"
              </h3>
              <p className="text-[11px] text-content-muted">
                Merge new Spotify playlist tracks with automatic deduplication
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Existing sources list */}
        {sources && sources.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-surface-island border border-border-subtle">
            <div className="text-[11px] font-semibold text-content-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers size={13} className="text-brand-500" />
              <span>Currently Merged Spotify Sources ({sources.length})</span>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {sources.map((s) => (
                <div key={s.id || s.spotify_id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 truncate">
                    <SpotifyIcon size={13} className="shrink-0 text-brand-500" />
                    <span className="font-medium text-white truncate">{s.name || s.spotify_id}</span>
                  </div>
                  {s.spotify_url && (
                    <a
                      href={s.spotify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-content-subtle hover:text-brand-400 p-0.5 rounded transition shrink-0"
                      title="Open on Spotify"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-content-secondary">
                New Spotify Link(s) to Merge (Playlists or Tracks)
              </label>
              {detectedUrls.length > 0 && (
                <span className="text-[11px] font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                  {playlistCount > 0 && trackCount > 0
                    ? `${playlistCount} playlist(s), ${trackCount} track(s)`
                    : trackCount > 0
                    ? `${trackCount} ${trackCount === 1 ? 'track link' : 'tracks detected'}`
                    : `${playlistCount} ${playlistCount === 1 ? 'playlist link' : 'links detected'}`}
                </span>
              )}
            </div>
            <textarea
              ref={inputRef}
              rows={3}
              value={spotifyUrl}
              onChange={(e) => {
                setSpotifyUrl(e.target.value);
                if (error) setError('');
              }}
              placeholder="Paste public Spotify playlist or track URLs (one per line)..."
              className="w-full bg-surface-island border border-border-medium focus:border-brand-500 text-content-primary text-xs px-3.5 py-2.5 rounded-lg outline-none transition placeholder:text-content-subtle font-mono resize-none leading-relaxed"
            />
            <p className="text-[11px] text-content-subtle mt-1">
              Paste public Spotify playlist or individual track URLs. Any tracks already in this playlist will be skipped automatically!
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300">
            <Sparkles size={16} className="shrink-0 text-brand-400 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Zero Duplicate Guarantee</span>
              <p className="text-[11px] text-brand-300/80 mt-0.5 leading-normal">
                Songs with identical titles, remasters, or matching tracks already in "{playlist.name}" will be automatically deduplicated.
              </p>
            </div>
          </div>

          {/* Warning if converting a single Spotify chart playlist to a custom collection */}
          {(playlist.spotify_id || playlist.auto_sync === 1) && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-200">Convert to Custom Collection</span>
                <p className="text-[11px] text-amber-300/80 mt-0.5 leading-normal">
                  Adding Spotify playlists will turn “{playlist.name}” into a personal <strong>Custom Collection</strong> and disable automatic Spotify chart syncing, preserving your custom track order and edits.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-content-secondary hover:text-white rounded-full hover:bg-surface-hover transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={detectedUrls.length === 0 || isSubmitting}
              className="px-5 py-2 text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition shadow flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Merging Tracks...</span>
                </>
              ) : (
                <>
                  <ListPlus size={14} />
                  <span>
                    {(playlist.spotify_id || playlist.auto_sync === 1)
                      ? detectedUrls.length > 1
                        ? `Convert & Merge ${detectedUrls.length} Playlists`
                        : 'Convert & Merge Playlist'
                      : detectedUrls.length > 1
                      ? `Merge ${detectedUrls.length} Playlists`
                      : 'Merge Playlist'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
