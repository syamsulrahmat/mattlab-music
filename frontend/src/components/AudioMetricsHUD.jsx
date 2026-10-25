import React, { useState, useEffect, useRef } from 'react';
import { Activity, X, Move, Disc3, ShieldAlert } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useDevFlags } from '../context/FlagsContext';

export const AudioMetricsHUD = () => {
  const { flags, setFlag } = useDevFlags();
  const { currentTrack, isPlaying, isBuffering, currentTime, duration, bufferedTime, audioQuality, isKaraokeMode } = usePlayer();
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 20, initialY: 80 });

  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    if (e.target.setPointerCapture) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      const maxX = Math.max(10, window.innerWidth - 270);
      const maxY = Math.max(10, window.innerHeight - 200);
      const nextX = Math.max(10, Math.min(maxX, dragRef.current.initialX + deltaX));
      const nextY = Math.max(10, Math.min(maxY, dragRef.current.initialY + deltaY));
      setPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging]);

  // Early return must happen AFTER all hooks to adhere to React Rules of Hooks
  if (!flags?.audio_hud) return null;

  const safeDuration = Number(duration) || 0;
  const safeCurrentTime = Number(currentTime) || 0;
  const safeBufferedTime = Number(bufferedTime) || 0;
  const bufferPct = safeDuration > 0 ? Math.min(100, Math.round((safeBufferedTime / safeDuration) * 100)) : 0;

  return (
    <div
      data-dev-component="AudioMetricsHUD"
      data-dev-file="src/components/AudioMetricsHUD.jsx"
      data-dev-desc="Floating audio diagnostic HUD with live buffer telemetry and decoder stats"
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      className="fixed z-50 w-64 max-w-[calc(100vw-2rem)] bg-black/90 backdrop-blur-md border border-white/20 text-white rounded-xl shadow-2xl p-3 text-xs font-mono select-none"
    >
      {/* Header / Drag Bar */}
      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 cursor-move"
      >
        <div className="flex items-center gap-1.5 text-brand-400 font-bold">
          <Activity size={13} className="text-brand-500 animate-pulse" />
          <span>AUDIO HUD</span>
          <span className="text-[9px] px-1 bg-brand-500/20 text-brand-300 rounded font-bold">DEV</span>
        </div>
        <button
          onClick={() => setFlag('audio_hud', false)}
          className="text-content-muted hover:text-white p-0.5 rounded transition"
          title="Close HUD"
        >
          <X size={12} />
        </button>
      </div>

      {/* Metrics List */}
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-content-secondary">State:</span>
          <span className={isPlaying ? 'text-brand-400 font-bold' : 'text-amber-400'}>
            {isBuffering ? 'Buffering...' : isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-content-secondary">Position:</span>
          <span>{Math.round(safeCurrentTime)}s / {Math.round(safeDuration)}s</span>
        </div>

        <div className="flex justify-between">
          <span className="text-content-secondary">Buffer:</span>
          <span className="text-emerald-400">{bufferPct}% ({Math.round(safeBufferedTime)}s)</span>
        </div>

        <div className="flex justify-between">
          <span className="text-content-secondary">Quality:</span>
          <span className="uppercase text-brand-300 font-bold">
            {currentTrack?.file_format || audioQuality || 'original'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-content-secondary">Mode:</span>
          <span className={isKaraokeMode ? 'text-brand-400 font-bold' : 'text-content-muted'}>
            {isKaraokeMode ? 'Karaoke (Stem)' : 'Original (Master)'}
          </span>
        </div>

        <div className="flex justify-between pt-1 border-t border-white/10 text-[10px] text-content-muted">
          <span>Font:</span>
          <span className="text-white font-sans">{flags?.font_family || 'circular'}</span>
        </div>
      </div>
    </div>
  );
};
