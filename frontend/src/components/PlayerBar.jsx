import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, 
  Volume2, VolumeX, ListMusic, Heart, Mic2, MicOff, PictureInPicture2,
  Loader2, X, Disc3
} from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';
import { TimelineScrubber } from './TimelineScrubber';
import { VolumeSlider } from './VolumeSlider';
import { MobileNowPlayingSheet } from './MobileNowPlayingSheet';
import { MobileQueueSheet } from './MobileQueueSheet';

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const PlayerBar = ({ 
  isQueueOpen, 
  setIsQueueOpen,
  isLyricsOpen,
  setIsLyricsOpen,
  isMiniPlayerOpen,
  setIsMiniPlayerOpen,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu
}) => {
  const {
    currentTrack,
    isPlaying,
    hasStartedPlayback,
    currentTime,
    duration,
    bufferedTime,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    isFavorite,
    isTrackPreloaded,
    toggleFavorite,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    isPiPActive,
    togglePiP,
    audioQuality,
    setAudioQuality,
    showToast,
    isKaraokeMode,
    toggleKaraoke,
    karaokeStemStatus,
    isGeneratingStems,
    generateKaraokeStems,
    fetchKaraokeStatus,
    isMobileNowPlayingOpen,
    setIsMobileNowPlayingOpen,
  } = usePlayer();

  const [isMobileQueueOpen, setIsMobileQueueOpen] = useState(false);

  const handleToggleAudioQuality = (e) => {
    e.stopPropagation();
    const nextQuality = audioQuality === 'data_saver' ? 'original' : 'data_saver';
    setAudioQuality(nextQuality);
    if (showToast) {
      showToast(
        nextQuality === 'data_saver' 
          ? '⚡ Switched to Low Quality (LQ - 128 kbps)' 
          : '✨ Switched to High Quality (HQ / Master)',
        2500
      );
    }
  };

  const handleToggleKaraoke = async () => {
    const turningOn = !isKaraokeMode;
    const success = await toggleKaraoke();
    if (turningOn && success && setIsLyricsOpen) {
      setIsLyricsOpen(true);
    }
  };

  const prevTrackIdRef = useRef(currentTrack?.id);

  // Detect track change when Karaoke mode is active
  useEffect(() => {
    if (!currentTrack?.id) return;

    if (prevTrackIdRef.current !== currentTrack.id) {
      prevTrackIdRef.current = currentTrack.id;

      if (isKaraokeMode) {
        fetchKaraokeStatus(currentTrack.id).then((status) => {
          if (status && !status.exists && showToast) {
            showToast(`⚠️ Instrumental not available for "${currentTrack.title}"; playing with vocals`, 3500);
          }
        });
      }
    }
  }, [currentTrack?.id, currentTrack?.title, isKaraokeMode, fetchKaraokeStatus, showToast]);

  const handleVolumeChange = (val) => {
    setVolume(val);
  };

  const isFav = currentTrack ? isFavorite(currentTrack.id) : false;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Interactive Mobile Floating Player Drag Physics (YouTube-style draggable preview with spring-back)
  const [mobileDragOffset, setMobileDragOffset] = useState({ x: 0, y: 0 });
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const mobileDragStartRef = useRef({ x: 0, y: 0, pointerId: null });
  const hasMobileDraggedRef = useRef(false);

  const handleMobilePointerDown = (e) => {
    // Only capture primary touch/mouse button
    if (e.button !== undefined && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    mobileDragStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    hasMobileDraggedRef.current = false;
    setIsMobileDragging(true);
  };

  const handleMobilePointerMove = (e) => {
    if (!isMobileDragging || mobileDragStartRef.current.pointerId !== e.pointerId) return;
    const deltaX = e.clientX - mobileDragStartRef.current.x;
    const deltaY = e.clientY - mobileDragStartRef.current.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 5) {
      hasMobileDraggedRef.current = true;
    }

    // Apply interactive elastic resistance: 0.6 dampening
    setMobileDragOffset({
      x: deltaX * 0.6,
      y: deltaY * 0.6,
    });
  };

  const handleMobilePointerUp = (e) => {
    if (!isMobileDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsMobileDragging(false);
    // Smoothly spring snap back to original position
    setMobileDragOffset({ x: 0, y: 0 });

    // Reset drag flag after short delay so click handler knows if it was a drag
    setTimeout(() => {
      hasMobileDraggedRef.current = false;
    }, 120);
  };

  const handleMobilePointerCancel = (e) => {
    if (!isMobileDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsMobileDragging(false);
    setMobileDragOffset({ x: 0, y: 0 });
    setTimeout(() => {
      hasMobileDraggedRef.current = false;
    }, 120);
  };

  const handleMobileCardClick = () => {
    // If the user was dragging the card, do not open the now playing sheet
    if (hasMobileDraggedRef.current) return;
    setIsMobileNowPlayingOpen(true);
  };

  return (
    <footer 
      data-dev-component="PlayerBar"
      data-dev-file="src/components/PlayerBar.jsx"
      data-dev-desc="Bottom persistent playback bar with track information, transport controls, and volume"
      className="relative md:bg-surface-base md:border-t md:border-border-subtle z-40 select-none shrink-0"
    >
      {/* ================= MOBILE FLOATING MINI PLAYER (< md) ================= */}
      {/* Fully floating card with smooth slide-up entrance from underneath bottom navigation */}
      <div 
        className={`md:hidden pointer-events-auto max-w-lg mx-auto w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          currentTrack && hasStartedPlayback && !isLyricsOpen
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-12 opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-3 pb-0">
          <div 
            onPointerDown={handleMobilePointerDown}
            onPointerMove={handleMobilePointerMove}
            onPointerUp={handleMobilePointerUp}
            onPointerCancel={handleMobilePointerCancel}
            onClick={handleMobileCardClick}
            style={{
              transform: `translate3d(${mobileDragOffset.x}px, ${mobileDragOffset.y}px, 0)`,
              transition: isMobileDragging ? 'none' : 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
              touchAction: 'none',
            }}
            className={`relative flex items-center justify-between h-16 px-3.5 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.65)] cursor-grab active:cursor-grabbing select-none overflow-hidden ${
              isMobileDragging ? 'shadow-[0_14px_32px_rgba(0,0,0,0.85)] scale-[1.02]' : 'active:scale-[0.99]'
            }`}
          >
            {/* Left: Thumbnail & Track info */}
            <div 
              className="flex items-center gap-3 min-w-0 flex-1 pointer-events-none"
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(e, 'track', currentTrack);
                }
              }}
            >
              <img
                src={resolveCoverUrl(currentTrack)}
                alt=""
                className="w-11 h-11 rounded-lg object-cover bg-surface-elevated shrink-0 shadow-sm select-none pointer-events-none"
                draggable={false}
              />
              <div className="min-w-0 flex-1 pr-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-tight">
                    {currentTrack.title}
                  </h4>
                  {audioQuality === 'data_saver' ? (
                    <span className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                      LQ
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-1 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 shrink-0">
                      {currentTrack.file_format?.toLowerCase() === 'flac' ? 'FLAC' : 'HQ'}
                    </span>
                  )}
                  {isTrackPreloaded && isTrackPreloaded(currentTrack.id) && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" 
                      title="Preloaded & offline ready"
                    />
                  )}
                </div>
                <p className="text-xs text-neutral-400 truncate mt-0.5 leading-tight">
                  {currentTrack.artist_name}
                </p>
              </div>
            </div>

            {/* Right: Quick Actions */}
            <div 
              className="flex items-center gap-2 shrink-0 z-10" 
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-2.5 transition active:scale-90 ${isFav ? 'text-brand-500' : 'text-neutral-400 hover:text-white'}`}
                title={isFav ? 'Remove from Liked' : 'Save to Liked'}
              >
                <Heart size={20} className={isFav ? 'fill-brand-500' : ''} />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-md active:scale-95 transition"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause size={18} className="fill-black" />
                ) : (
                  <Play size={18} className="fill-black ml-0.5" />
                )}
              </button>
            </div>

            {/* Bottom Scrubber Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/10 pointer-events-none">
              <div 
                className="h-full bg-brand-500 transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ================= DESKTOP FULL PLAYER (>= md) ~80px ================= */}
      <div className="hidden md:flex h-20 px-4 lg:px-6 items-center justify-between">
        {/* Left: Current Track Details */}
        <div 
          className="flex items-center gap-3.5 w-1/4 min-w-[220px]"
          onContextMenu={(e) => {
            if (onContextMenu && currentTrack) {
              e.preventDefault();
              onContextMenu(e, 'track', currentTrack);
            }
          }}
        >
          {currentTrack ? (
            <>
              <img
                src={resolveCoverUrl(currentTrack)}
                alt={currentTrack.album_title || 'Cover'}
                onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                className="w-14 h-14 rounded-md object-cover shadow-lg bg-surface-elevated shrink-0 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition"
                title={currentTrack.album_title || 'Go to album'}
              />
              <div className="truncate max-w-[140px] lg:max-w-[180px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h4 
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="text-sm font-bold text-content-primary truncate hover:underline cursor-pointer"
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </h4>
                  {audioQuality === 'data_saver' ? (
                    <button
                      type="button"
                      onClick={handleToggleAudioQuality}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 uppercase tracking-wider hover:bg-amber-500/35 hover:border-amber-500/60 active:scale-95 transition cursor-pointer select-none"
                      title="Switch to HQ"
                    >
                      LQ
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleAudioQuality}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 shrink-0 uppercase tracking-wider hover:bg-brand-500/35 hover:border-brand-500/60 active:scale-95 transition cursor-pointer select-none"
                      title="Switch to LQ"
                    >
                      {currentTrack.file_format?.toLowerCase() === 'flac' ? 'FLAC' : 'HQ'}
                    </button>
                  )}
                  {isTrackPreloaded && isTrackPreloaded(currentTrack.id) && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" 
                      title="Preloaded & offline ready (safe if server disconnects)"
                    />
                  )}
                </div>
                <p 
                  onClick={() => onSelectArtist && onSelectArtist(currentTrack.artist_id)}
                  className="text-xs text-content-secondary truncate hover:text-content-primary hover:underline cursor-pointer mt-0.5"
                  title={currentTrack.artist_name}
                >
                  {currentTrack.artist_name}
                </p>
              </div>
              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-1.5 transition ml-1 shrink-0 ${
                  isFav ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'
                }`}
                title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <Heart size={18} className={isFav ? 'fill-brand-500' : ''} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-xs text-content-subtle">
              <div className="w-12 h-12 rounded-md bg-surface-elevated flex items-center justify-center">
                🎵
              </div>
              <span>No track selected</span>
            </div>
          )}
        </div>

        {/* Center: Transport Controls & Scrubber */}
        <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-xl">
          <div className="flex items-center gap-5">
            <button
              onClick={toggleShuffle}
              className={`transition ${isShuffle ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'}`}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>

            <button
              onClick={prevTrack}
              className="text-content-secondary hover:text-content-primary transition"
              title="Previous"
            >
              <SkipBack size={18} />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentTrack}
              className="w-9 h-9 rounded-full bg-white hover:scale-105 active:scale-95 text-black flex items-center justify-center transition shadow-lg disabled:opacity-40 disabled:hover:scale-100"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={18} className="fill-black" />
              ) : (
                <Play size={18} className="fill-black ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="text-content-secondary hover:text-content-primary transition"
              title="Next"
            >
              <SkipForward size={18} />
            </button>

            <button
              onClick={toggleRepeat}
              className={`transition ${repeatMode !== 'off' ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'}`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Timeline Scrubber */}
          <TimelineScrubber
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            onSeek={seek}
            disabled={!currentTrack}
          />
        </div>

        {/* Right: PiP + Lyrics Button + Queue Drawer Toggle & Volume */}
        <div className="flex items-center justify-end gap-2.5 w-1/4 min-w-[210px]">
          {/* Mini Player & Picture-in-Picture Toggle */}
          <button
            onClick={togglePiP}
            className={`p-2 rounded-lg transition ${
              isPiPActive ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title={isPiPActive ? 'Close Miniplayer' : 'Open Miniplayer'}
          >
            <PictureInPicture2 size={18} />
          </button>

          {/* Karaoke Mode Toggle */}
          <button
            onClick={handleToggleKaraoke}
            disabled={!currentTrack}
            className={`p-2 rounded-lg transition relative disabled:opacity-40 ${
              isKaraokeMode 
                ? 'text-brand-500 bg-surface-elevated ring-1 ring-brand-500/30 shadow-sm' 
                : 'text-content-secondary hover:text-content-primary'
            }`}
            title={isKaraokeMode ? 'Restore Vocals' : 'Turn on Karaoke'}
          >
            {isGeneratingStems && (karaokeStemStatus[currentTrack?.id]?.status === 'processing' || karaokeStemStatus[currentTrack?.id]?.status === 'queued') ? (
              <Loader2 size={18} className="animate-spin text-brand-500" />
            ) : (
              <MicOff size={18} />
            )}
            {isKaraokeMode && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            )}
          </button>

          {/* Lyrics Toggle Button */}
          <button
            onClick={() => setIsLyricsOpen && setIsLyricsOpen(!isLyricsOpen)}
            className={`p-2 rounded-lg transition ${
              isLyricsOpen ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title="Lyrics"
          >
            <Mic2 size={18} />
          </button>

          {/* Queue Toggle Button */}
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`p-2 rounded-lg transition ${
              isQueueOpen ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title={isQueueOpen ? "Close Queue" : "Play Queue"}
          >
            <ListMusic size={18} />
          </button>

          <button
            onClick={toggleMute}
            className="text-content-secondary hover:text-content-primary transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <VolumeSlider
            volume={volume}
            isMuted={isMuted}
            onChange={handleVolumeChange}
            onUnmute={toggleMute}
            className="w-24"
          />
        </div>
      </div>

      {/* Mobile Full-Screen Now Playing Sheet */}
      <MobileNowPlayingSheet
        isOpen={isMobileNowPlayingOpen}
        onClose={() => setIsMobileNowPlayingOpen(false)}
        onOpenQueue={() => setIsMobileQueueOpen(true)}
        onOpenLyrics={() => {
          setIsMobileNowPlayingOpen(false);
          setIsLyricsOpen?.(true);
        }}
        onSelectAlbum={onSelectAlbum}
        onSelectArtist={onSelectArtist}
        onContextMenu={onContextMenu}
      />

      {/* Mobile Queue Bottom Sheet */}
      <MobileQueueSheet
        isOpen={isMobileQueueOpen}
        onClose={() => setIsMobileQueueOpen(false)}
        onSelectAlbum={onSelectAlbum}
        onSelectArtist={onSelectArtist}
      />
    </footer>
  );
};
