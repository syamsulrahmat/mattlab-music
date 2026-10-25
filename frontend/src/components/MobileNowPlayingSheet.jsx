import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Mic2,
  MicOff,
  ListMusic,
  MoreVertical,
  Volume2,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';
import { TimelineScrubber } from './TimelineScrubber';

export const MobileNowPlayingSheet = ({
  isOpen,
  onClose,
  onOpenQueue,
  onOpenLyrics,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu,
}) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    bufferedTime,
    seek,
    togglePlay,
    nextTrack,
    prevTrack,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    isFavorite,
    toggleFavorite,
    isKaraokeMode,
    toggleKaraoke,
    audioQuality,
    setAudioQuality,
    showToast,
    queue,
    queueIndex,
  } = usePlayer();

  // Swipe-down to dismiss gesture
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Reset drag offset when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchCurrentY.current - touchStartY.current;
    if (diff > 0) {
      // Only drag downwards
      setDragOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > 100) {
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  const handleToggleAudioQuality = (e) => {
    e.stopPropagation();
    if (audioQuality === 'data_saver') {
      setAudioQuality('high');
      if (showToast) showToast('⚡ Switched to High Quality');
    } else {
      setAudioQuality('data_saver');
      if (showToast) showToast('🌱 Data Saver active (64k Opus)');
    }
  };

  if (!isOpen || !currentTrack) return null;

  const isFav = isFavorite(currentTrack.id);
  const upcomingCount = queue ? Math.max(0, queue.length - (queueIndex + 1)) : 0;
  const coverUrl = resolveCoverUrl(currentTrack);

  return createPortal(
    <div
      data-dev-component="MobileNowPlayingSheet"
      data-dev-file="src/components/MobileNowPlayingSheet.jsx"
      data-dev-desc="Full-screen touch-optimized Now Playing player sheet for smartphones and mobile viewports"
      className="fixed inset-0 h-[100dvh] max-h-[100dvh] z-[70] flex flex-col bg-surface-base text-white select-none overflow-hidden transition-transform duration-200 ease-out"
      style={{
        transform: `translateY(${dragOffset}px)`,
      }}
    >
      {/* ── Dynamic Ambient Blur Backdrop ── */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 filter blur-3xl pointer-events-none scale-125"
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-base/80 via-surface-base/95 to-surface-base pointer-events-none" />

      {/* ── Pinned Header & Pull Down Handle ── */}
      <header
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] px-4 pb-2 flex flex-col items-center shrink-0 cursor-grab active:cursor-grabbing"
      >
        {/* Visual Pill Indicator */}
        <div className="w-10 h-1 rounded-full bg-white/30 mb-2" />

        <div className="w-full flex items-center justify-between">
          {/* Dismiss Chevron */}
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition"
            title="Minimize Player"
          >
            <ChevronDown size={28} />
          </button>

          {/* Playing Context Title */}
          <div className="flex-1 min-w-0 text-center px-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-content-muted block truncate">
              {currentTrack.album_title ? 'Playing from Album' : 'Now Playing'}
            </span>
            <span
              onClick={() => {
                if (currentTrack.album_id && onSelectAlbum) {
                  onSelectAlbum(currentTrack.album_id);
                  onClose();
                }
              }}
              className="text-xs font-bold text-content-primary hover:underline truncate block cursor-pointer"
            >
              {currentTrack.album_title || 'MattLab Music'}
            </span>
          </div>

          {/* Track Context Menu Button */}
          <button
            type="button"
            onClick={(e) => {
              if (onContextMenu) {
                onContextMenu(e, 'track', currentTrack);
              }
            }}
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition"
            title="More Options"
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {/* ── Main Scrollable / Viewport Area ── */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 flex-1 flex flex-col justify-around px-6 py-2 w-full min-h-0 overflow-y-auto cursor-grab active:cursor-grabbing"
      >
        {/* Large Artwork with Shadow */}
        <div className="flex items-center justify-center py-2 shrink-0 pointer-events-none">
          <div className="relative w-[82vw] max-w-[340px] aspect-square rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/10">
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
            />
            {isKaraokeMode && (
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-brand-500 text-black text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg animate-pulse">
                <Sparkles size={11} />
                <span>Karaoke Stem</span>
              </div>
            )}
          </div>
        </div>

        {/* Track Title, Artist & Favorite Button */}
        <div className="flex items-center justify-between gap-3 pt-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white truncate leading-tight">
              {currentTrack.title}
            </h2>
            <p
              onClick={(e) => {
                e.stopPropagation();
                if (currentTrack.artist_id && onSelectArtist) {
                  onSelectArtist(currentTrack.artist_id);
                  onClose();
                }
              }}
              className="text-sm text-content-secondary truncate mt-1 hover:text-white hover:underline cursor-pointer"
            >
              {currentTrack.artist_name}
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(currentTrack.id);
            }}
            className="w-12 h-12 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition shrink-0"
            title={isFav ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
          >
            <Heart
              size={26}
              className={`transition-colors ${
                isFav ? 'fill-brand-500 text-brand-500' : 'text-content-secondary'
              }`}
            />
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div 
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="py-2 shrink-0"
        >
          <TimelineScrubber
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            onSeek={seek}
            timeClassName="text-xs text-content-secondary font-mono tabular-nums"
          />
        </div>

        {/* Main Transport Controls */}
        <div className="flex items-center justify-between px-2 py-1 shrink-0">
          {/* Shuffle Toggle */}
          <button
            type="button"
            onClick={toggleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 relative ${
              isShuffle ? 'text-brand-500' : 'text-content-secondary hover:text-white'
            }`}
            title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
          >
            <Shuffle size={20} />
            {isShuffle && (
              <span className="absolute bottom-2 w-1 h-1 rounded-full bg-brand-500" />
            )}
          </button>

          {/* Previous Track */}
          <button
            type="button"
            onClick={prevTrack}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition"
            title="Previous Track"
          >
            <SkipBack size={28} className="fill-current" />
          </button>

          {/* Play / Pause Primary Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-[0_8px_25px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 transition"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={28} className="fill-black" />
            ) : (
              <Play size={28} className="fill-black ml-1" />
            )}
          </button>

          {/* Next Track */}
          <button
            type="button"
            onClick={nextTrack}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition"
            title="Next Track"
          >
            <SkipForward size={28} className="fill-current" />
          </button>

          {/* Repeat Toggle */}
          <button
            type="button"
            onClick={toggleRepeat}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 relative ${
              repeatMode !== 'off' ? 'text-brand-500' : 'text-content-secondary hover:text-white'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            {repeatMode !== 'off' && (
              <span className="absolute bottom-2 w-1 h-1 rounded-full bg-brand-500" />
            )}
          </button>
        </div>

        {/* ── Bottom Utility Action Chips ── */}
        <div className="flex items-center justify-around gap-2 pt-2 pb-[max(2.5rem,calc(env(safe-area-inset-bottom,0px)+2.25rem))] shrink-0 border-t border-white/10">
          {/* Karaoke Toggle Chip */}
          <button
            type="button"
            onClick={toggleKaraoke}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 active:scale-95 ${
              isKaraokeMode
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-400 font-bold'
                : 'bg-surface-elevated border-border-subtle text-content-secondary'
            }`}
          >
            {isKaraokeMode ? <MicOff size={14} /> : <Mic2 size={14} />}
            <span>Karaoke</span>
          </button>

          {/* Lyrics Chip */}
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenLyrics) onOpenLyrics();
            }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated border border-border-subtle text-content-secondary hover:text-white transition flex items-center gap-1.5 active:scale-95"
          >
            <Mic2 size={14} />
            <span>Lyrics</span>
          </button>

          {/* Queue Sheet Chip */}
          <button
            type="button"
            onClick={() => {
              if (onOpenQueue) onOpenQueue();
            }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated border border-border-subtle text-content-secondary hover:text-white transition flex items-center gap-1.5 active:scale-95 relative"
          >
            <ListMusic size={14} />
            <span>Queue</span>
            {upcomingCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-brand-500 text-black text-[9px] font-bold flex items-center justify-center">
                {upcomingCount > 99 ? '99+' : upcomingCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
