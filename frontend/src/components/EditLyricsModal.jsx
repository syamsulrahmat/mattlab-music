import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  FileText,
  Clipboard,
  Check,
  Loader2,
  Music,
  Sparkles,
  Play,
  Pause,
  Clock,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Volume2,
  FastForward,
  Rewind,
  Wand2,
  ListMusic,
  Code,
  Radio,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import {
  parseLrcToEditorLines,
  editorLinesToLrc,
  formatTimestamp,
  parseTimestampToSeconds,
  validateLrcChronology,
  sortEditorLinesChronologically,
  offsetEditorLines,
  stripLrcTimestamps,
  convertPlainToLrcPlaceholders,
} from '../utils/lyrics';

export const EditLyricsModal = ({ isOpen, track, onClose, onLyricsSaved, initialLyrics = null }) => {
  const { currentTrack, isPlaying, currentTime, duration, playTrack, togglePlay, seek } = usePlayer();

  // Mode: 'studio' (line-by-line interactive) | 'raw' (LRC text)
  const [editorMode, setEditorMode] = useState('studio');
  const [isSynced, setIsSynced] = useState(true);
  const [lines, setLines] = useState([]);
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Active / Selected lines
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  // Tap-to-Sync Karaoke mode
  const [isTapSyncMode, setIsTapSyncMode] = useState(false);

  // Offset tools panel
  const [showOffsetPanel, setShowOffsetPanel] = useState(false);
  const [offsetScope, setOffsetScope] = useState('all'); // 'all' | 'downward' | 'selection'
  const [customOffsetInput, setCustomOffsetInput] = useState('0.5');

  // History stack for Undo
  const [history, setHistory] = useState([]);

  const textareaRef = useRef(null);
  const studioListRef = useRef(null);
  const lineInputRefs = useRef({});

  const isCurrentTrackLoaded = currentTrack?.id === track?.id;

  // Push current lines to history before making mutations
  const pushHistory = useCallback((currentLines) => {
    setHistory((prev) => [...prev.slice(-20), JSON.stringify(currentLines)]);
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    try {
      const restored = JSON.parse(last);
      setLines(restored);
      setRawText(editorLinesToLrc(restored));
    } catch (_) {}
  }, [history]);

  // Load lyrics on open
  useEffect(() => {
    if (!isOpen || !track?.id) {
      setLines([]);
      setRawText('');
      setError(null);
      setSelectedIndices(new Set());
      setActiveLineIndex(0);
      setIsTapSyncMode(false);
      setHistory([]);
      return;
    }

    const initLyrics = (text, syncedFlag) => {
      setRawText(text);
      const hasTimestamps = /\[\d{1,2}:\d{2}/.test(text);
      const isSync = syncedFlag !== undefined ? syncedFlag : hasTimestamps;
      setIsSynced(isSync);
      const parsed = parseLrcToEditorLines(text);
      setLines(parsed.length > 0 ? parsed : [{ id: 'init_1', timestampStr: '', time: null, text: '', hasTimestamp: false }]);
      if (!isSync) {
        setEditorMode('raw');
      }
    };

    if (initialLyrics !== null && initialLyrics !== undefined) {
      const text = typeof initialLyrics === 'string' ? initialLyrics : (initialLyrics.syncedLyrics || initialLyrics.plainLyrics || '');
      const hasSynced = Boolean(initialLyrics?.syncedLyrics || /\[\d{1,2}:\d{2}/.test(text));
      initLyrics(text, hasSynced);
      return;
    }

    // Try localStorage cache
    const cacheKey = `lyrics_cache_${track.id}`;
    let loaded = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const text = parsed.syncedLyrics || parsed.plainLyrics || '';
        if (text) {
          initLyrics(text, Boolean(parsed.syncedLyrics));
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
          initLyrics(text, Boolean(data.syncedLyrics || /\[\d{1,2}:\d{2}/.test(text)));
        })
        .catch(() => {
          initLyrics('', false);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, track?.id, initialLyrics]);

  // Global hotkeys (Alt+S to stamp, Esc to close, Space in Tap-to-sync)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Escape closes modal
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      // Alt+S or F8: Stamp current playback time onto active line
      if ((e.altKey && (e.key === 's' || e.key === 'S')) || e.key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        handleStampActiveLine();
        return;
      }

      // Tap-to-Sync: Spacebar triggers stamp & advance
      if (isTapSyncMode && e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        e.stopPropagation();
        handleStampActiveLine();
        return;
      }

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (editorMode === 'studio') {
          e.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isTapSyncMode, editorMode, currentTime, activeLineIndex, lines]);

  // Auto-scroll studio list to active line
  useEffect(() => {
    if (editorMode === 'studio' && studioListRef.current) {
      const el = studioListRef.current.querySelector(`[data-line-index="${activeLineIndex}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeLineIndex, editorMode]);

  // Chronology validation
  const chronologyErrors = useMemo(() => {
    if (!isSynced) return [];
    return validateLrcChronology(lines);
  }, [lines, isSynced]);

  const errorLineIndices = useMemo(() => {
    return new Set(chronologyErrors.map((e) => e.lineIndex));
  }, [chronologyErrors]);

  // Sync state between Studio and Raw modes
  const handleSwitchMode = (newMode) => {
    if (newMode === editorMode) return;
    if (newMode === 'raw') {
      // Convert lines to raw text
      const text = editorLinesToLrc(lines);
      setRawText(text);
      setEditorMode('raw');
    } else {
      // Convert raw text to lines
      const parsed = parseLrcToEditorLines(rawText);
      setLines(parsed.length > 0 ? parsed : [{ id: 'line_1', timestampStr: '', time: null, text: '', hasTimestamp: false }]);
      setEditorMode('studio');
    }
  };

  // Sync format: Synced vs Plain
  const handleToggleSynced = (synced) => {
    setIsSynced(synced);
    if (!synced) {
      setEditorMode('raw');
      const plain = stripLrcTimestamps(rawText || editorLinesToLrc(lines));
      setRawText(plain);
    } else {
      if (!/\[\d{1,2}:\d{2}/.test(rawText)) {
        // Offer or convert plain to blank placeholders
        const withPlaceholders = convertPlainToLrcPlaceholders(rawText);
        setRawText(withPlaceholders);
        setLines(parseLrcToEditorLines(withPlaceholders));
      }
    }
  };

  // Raw text change handler
  const handleRawTextChange = (e) => {
    const val = e.target.value;
    setRawText(val);
    if (/\[\d{1,2}:\d{2}/.test(val)) {
      setIsSynced(true);
    }
    if (error) setError(null);
  };

  // Play audio preview for track
  const handleTogglePlayback = () => {
    if (!isCurrentTrackLoaded) {
      playTrack(track, [track], 0);
    } else {
      togglePlay();
    }
  };

  // Seek track audio to a specific timestamp
  const handleSeekToLine = (line) => {
    if (!line.hasTimestamp || line.time === null) return;
    if (!isCurrentTrackLoaded) {
      playTrack(track, [track], 0);
      setTimeout(() => seek(line.time), 150);
    } else {
      seek(line.time);
      if (!isPlaying) togglePlay();
    }
  };

  // Stamp current playback time onto active line & advance
  const handleStampActiveLine = () => {
    const timeToStamp = isCurrentTrackLoaded ? currentTime : 0;
    const stampStr = formatTimestamp(timeToStamp);

    pushHistory(lines);
    setLines((prev) => {
      const next = [...prev];
      if (activeLineIndex >= 0 && activeLineIndex < next.length) {
        next[activeLineIndex] = {
          ...next[activeLineIndex],
          time: timeToStamp,
          timestampStr: stampStr,
          hasTimestamp: true,
        };
      }
      return next;
    });

    // Advance to next line
    if (activeLineIndex < lines.length - 1) {
      setActiveLineIndex((prev) => prev + 1);
    }
  };

  // Micro-step timestamp for a specific line (+/- delta seconds)
  const handleNudgeLine = (index, deltaSeconds) => {
    pushHistory(lines);
    setLines((prev) => {
      const next = [...prev];
      const target = next[index];
      const baseTime = target.time !== null ? target.time : currentTime || 0;
      const newTime = Math.max(0, Math.round((baseTime + deltaSeconds) * 100) / 100);
      next[index] = {
        ...target,
        time: newTime,
        timestampStr: formatTimestamp(newTime),
        hasTimestamp: true,
      };
      return next;
    });
  };

  // Manual edit of a line timestamp string
  const handleTimestampTextChange = (index, newStr) => {
    setLines((prev) => {
      const next = [...prev];
      const target = next[index];
      const parsedTime = parseTimestampToSeconds(newStr);
      next[index] = {
        ...target,
        timestampStr: newStr,
        time: parsedTime !== null ? parsedTime : target.time,
        hasTimestamp: parsedTime !== null,
      };
      return next;
    });
  };

  // Text change for a specific line
  const handleLineTextChange = (index, newText) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text: newText };
      return next;
    });
  };

  // Add line below
  const handleAddLineBelow = (index) => {
    pushHistory(lines);
    setLines((prev) => {
      const next = [...prev];
      const prevLine = next[index];
      const newLine = {
        id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestampStr: prevLine?.timestampStr || '',
        time: prevLine?.time !== null ? prevLine.time : null,
        text: '',
        hasTimestamp: prevLine?.hasTimestamp || false,
      };
      next.splice(index + 1, 0, newLine);
      return next;
    });
    setActiveLineIndex(index + 1);
    setTimeout(() => lineInputRefs.current[index + 1]?.focus(), 50);
  };

  // Delete line
  const handleDeleteLine = (index) => {
    if (lines.length <= 1) return;
    pushHistory(lines);
    setLines((prev) => prev.filter((_, idx) => idx !== index));
    if (activeLineIndex >= lines.length - 1) {
      setActiveLineIndex(Math.max(0, lines.length - 2));
    }
  };

  // Apply Offset
  const handleApplyOffset = (offsetSeconds) => {
    pushHistory(lines);
    const selectedArr = Array.from(selectedIndices);
    const updated = offsetEditorLines(lines, offsetSeconds, offsetScope, activeLineIndex, selectedArr);
    setLines(updated);
    setRawText(editorLinesToLrc(updated));
  };

  // Auto-Fix Chronological Order
  const handleAutoFixChronology = () => {
    pushHistory(lines);
    const sorted = sortEditorLinesChronologically(lines);
    setLines(sorted);
    setRawText(editorLinesToLrc(sorted));
  };

  // Format & Clean LRC
  const handleFormatCleanLrc = () => {
    pushHistory(lines);
    const cleaned = lines.map((item) => ({
      ...item,
      timestampStr: item.hasTimestamp && item.time !== null ? formatTimestamp(item.time) : '',
      text: item.text.trim(),
    }));
    setLines(cleaned);
    setRawText(editorLinesToLrc(cleaned));
  };

  // Convert plain text to blank placeholders
  const handleConvertToSyncedPlaceholders = () => {
    pushHistory(lines);
    const updated = lines.map((item, idx) => ({
      ...item,
      time: 0,
      timestampStr: '[00:00.00]',
      hasTimestamp: true,
    }));
    setLines(updated);
    setIsSynced(true);
    setRawText(editorLinesToLrc(updated));
  };

  // Strip timestamps
  const handleStripTimestamps = () => {
    pushHistory(lines);
    const stripped = lines.map((item) => ({
      ...item,
      time: null,
      timestampStr: '',
      hasTimestamp: false,
    }));
    setLines(stripped);
    setIsSynced(false);
    setEditorMode('raw');
    setRawText(editorLinesToLrc(stripped));
  };

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawText(text);
        const hasTime = /\[\d{1,2}:\d{2}/.test(text);
        setIsSynced(hasTime);
        const parsed = parseLrcToEditorLines(text);
        setLines(parsed.length > 0 ? parsed : [{ id: 'paste_1', timestampStr: '', time: null, text: '', hasTimestamp: false }]);
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2000);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    const finalLyrics = editorMode === 'raw' ? rawText.trim() : editorLinesToLrc(lines).trim();

    if (!finalLyrics) {
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
          lyrics: finalLyrics,
          is_synced: isSynced,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save lyrics.');
      }

      const savedData = await res.json();

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

  const currentDisplayLines = editorMode === 'raw' ? rawText.split('\n') : lines;
  const timedLinesCount = lines.filter((l) => l.hasTimestamp && l.time !== null).length;

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface-elevated border border-border-medium rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-150 text-white flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-surface-island/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={track.cover_url || '/api/covers/0'}
              alt=""
              className="w-11 h-11 rounded-lg object-cover bg-surface-island shrink-0 border border-border-subtle shadow"
            />
            <div className="truncate">
              <h3 className="font-bold text-white text-base truncate flex items-center gap-2">
                <span>Lyrics & LRC Studio</span>
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  {isSynced ? 'Synced LRC' : 'Plain Lyrics'}
                </span>
              </h3>
              <p className="text-xs text-content-secondary truncate">
                {track.title} • {track.artist_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher: Studio vs Raw */}
            <div className="flex items-center bg-surface-island p-0.5 rounded-lg border border-border-medium text-xs font-medium">
              <button
                type="button"
                onClick={() => handleSwitchMode('studio')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                  editorMode === 'studio'
                    ? 'bg-brand-500 text-black font-bold shadow-sm'
                    : 'text-content-secondary hover:text-white'
                }`}
              >
                <ListMusic size={13} />
                <span>Studio</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                  editorMode === 'raw'
                    ? 'bg-brand-500 text-black font-bold shadow-sm'
                    : 'text-content-secondary hover:text-white'
                }`}
              >
                <Code size={13} />
                <span>Raw LRC</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Audio Scrubber & Live Stamping Toolbar ── */}
        <div className="bg-surface-island/70 border-b border-border-subtle px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          {/* Audio controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[260px]">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow transition active:scale-95 shrink-0"
              title={isPlaying && isCurrentTrackLoaded ? 'Pause' : 'Play track in player'}
            >
              {isPlaying && isCurrentTrackLoaded ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => isCurrentTrackLoaded && seek(Math.max(0, currentTime - 5))}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-white transition shrink-0"
              title="Rewind 5s"
            >
              <Rewind size={15} />
            </button>

            {/* Scrubber slider */}
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[11px] font-mono text-content-secondary shrink-0 w-12 text-right">
                {formatTimestamp(isCurrentTrackLoaded ? currentTime : 0).slice(1, 6)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || track.duration_seconds || 100}
                step="0.1"
                value={isCurrentTrackLoaded ? currentTime : 0}
                onChange={(e) => isCurrentTrackLoaded && seek(parseFloat(e.target.value))}
                className="w-full accent-brand-500 h-1.5 bg-surface-elevated rounded-lg cursor-pointer"
              />
              <span className="text-[11px] font-mono text-content-muted shrink-0 w-12">
                {formatTimestamp(duration || track.duration_seconds || 0).slice(1, 6)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => isCurrentTrackLoaded && seek(Math.min(duration || 999, currentTime + 5))}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-white transition shrink-0"
              title="Fast Forward 5s"
            >
              <FastForward size={15} />
            </button>
          </div>

          {/* Stamping Action Pill */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleStampActiveLine}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition active:scale-95"
              title="Record current audio time onto active line (Alt+S or F8)"
            >
              <Clock size={14} />
              <span>Stamp Current Time</span>
              <span className="text-[10px] bg-black/15 px-1 rounded font-mono font-normal">Alt+S</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTapSyncMode((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                isTapSyncMode
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/30 animate-pulse'
                  : 'bg-surface-elevated border-border-medium text-content-secondary hover:text-white'
              }`}
              title="Interactive Spacebar Tap-to-Sync Mode"
            >
              <Radio size={13} className={isTapSyncMode ? 'text-amber-400' : ''} />
              <span>{isTapSyncMode ? 'Tap-Sync: ON' : 'Tap-to-Sync'}</span>
            </button>
          </div>
        </div>

        {/* ── Tap-to-Sync Banner (When Active) ── */}
        {isTapSyncMode && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-5 py-2.5 flex items-center justify-between gap-3 text-amber-200 text-xs shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
              <div>
                <span className="font-bold text-white">Tap-to-Sync Mode Active: </span>
                <span>Play audio and press <kbd className="bg-surface-elevated px-1.5 py-0.5 rounded border border-amber-500/40 font-mono text-white">Spacebar</kbd> or click "Stamp" whenever the next line starts singing!</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-amber-300">
                Target Line: #{activeLineIndex + 1}
              </span>
              <button
                type="button"
                onClick={() => setIsTapSyncMode(false)}
                className="text-xs text-amber-400 hover:text-white underline ml-2"
              >
                Exit Tap Mode
              </button>
            </div>
          </div>
        )}

        {/* ── Secondary Quick Tools & Format Bar ── */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border-subtle bg-surface-island/20 text-xs shrink-0 flex-wrap gap-2">
          {/* Format switches & offset trigger */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-surface-island rounded-lg p-0.5 border border-border-medium text-[11px]">
              <button
                type="button"
                onClick={() => handleToggleSynced(true)}
                className={`px-2.5 py-1 rounded transition ${
                  isSynced ? 'bg-surface-elevated text-brand-400 font-bold' : 'text-content-secondary hover:text-white'
                }`}
              >
                Synced LRC
              </button>
              <button
                type="button"
                onClick={() => handleToggleSynced(false)}
                className={`px-2.5 py-1 rounded transition ${
                  !isSynced ? 'bg-surface-elevated text-brand-400 font-bold' : 'text-content-secondary hover:text-white'
                }`}
              >
                Plain Text
              </button>
            </div>

            {/* Time Offset Tool Button */}
            <button
              type="button"
              onClick={() => setShowOffsetPanel((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition ${
                showOffsetPanel
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-semibold'
                  : 'bg-surface-island hover:bg-surface-hover border-border-medium text-content-secondary hover:text-white'
              }`}
              title="Open Timing Offset Engine"
            >
              <Sliders size={12} />
              <span>Time Offset</span>
              {showOffsetPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {/* Undo button */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-island hover:bg-surface-hover border border-border-medium text-content-secondary hover:text-white disabled:opacity-40 transition"
              title="Undo last change (Ctrl+Z)"
            >
              <RotateCcw size={12} />
              <span>Undo</span>
            </button>
          </div>

          {/* Quick utility actions */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-island hover:bg-surface-hover border border-border-medium text-content-secondary hover:text-white transition"
              title="Paste from clipboard"
            >
              {copiedSuccess ? <Check size={12} className="text-brand-500" /> : <Clipboard size={12} />}
              <span>{copiedSuccess ? 'Pasted!' : 'Paste'}</span>
            </button>

            {isSynced && (
              <>
                <button
                  type="button"
                  onClick={handleFormatCleanLrc}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-island hover:bg-surface-hover border border-border-medium text-content-secondary hover:text-white transition"
                  title="Normalize timestamps to [mm:ss.xx] and clean whitespace"
                >
                  <Wand2 size={12} />
                  <span>Format LRC</span>
                </button>

                <button
                  type="button"
                  onClick={handleStripTimestamps}
                  className="px-2 py-1 rounded-md text-content-subtle hover:text-content-secondary transition"
                  title="Strip timestamps to convert to plain text"
                >
                  Strip Timestamps
                </button>
              </>
            )}

            {!isSynced && (
              <button
                type="button"
                onClick={handleConvertToSyncedPlaceholders}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition"
                title="Convert plain lyrics into stampable synced format"
              >
                <Plus size={12} />
                <span>Add Blank Timestamps</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Expandable Time Offset Panel ── */}
        {showOffsetPanel && (
          <div className="bg-surface-island/90 border-b border-border-subtle p-3 text-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Sliders size={13} className="text-brand-400" />
                <span>Offset Timing:</span>
              </span>

              {/* Quick Nudge Presets */}
              <div className="flex items-center gap-1">
                {[-1.0, -0.5, -0.1, 0.1, 0.5, 1.0].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => handleApplyOffset(delta)}
                    className="px-2 py-1 rounded bg-surface-elevated hover:bg-surface-hover border border-border-medium text-content-primary hover:text-brand-400 font-mono text-[11px] transition active:scale-95"
                    title={`Shift timestamps by ${delta > 0 ? `+${delta}` : delta}s`}
                  >
                    {delta > 0 ? `+${delta}s` : `${delta}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope selector */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-surface-elevated px-2 py-1 rounded-lg border border-border-medium">
                <span className="text-content-muted text-[11px]">Apply to:</span>
                <label className="flex items-center gap-1 cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="offsetScope"
                    value="all"
                    checked={offsetScope === 'all'}
                    onChange={() => setOffsetScope('all')}
                    className="accent-brand-500"
                  />
                  <span>All lines</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="offsetScope"
                    value="downward"
                    checked={offsetScope === 'downward'}
                    onChange={() => setOffsetScope('downward')}
                    className="accent-brand-500"
                  />
                  <span>Line #{activeLineIndex + 1} to end</span>
                </label>
              </div>

              {/* Custom input */}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.05"
                  value={customOffsetInput}
                  onChange={(e) => setCustomOffsetInput(e.target.value)}
                  className="w-16 px-2 py-1 bg-surface-elevated border border-border-medium rounded text-center font-mono text-[11px] text-white focus:outline-none focus:border-brand-500"
                  placeholder="0.5"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(customOffsetInput);
                    if (!isNaN(parsed)) handleApplyOffset(parsed);
                  }}
                  className="px-2 py-1 rounded bg-brand-500 text-black font-semibold text-[11px] hover:bg-brand-400 transition"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Chronological Safeguard Warning Banner ── */}
        {chronologyErrors.length > 0 && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-5 py-2.5 flex items-center justify-between gap-3 text-red-300 text-xs shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <AlertTriangle size={15} className="text-red-400 shrink-0" />
              <div className="truncate">
                <span className="font-bold text-white">Timing Order Error: </span>
                <span>{chronologyErrors[0].message}</span>
                {chronologyErrors.length > 1 && (
                  <span className="text-content-muted ml-1">
                    (+{chronologyErrors.length - 1} more issue{chronologyErrors.length > 2 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAutoFixChronology}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-white font-bold px-3 py-1 rounded border border-red-500/40 transition shrink-0 active:scale-95"
              title="Automatically sort lines chronologically"
            >
              <Wand2 size={13} className="text-brand-400" />
              <span>Auto-Fix Chronological Order</span>
            </button>
          </div>
        )}

        {/* ── Main Content Area ── */}
        <div className="flex-1 min-h-[300px] flex flex-col relative overflow-hidden bg-surface-island/10">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-content-secondary">
              <Loader2 size={24} className="animate-spin text-brand-500" />
              <p className="text-xs">Loading lyrics from library...</p>
            </div>
          ) : editorMode === 'studio' ? (
            /* ──── Studio Mode: Line-by-Line Table ──── */
            <div
              ref={studioListRef}
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5 font-sans divide-y divide-border-subtle/30"
            >
              {lines.map((line, index) => {
                const isActive = activeLineIndex === index;
                const isError = errorLineIndices.has(index);

                return (
                  <div
                    key={line.id}
                    data-line-index={index}
                    onClick={() => setActiveLineIndex(index)}
                    className={`pt-1.5 pb-1 px-2.5 rounded-xl transition flex items-center gap-2.5 group ${
                      isActive
                        ? 'bg-surface-elevated/90 ring-1 ring-brand-500/40 shadow-md'
                        : 'hover:bg-surface-island/40'
                    } ${isError ? 'border border-red-500/40 bg-red-500/5' : ''}`}
                  >
                    {/* Index Number */}
                    <span className="font-mono text-[11px] text-content-muted w-6 text-right shrink-0 select-none">
                      {index + 1}
                    </span>

                    {/* Play-to-line button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeekToLine(line);
                      }}
                      disabled={!line.hasTimestamp || line.time === null}
                      className="w-7 h-7 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-brand-400 flex items-center justify-center transition disabled:opacity-30 shrink-0"
                      title={line.hasTimestamp ? `Play audio from ${line.timestampStr}` : 'No timestamp'}
                    >
                      <Play size={13} />
                    </button>

                    {/* Timestamp Editor Pill & Micro-Steppers */}
                    <div className="flex items-center gap-1 bg-surface-island px-2 py-1 rounded-lg border border-border-medium shrink-0">
                      {/* Nudge down (-0.1s) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNudgeLine(index, -0.1);
                        }}
                        className="text-content-secondary hover:text-white p-0.5 rounded transition text-[10px]"
                        title="-0.1s"
                      >
                        -
                      </button>

                      {/* Timestamp text input */}
                      <input
                        type="text"
                        value={line.timestampStr}
                        placeholder="[00:00.00]"
                        onChange={(e) => handleTimestampTextChange(index, e.target.value)}
                        className={`w-20 bg-transparent text-center font-mono text-xs font-semibold focus:outline-none focus:text-brand-400 ${
                          isError ? 'text-red-400 font-bold' : 'text-content-primary'
                        }`}
                      />

                      {/* Nudge up (+0.1s) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNudgeLine(index, 0.1);
                        }}
                        className="text-content-secondary hover:text-white p-0.5 rounded transition text-[10px]"
                        title="+0.1s"
                      >
                        +
                      </button>

                      {/* Line Stamp Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveLineIndex(index);
                          handleStampActiveLine();
                        }}
                        className="ml-1 px-1.5 py-0.5 rounded bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-[10px] font-mono transition"
                        title="Stamp current player time to this line"
                      >
                        Stamp
                      </button>
                    </div>

                    {/* Lyric Text Input */}
                    <div className="flex-1 min-w-0">
                      <input
                        ref={(el) => (lineInputRefs.current[index] = el)}
                        type="text"
                        value={line.text}
                        onChange={(e) => handleLineTextChange(index, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLineBelow(index);
                          }
                        }}
                        placeholder="Enter lyric text..."
                        className="w-full bg-transparent text-xs sm:text-sm text-content-primary focus:outline-none placeholder:text-content-subtle"
                      />
                    </div>

                    {/* Quick Row Actions: Add line / Delete */}
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddLineBelow(index);
                        }}
                        className="w-6 h-6 rounded hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition"
                        title="Insert new line below (Enter)"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLine(index);
                        }}
                        className="w-6 h-6 rounded hover:bg-surface-hover text-content-secondary hover:text-red-400 flex items-center justify-center transition"
                        title="Delete line"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Bottom Add Line Trigger */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleAddLineBelow(lines.length - 1)}
                  className="w-full py-2 border border-dashed border-border-medium hover:border-brand-500/50 rounded-xl text-content-secondary hover:text-brand-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Plus size={14} />
                  <span>Add Line at End</span>
                </button>
              </div>
            </div>
          ) : (
            /* ──── Raw LRC Textarea Mode ──── */
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={handleRawTextChange}
              placeholder={
                isSynced
                  ? `[00:12.50] First line of song\n[00:16.80] Second line of song\n[00:22.10] Chorus starts here`
                  : `Paste plain text lyrics here.`
              }
              className="w-full flex-1 bg-surface-island/40 font-mono text-xs sm:text-sm p-4 outline-none resize-none leading-relaxed text-content-primary placeholder:text-content-subtle border-none"
              spellCheck={false}
            />
          )}
        </div>

        {/* ── Status Bar / Tip ── */}
        <div className="flex items-center justify-between text-[11px] text-content-muted px-5 py-2 border-t border-border-subtle bg-surface-island/40 shrink-0">
          <div className="flex items-center gap-3">
            <span>
              💡 <b>Tips:</b> Click <code className="bg-surface-island px-1 rounded text-brand-400">Alt+S</code> to stamp current time • Press <kbd className="bg-surface-island px-1 rounded">Enter</kbd> to add line below
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0 font-mono">
            <span>
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
            {isSynced && (
              <span className="text-brand-400">
                ({timedLinesCount} timed)
              </span>
            )}
          </div>
        </div>

        {/* ── Error Notice ── */}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 mx-5 mt-2 shrink-0">
            {error}
          </div>
        )}

        {/* ── Footer Action Buttons ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface-elevated shrink-0">
          <div className="text-xs text-content-muted">
            {isSynced ? 'Changes will be saved as timestamped LRC.' : 'Changes will be saved as plain text lyrics.'}
          </div>

          <div className="flex items-center gap-2.5">
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
              disabled={isSaving || (editorMode === 'raw' ? !rawText.trim() : lines.length === 0)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500 text-black text-xs font-bold px-6 py-2 rounded-full shadow-lg transition active:scale-95"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FileText size={14} />
                  <span>Save Lyrics</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
