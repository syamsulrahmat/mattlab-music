import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, 
  Volume2, VolumeX, ListMusic, Heart, Mic2, MicOff, PictureInPicture2,
  Loader2, X
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

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
    currentTime,
    duration,
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
    isKaraokeMode,
    toggleKaraoke,
    karaokeStemStatus,
    isGeneratingStems,
    generateKaraokeStems,
    fetchKaraokeStatus,
  } = usePlayer();

  const handleToggleKaraoke = () => {
    const turningOn = !isKaraokeMode;
    toggleKaraoke();
    if (turningOn && setIsLyricsOpen) {
      setIsLyricsOpen(true);
    }
  };

  const [missingStemHint, setMissingStemHint] = useState({ visible: false, isExiting: false, trackId: null });
  const hintTimeoutRef = useRef(null);
  const exitTimeoutRef = useRef(null);
  const prevTrackIdRef = useRef(currentTrack?.id);

  const dismissHint = useCallback(() => {
    setMissingStemHint((prev) => {
      if (!prev.visible || prev.isExiting) return prev;
      return { ...prev, isExiting: true };
    });
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(() => {
      setMissingStemHint({ visible: false, isExiting: false, trackId: null });
    }, 300);
  }, []);

  // Detect track change when Karaoke mode is active
  useEffect(() => {
    if (!currentTrack?.id) {
      setMissingStemHint({ visible: false, isExiting: false, trackId: null });
      return;
    }

    if (prevTrackIdRef.current !== currentTrack.id) {
      prevTrackIdRef.current = currentTrack.id;

      if (isKaraokeMode) {
        fetchKaraokeStatus(currentTrack.id).then((status) => {
          if (status && !status.exists) {
            setMissingStemHint({ visible: true, isExiting: false, trackId: currentTrack.id });
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            hintTimeoutRef.current = setTimeout(() => {
              dismissHint();
            }, 3000);
          } else {
            dismissHint();
          }
        });
      } else {
        dismissHint();
      }
    }
  }, [currentTrack?.id, isKaraokeMode, fetchKaraokeStatus, dismissHint]);

  // If stems become ready while hint is visible, smoothly auto-close the hint
  useEffect(() => {
    if (missingStemHint.visible && !missingStemHint.isExiting && currentTrack?.id && karaokeStemStatus[currentTrack.id]?.exists) {
      dismissHint();
    }
  }, [karaokeStemStatus, currentTrack?.id, missingStemHint.visible, missingStemHint.isExiting, dismissHint]);

  const handleSeekChange = (e) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const isFav = currentTrack ? isFavorite(currentTrack.id) : false;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="relative bg-surface-base border-t border-border-subtle z-40 select-none shrink-0">
      {/* Mobile Thin Progress Line */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-1 bg-surface-elevated overflow-hidden">
        <div 
          className="h-full bg-brand-500 transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ================= MOBILE MINI PLAYER (< md) ================= */}
      <div className="flex md:hidden h-16 items-center justify-between px-3.5 gap-2">
        {currentTrack ? (
          <>
            <div 
              className="flex items-center gap-3 truncate flex-1 min-w-0"
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  onContextMenu(e, 'track', currentTrack);
                }
              }}
            >
              <img
                src={currentTrack.cover_url || '/api/covers/0'}
                alt=""
                onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                className="w-11 h-11 rounded-md object-cover bg-surface-elevated shrink-0 shadow cursor-pointer active:scale-95 transition"
              />
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <h4 
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="text-xs font-bold text-content-primary truncate cursor-pointer hover:underline"
                  >
                    {currentTrack.title}
                  </h4>
                  {isTrackPreloaded && isTrackPreloaded(currentTrack.id) && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" 
                      title="Preloaded & offline ready"
                    />
                  )}
                </div>
                <p 
                  onClick={() => onSelectArtist && onSelectArtist(currentTrack.artist_id)}
                  className="text-[11px] text-content-secondary truncate mt-0.5 cursor-pointer hover:text-content-primary hover:underline"
                >
                  {currentTrack.artist_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleToggleKaraoke}
                className={`p-1.5 transition rounded-md ${
                  isKaraokeMode ? 'text-brand-500 bg-brand-500/15' : 'text-content-secondary hover:text-content-primary'
                }`}
                title={isKaraokeMode ? 'Karaoke Mode Active (Tap to restore vocals)' : 'Turn Karaoke Mode ON'}
              >
                <MicOff size={17} />
              </button>

              <button
                onClick={() => setIsLyricsOpen && setIsLyricsOpen(!isLyricsOpen)}
                className={`p-1.5 transition ${isLyricsOpen ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'}`}
                title="Lyrics"
              >
                <Mic2 size={17} />
              </button>

              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-1.5 transition ${isFav ? 'text-brand-500' : 'text-content-secondary hover:text-content-primary'}`}
              >
                <Heart size={18} className={isFav ? 'fill-brand-500' : ''} />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition"
              >
                {isPlaying ? (
                  <Pause size={18} className="fill-black" />
                ) : (
                  <Play size={18} className="fill-black ml-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="p-1.5 text-content-secondary hover:text-content-primary"
              >
                <SkipForward size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-content-subtle">
            <span>No track selected</span>
          </div>
        )}
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
                src={currentTrack.cover_url || '/api/covers/0'}
                alt={currentTrack.album_title || 'Cover'}
                onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                className="w-14 h-14 rounded-md object-cover shadow-lg bg-surface-elevated shrink-0 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition"
                title={currentTrack.album_title || 'Go to album'}
              />
              <div className="truncate max-w-[140px] lg:max-w-[180px]">
                <div className="flex items-center gap-1.5">
                  <h4 
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="text-sm font-bold text-content-primary truncate hover:underline cursor-pointer"
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </h4>
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

          {/* Scrub Bar */}
          <div className="w-full flex items-center gap-3 text-xs font-mono text-content-secondary">
            <span className="w-10 text-right text-[11px]">{formatTime(currentTime)}</span>
            <div className="relative flex-1 group flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                disabled={!currentTrack}
                className="w-full h-1 bg-surface-hover group-hover:bg-content-subtle rounded-lg appearance-none cursor-pointer accent-brand-500 transition disabled:opacity-30"
              />
            </div>
            <span className="w-10 text-[11px]">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: PiP + Lyrics Button + Queue Drawer Toggle & Volume */}
        <div className="flex items-center justify-end gap-2.5 w-1/4 min-w-[210px]">
          {/* Mini Player & Picture-in-Picture Toggle */}
          <button
            onClick={togglePiP}
            className={`p-2 rounded-lg transition ${
              isPiPActive ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title={isPiPActive ? 'Close Picture-in-Picture' : 'Picture-in-Picture (Floating lyrics & music controls across apps)'}
          >
            <PictureInPicture2 size={18} />
          </button>

          {/* Karaoke Mode Toggle & Transient Hint */}
          <div className="relative flex items-center">
            <button
              onClick={handleToggleKaraoke}
              disabled={!currentTrack}
              className={`p-2 rounded-lg transition relative disabled:opacity-40 ${
                isKaraokeMode 
                  ? 'text-brand-500 bg-surface-elevated ring-1 ring-brand-500/30 shadow-sm' 
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title={
                isKaraokeMode 
                  ? 'Karaoke Active: Studio Instrumental (Click to restore vocals)' 
                  : karaokeStemStatus[currentTrack?.id]?.exists
                  ? 'Karaoke Mode (Click to play Studio Instrumental)'
                  : 'Karaoke Mode'
              }
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

            {/* Transient Missing-Stems Hint Card */}
            {missingStemHint.visible && currentTrack && !karaokeStemStatus[currentTrack.id]?.exists && (
              <div 
                className={`absolute bottom-full mb-3 right-0 w-64 bg-surface-panel/95 backdrop-blur-md border border-brand-500/30 rounded-xl p-3 shadow-2xl z-50 text-left select-none transition-all duration-300 transform ${
                  missingStemHint.isExiting
                    ? 'opacity-0 translate-y-2 scale-95 pointer-events-none'
                    : 'opacity-100 translate-y-0 scale-100'
                }`}
                onMouseEnter={() => {
                  if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-brand-400 font-bold text-xs">
                    <MicOff size={13} className="text-brand-500 shrink-0" />
                    <span>Karaoke track not pre-cached</span>
                  </div>
                  <button 
                    onClick={dismissHint}
                    className="text-content-muted hover:text-content-primary p-0.5 rounded transition"
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>

                <p className="text-[11px] text-content-secondary leading-relaxed mb-2.5">
                  Playing original version with vocals.
                </p>

                <button
                  onClick={() => generateKaraokeStems(currentTrack.id)}
                  disabled={isGeneratingStems || karaokeStemStatus[currentTrack.id]?.status === 'queued' || karaokeStemStatus[currentTrack.id]?.status === 'processing'}
                  className="w-full text-xs font-semibold bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black rounded-lg py-1.5 px-2.5 flex items-center justify-center gap-1.5 transition active:scale-95 shadow"
                >
                  {isGeneratingStems || karaokeStemStatus[currentTrack.id]?.status === 'processing' || karaokeStemStatus[currentTrack.id]?.status === 'queued' ? (
                    <>
                      <Loader2 size={12} className="animate-spin text-black" />
                      <span>Separating (~1.5 min)...</span>
                    </>
                  ) : (
                    <span>Generate Instrumental</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Lyrics Toggle Button - immediately to left of queue button */}
          <button
            onClick={() => setIsLyricsOpen && setIsLyricsOpen(!isLyricsOpen)}
            className={`p-2 rounded-lg transition ${
              isLyricsOpen ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title="Lyrics"
          >
            <Mic2 size={18} />
          </button>

          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`p-2 rounded-lg transition ${
              isQueueOpen ? 'text-brand-500 bg-surface-elevated' : 'text-content-secondary hover:text-content-primary'
            }`}
            title="Play Queue"
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

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 bg-surface-hover hover:bg-content-subtle rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
        </div>
      </div>
    </footer>
  );
};
