import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RefreshCw, AlertCircle, Sparkles, Check } from 'lucide-react';
import { SpotifyIcon } from './SpotifyIcon';

export const ImportSpotifyModal = ({ isOpen, onClose, onImportSpotify }) => {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [autoDownload, setAutoDownload] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSpotifyUrl('');
      setAutoDownload(true);
      setAutoSync(true);
      setIsSubmitting(false);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 60);
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

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUrl = spotifyUrl.trim();
    if (!cleanUrl || isSubmitting) return;

    if (!cleanUrl.includes('spotify.com/playlist') && !cleanUrl.startsWith('spotify:playlist:')) {
      setError('Please enter a valid Spotify playlist link (e.g. https://open.spotify.com/playlist/...)');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onImportSpotify({
        url: cleanUrl,
        auto_download: autoDownload,
        auto_sync: autoSync,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to import playlist. Make sure the playlist is public.');
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
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-white select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#121212] flex items-center justify-center text-[#1DB954] border border-white/5 shadow-inner">
              <SpotifyIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Import Spotify Playlist</h3>
              <p className="text-[11px] text-[#888]">Auto-match local tracks & download missing songs</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full hover:bg-[#282828] text-[#b3b3b3] hover:text-white flex items-center justify-center transition"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Spotify Playlist Link
            </label>
            <input
              ref={inputRef}
              type="text"
              value={spotifyUrl}
              onChange={(e) => {
                setSpotifyUrl(e.target.value);
                if (error) setError('');
              }}
              placeholder="https://open.spotify.com/playlist/..."
              className="w-full bg-[#121212] border border-white/10 focus:border-[#1DB954] text-white text-sm px-3.5 py-2.5 rounded-lg outline-none transition placeholder-[#555]"
            />
            <p className="text-[11px] text-[#777] mt-1">
              Paste any public Spotify playlist URL or Spotify URI
            </p>
          </div>

          <div className="bg-[#141414] border border-white/5 rounded-xl p-3 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="mt-0.5 accent-[#1DB954] rounded cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-white group-hover:text-[#1DB954] transition flex items-center gap-1.5">
                  <Download size={13} className="text-[#1DB954]" />
                  Auto-download missing songs
                </span>
                <p className="text-[11px] text-[#888] mt-0.5">
                  Downloads high-quality 320kbps MP3s with full tags & cover art into your library.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group pt-1 border-t border-white/5">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="mt-0.5 accent-[#1DB954] rounded cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-white group-hover:text-[#1DB954] transition flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-[#1DB954]" />
                  Keep in sync with Spotify
                </span>
                <p className="text-[11px] text-[#888] mt-0.5">
                  Watches the playlist every 6 hours and automatically downloads newly added songs.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-[11px] text-[#9be4b3]">
            <Sparkles size={14} className="shrink-0 text-[#1DB954]" />
            <span>Downloaded tracks are monitored for silent lossless FLAC upgrades.</span>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-[#b3b3b3] hover:text-white rounded-full hover:bg-[#282828] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!spotifyUrl.trim() || isSubmitting}
              className="px-5 py-2 text-xs font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition shadow flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <SpotifyIcon size={14} />
                  <span>Import Playlist</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
