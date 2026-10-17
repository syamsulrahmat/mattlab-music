import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Clipboard, Check, Loader2, Music, Sparkles } from 'lucide-react';

export const EditLyricsModal = ({ isOpen, track, onClose, onLyricsSaved, initialLyrics = null }) => {
  const [lyricsText, setLyricsText] = useState('');
  const [isSynced, setIsSynced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const textareaRef = useRef(null);

  // When modal opens for a track, load existing lyrics if not provided
  useEffect(() => {
    if (!isOpen || !track?.id) {
      setLyricsText('');
      setError(null);
      return;
    }

    if (initialLyrics !== null && initialLyrics !== undefined) {
      const text = typeof initialLyrics === 'string' ? initialLyrics : (initialLyrics.syncedLyrics || initialLyrics.plainLyrics || '');
      setLyricsText(text);
      const hasTimestamps = /\[\d{2}:\d{2}/.test(text);
      setIsSynced(hasTimestamps);
      setTimeout(() => textareaRef.current?.focus(), 100);
      return;
    }

    // Attempt to load from localStorage cache first
    const cacheKey = `lyrics_cache_${track.id}`;
    let loaded = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const text = parsed.syncedLyrics || parsed.plainLyrics || '';
        if (text) {
          setLyricsText(text);
          setIsSynced(Boolean(parsed.syncedLyrics));
          loaded = true;
        }
      }
    } catch (_) {}

    if (!loaded) {
      setIsLoading(true);
      fetch(`/api/lyrics/${track.id}`)
        .then((res) => res.json())
        .then((data) => {
          const text = data.syncedLyrics || data.plainLyrics || '';
          setLyricsText(text);
          setIsSynced(Boolean(data.syncedLyrics || /\[\d{2}:\d{2}/.test(text)));
        })
        .catch(() => {
          setLyricsText('');
        })
        .finally(() => {
          setIsLoading(false);
          setTimeout(() => textareaRef.current?.focus(), 100);
        });
    } else {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, track?.id, initialLyrics]);

  // Global ESC key to close
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

  // Auto-detect synced format when user changes text
  const handleTextChange = (e) => {
    const val = e.target.value;
    setLyricsText(val);
    if (/\[\d{2}:\d{2}/.test(val)) {
      setIsSynced(true);
    }
    if (error) setError(null);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLyricsText(text);
        if (/\[\d{2}:\d{2}/.test(text)) {
          setIsSynced(true);
        }
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2000);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!lyricsText.trim()) {
      setError('Please enter or paste lyrics before saving.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/lyrics/${track.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lyrics: lyricsText.trim(),
          is_synced: isSynced,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save lyrics.');
      }

      const savedData = await res.json();

      // Update local storage cache
      try {
        localStorage.setItem(`lyrics_cache_${track.id}`, JSON.stringify(savedData));
      } catch (_) {}

      onLyricsSaved?.(savedData, track.id);
      onClose();
    } catch (err) {
      console.error('Error saving lyrics:', err);
      setError(err.message || 'Failed to save lyrics.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !track) return null;

  const lineCount = lyricsText ? lyricsText.split('\n').filter((l) => l.trim()).length : 0;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface-elevated border border-border-medium rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={track.cover_url || '/api/covers/0'}
              alt=""
              className="w-10 h-10 rounded-md object-cover bg-surface-island shrink-0 border border-border-subtle"
            />
            <div className="truncate">
              <h3 className="font-bold text-white text-base truncate flex items-center gap-2">
                <span>Edit / Add Lyrics</span>
              </h3>
              <p className="text-xs text-content-secondary truncate">
                {track.title} • {track.artist_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition shrink-0"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Format Selector & Clipboard Helper */}
        <div className="flex items-center justify-between gap-2 py-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 bg-surface-island p-1 rounded-lg border border-border-medium text-xs font-semibold">
            <button
              type="button"
              onClick={() => setIsSynced(true)}
              className={`px-3 py-1 rounded-md transition ${
                isSynced
                  ? 'bg-brand-500 text-black font-bold shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Synced LRC [00:00.00]
            </button>
            <button
              type="button"
              onClick={() => setIsSynced(false)}
              className={`px-3 py-1 rounded-md transition ${
                !isSynced
                  ? 'bg-brand-500 text-black font-bold shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Plain Lyrics
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-island hover:bg-surface-hover border border-border-medium text-content-secondary hover:text-white transition"
              title="Paste from clipboard"
            >
              {copiedSuccess ? <Check size={13} className="text-brand-500" /> : <Clipboard size={13} />}
              <span>{copiedSuccess ? 'Pasted!' : 'Paste Clipboard'}</span>
            </button>
            {lyricsText && (
              <button
                type="button"
                onClick={() => setLyricsText('')}
                className="px-2 py-1 rounded-md text-content-subtle hover:text-red-400 transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Textarea Area */}
        <div className="flex-1 min-h-[220px] flex flex-col relative overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-content-secondary">
              <Loader2 size={24} className="animate-spin text-brand-500" />
              <p className="text-xs">Loading lyrics...</p>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={lyricsText}
              onChange={handleTextChange}
              placeholder={
                isSynced
                  ? `Paste timestamped .lrc lines here, for example:\n[00:12.50] First line of song\n[00:16.80] Second line of song\n[00:22.10] Chorus lyrics`
                  : `Paste plain text lyrics here.\nLines will scroll progressively with song playback.`
              }
              className="w-full flex-1 bg-surface-island border border-border-medium focus:border-brand-500 text-content-primary text-xs sm:text-sm font-mono p-3 rounded-xl outline-none resize-none leading-relaxed placeholder:text-content-subtle focus:ring-1 focus:ring-brand-500/30 transition"
              spellCheck={false}
            />
          )}
        </div>

        {/* Helper Note & Line Counter */}
        <div className="flex items-center justify-between text-[11px] text-content-muted pt-2.5 shrink-0">
          <div>
            {isSynced ? (
              <span>💡 Tip: Timestamps like <code className="bg-surface-island px-1 rounded text-brand-400">[01:23.45]</code> sync lyrics live to audio.</span>
            ) : (
              <span>Plain lyrics will be shown formatted and auto-scrolled.</span>
            )}
          </div>
          <div className="shrink-0 font-mono">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 mt-2 shrink-0">
            {error}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-border-subtle shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-content-secondary hover:text-white rounded-full hover:bg-surface-hover transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !lyricsText.trim()}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500 text-black text-xs font-bold px-5 py-2 rounded-full shadow-lg transition active:scale-95"
          >
            {isSaving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <FileText size={13} />
                <span>Save Lyrics</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
