import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Download, RefreshCw, AlertCircle, Sparkles, Check, Layers, ListPlus, Lock } from 'lucide-react';
import { SpotifyIcon } from './SpotifyIcon';

export const ImportSpotifyModal = ({ 
  isOpen, 
  onClose, 
  onImportSpotify,
  playlists: propPlaylists = []
}) => {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [destination, setDestination] = useState('new'); // 'new', 'library', or 'playlist:<id>'
  const [existingPlaylists, setExistingPlaylists] = useState(propPlaylists || []);
  const [autoDownload, setAutoDownload] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (propPlaylists && propPlaylists.length > 0) {
      setExistingPlaylists(propPlaylists);
    }
  }, [propPlaylists]);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSpotifyUrl('');
      setCustomName('');
      setDestination('new');
      setAutoDownload(true);
      setAutoSync(true);
      setIsSubmitting(false);
      setError('');
      setErrorCode('');
      setTimeout(() => inputRef.current?.focus(), 60);

      // Fetch user's playlists for destination dropdown (handling { items: [...] })
      fetch('/api/playlists', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.items || []);
          if (list.length > 0) setExistingPlaylists(list);
        })
        .catch(() => {});
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

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
  const isTracksOnly = trackCount > 0 && playlistCount === 0;
  const isMultiCollection = detectedUrls.length > 1 || trackCount > 0;

  // If detected links are strictly tracks, force destination off 'new' (default to 'library')
  useEffect(() => {
    if (isTracksOnly && destination === 'new') {
      setDestination('library');
    }
  }, [isTracksOnly, destination]);

  const availablePlaylists = existingPlaylists.length > 0 ? existingPlaylists : propPlaylists;

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (detectedUrls.length === 0) {
      setError('Please enter at least one valid Spotify playlist or track link.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setErrorCode('');

    const targetPlaylistId = destination.startsWith('playlist:')
      ? parseInt(destination.replace('playlist:', ''), 10)
      : null;
    const destType = targetPlaylistId ? 'playlist' : destination;

    try {
      await onImportSpotify({
        urls: detectedUrls,
        url: detectedUrls[0],
        custom_name: destination === 'new' && !isTracksOnly ? (customName.trim() || undefined) : undefined,
        auto_download: autoDownload,
        auto_sync: isMultiCollection || destination !== 'new' ? false : autoSync,
        destination: destType,
        target_playlist_id: targetPlaylistId,
      });
      onClose();
    } catch (err) {
      if (err.code === 'SPOTIFY_PRIVATE') {
        setErrorCode('SPOTIFY_PRIVATE');
        setError('Playlist is Private. Spotify blocks external access to private playlists. Temporarily switch it to Public to import your tracks.');
      } else if (err.code === 'SPOTIFY_EMPTY') {
        setErrorCode('SPOTIFY_EMPTY');
        setError('This Spotify playlist has no tracks to import.');
      } else if (err.code === 'SPOTIFY_NOT_FOUND') {
        setErrorCode('SPOTIFY_NOT_FOUND');
        setError('Spotify playlist not found or has been deleted.');
      } else {
        setErrorCode('');
        setError(err.message || 'Failed to import Spotify item(s). Make sure the links are public.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  const targetPlaylistId = destination.startsWith('playlist:')
    ? parseInt(destination.replace('playlist:', ''), 10)
    : null;

  const selectedPlaylist = targetPlaylistId
    ? availablePlaylists.find((p) => String(p.id) === String(targetPlaylistId))
    : null;

  const selectedPlaylistName = selectedPlaylist?.name || 'Selected Playlist';

  const isNameDisabled = isTracksOnly || destination !== 'new';

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-surface-elevated border border-border-medium rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-white select-none max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-surface-island flex items-center justify-center text-brand-500 border border-border-subtle shadow-inner">
              <SpotifyIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-content-primary text-base">
                {isTracksOnly
                  ? 'Import Spotify Tracks'
                  : isMultiCollection
                  ? 'Import Spotify Collection'
                  : 'Import Spotify Playlist'}
              </h3>
              <p className="text-[11px] text-content-muted">
                {isTracksOnly
                  ? 'Import individual tracks directly to your library or an existing playlist'
                  : isMultiCollection 
                  ? 'Merge & deduplicate multiple playlists into one personal collection' 
                  : 'Auto-match local tracks & download missing songs'}
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
          <div className={`mb-4 p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
            errorCode === 'SPOTIFY_PRIVATE'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          } text-xs`}>
            {errorCode === 'SPOTIFY_PRIVATE' ? (
              <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <Lock size={13} />
              </div>
            ) : (
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">
              {errorCode === 'SPOTIFY_PRIVATE' ? (
                <>
                  <div className="font-bold text-amber-300 text-xs mb-0.5">Playlist is Private</div>
                  <p className="text-[11px] text-amber-200/90">
                    Spotify blocks external access to private playlists. Temporarily switch it to <strong className="text-white">Public</strong> to import your tracks.
                  </p>
                </>
              ) : (
                <span>{error}</span>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Link textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-content-secondary">
                Spotify Link(s) (Playlists or Tracks)
              </label>
              {detectedUrls.length > 0 && (
                <span className="text-[11px] font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                  {playlistCount > 0 && trackCount > 0
                    ? `${playlistCount} playlist(s), ${trackCount} track(s)`
                    : trackCount > 0
                    ? `${trackCount} ${trackCount === 1 ? 'track link' : 'tracks detected'}`
                    : `${playlistCount} ${playlistCount === 1 ? 'playlist' : 'playlists detected'}`}
                </span>
              )}
            </div>
            <textarea
              ref={inputRef}
              rows={isMultiCollection || spotifyUrl.includes('\n') ? 3 : 2}
              value={spotifyUrl}
              onChange={(e) => {
                setSpotifyUrl(e.target.value);
                if (error) setError('');
              }}
              placeholder="Paste Spotify playlist or individual track links (one per line)..."
              className="w-full bg-surface-island border border-border-medium focus:border-brand-500 text-content-primary text-xs px-3.5 py-2.5 rounded-lg outline-none transition placeholder:text-content-subtle font-mono resize-none leading-relaxed"
            />
            <p className="text-[11px] text-content-subtle mt-1">
              Paste public Spotify playlist or individual song URLs. You can combine multiple links with automatic deduplication!
            </p>
          </div>

          {/* Destination Selector Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5 flex items-center justify-between">
              <span>Destination</span>
              {isTracksOnly && (
                <span className="text-[10px] text-amber-400 font-normal">Track links import to library or existing playlist</span>
              )}
            </label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-surface-island border border-border-medium focus:border-brand-500 text-content-primary text-xs px-3 py-2.5 rounded-lg outline-none transition cursor-pointer"
            >
              {!isTracksOnly && (
                <option value="new">Create New Playlist</option>
              )}
              <option value="library">Import to Library Only (No playlist)</option>
              {availablePlaylists.length > 0 && (
                <optgroup label="Merge into Existing Playlist">
                  {availablePlaylists.map((pl) => (
                    <option key={pl.id} value={`playlist:${pl.id}`}>
                      {pl.name} {pl.track_count !== undefined ? `(${pl.track_count} tracks)` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Collection / Custom Playlist Name (Greyed out when disabled, never hidden) */}
          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5 flex items-center justify-between">
              <span className={isNameDisabled ? 'text-content-muted' : 'text-content-secondary'}>
                {isMultiCollection ? 'Collection Playlist Name' : 'Custom Name (Optional)'}
              </span>
              {isNameDisabled && (
                <span className="text-[10px] text-content-muted font-normal">
                  {isTracksOnly ? 'Disabled for track links' : 'Disabled for this destination'}
                </span>
              )}
            </label>
            <input
              type="text"
              value={customName}
              disabled={isNameDisabled}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={
                isTracksOnly
                  ? "Disabled — track links import to library or existing playlist"
                  : destination === 'library'
                  ? "Disabled — importing directly to library without playlist"
                  : destination.startsWith('playlist:')
                  ? `Disabled — merging into ${selectedPlaylistName}`
                  : isMultiCollection
                  ? "e.g. Best of Eminem"
                  : "Leave blank to use Spotify's title"
              }
              className={`w-full text-xs px-3.5 py-2.5 rounded-lg outline-none transition ${
                isNameDisabled
                  ? 'bg-surface-island/40 border border-border-subtle/40 text-content-muted cursor-not-allowed opacity-50 select-none'
                  : 'bg-surface-island border border-border-medium focus:border-brand-500 text-content-primary placeholder:text-content-subtle'
              }`}
            />
          </div>

          {destination === 'library' && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-island border border-border-subtle text-xs text-content-secondary">
              <Download size={15} className="shrink-0 text-brand-500 mt-0.5" />
              <span>
                Tracks will be downloaded directly to your music library (<strong className="text-white">/music</strong>) without creating a standalone playlist.
              </span>
            </div>
          )}

          {destination.startsWith('playlist:') && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-island border border-border-subtle text-xs text-content-secondary">
              <ListPlus size={15} className="shrink-0 text-brand-500 mt-0.5" />
              <span>
                Tracks will be appended directly into <strong className="text-white">{selectedPlaylistName}</strong> with automatic duplicate skipping.
              </span>
            </div>
          )}

          {destination.startsWith('playlist:') && selectedPlaylist && (selectedPlaylist.spotify_id || selectedPlaylist.auto_sync === 1) && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-200">Convert to Custom Collection</span>
                <p className="text-[11px] text-amber-300/80 mt-0.5 leading-normal">
                  Merging into “{selectedPlaylist.name}” will turn it into a personal <strong>Custom Collection</strong> and disable automatic Spotify chart syncing, preserving your custom track order and edits.
                </p>
              </div>
            </div>
          )}

          {isMultiCollection && destination === 'new' && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300">
              <Layers size={16} className="shrink-0 text-brand-400 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Smart Deduplication Active</span>
                <p className="text-[11px] text-brand-300/80 mt-0.5 leading-normal">
                  Identical tracks and remastered variants across your {detectedUrls.length} links will be merged so each song appears only once.
                </p>
              </div>
            </div>
          )}

          <div className="bg-surface-island border border-border-subtle rounded-xl p-3 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="mt-0.5 accent-brand-500 rounded cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-content-primary group-hover:text-brand-400 transition flex items-center gap-1.5">
                  <Download size={13} className="text-brand-500" />
                  Auto-download missing songs
                </span>
                <p className="text-[11px] text-content-muted mt-0.5">
                  Downloads high-quality 320kbps MP3s with full tags & cover art into your library.
                </p>
              </div>
            </label>

            {!isMultiCollection && destination === 'new' ? (
              <label className="flex items-start gap-3 cursor-pointer group pt-1 border-t border-border-subtle">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-content-primary group-hover:text-brand-400 transition flex items-center gap-1.5">
                    <RefreshCw size={13} className="text-brand-500" />
                    Keep in sync with Spotify
                  </span>
                  <p className="text-[11px] text-content-muted mt-0.5">
                    Watches the playlist every 6 hours and automatically downloads newly added songs.
                  </p>
                </div>
              </label>
            ) : destination === 'new' ? (
              <div className="pt-2 border-t border-border-subtle text-[11px] text-content-muted flex items-start gap-2">
                <Check size={13} className="text-brand-500 shrink-0 mt-0.5" />
                <span>
                  Custom collections are personal curated playlists. Background auto-sync is disabled so your personal edits, custom ordering, and manual song choices are preserved.
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-[11px] text-brand-300">
            <Sparkles size={14} className="shrink-0 text-brand-500" />
            <span>Downloaded tracks are monitored for silent lossless FLAC upgrades.</span>
          </div>

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
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  {destination === 'library' ? (
                    <Download size={14} />
                  ) : destination.startsWith('playlist:') ? (
                    <ListPlus size={14} />
                  ) : isMultiCollection ? (
                    <Layers size={14} />
                  ) : (
                    <SpotifyIcon size={14} />
                  )}
                  <span>
                    {destination === 'library'
                      ? `Import to Library (${detectedUrls.length})`
                      : destination.startsWith('playlist:')
                      ? `Merge into Playlist (${detectedUrls.length})`
                      : isMultiCollection
                      ? `Merge & Import (${detectedUrls.length})`
                      : 'Import Playlist'}
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
