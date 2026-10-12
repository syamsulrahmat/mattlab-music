import React from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, 
  Volume2, VolumeX, ListMusic, Heart, Mic2 
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
  } = usePlayer();

  const handleSeekChange = (e) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const isFav = currentTrack ? isFavorite(currentTrack.id) : false;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="relative bg-[#000000] border-t border-[#181818] z-40 select-none shrink-0">
      {/* Mobile Thin Progress Line */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-1 bg-[#1f1f1f] overflow-hidden">
        <div 
          className="h-full bg-[#1ed760] transition-all duration-150"
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
                className="w-11 h-11 rounded-md object-cover bg-[#1f1f1f] shrink-0 shadow cursor-pointer active:scale-95 transition"
              />
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <h4 
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="text-xs font-bold text-white truncate cursor-pointer hover:underline"
                  >
                    {currentTrack.title}
                  </h4>
                  {isTrackPreloaded && isTrackPreloaded(currentTrack.id) && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-[#1ed760] shrink-0" 
                      title="Preloaded & offline ready"
                    />
                  )}
                </div>
                <p 
                  onClick={() => onSelectArtist && onSelectArtist(currentTrack.artist_id)}
                  className="text-[11px] text-[#b3b3b3] truncate mt-0.5 cursor-pointer hover:text-white hover:underline"
                >
                  {currentTrack.artist_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsLyricsOpen && setIsLyricsOpen(!isLyricsOpen)}
                className={`p-1.5 transition ${isLyricsOpen ? 'text-[#1ed760]' : 'text-[#b3b3b3]'}`}
                title="Lyrics"
              >
                <Mic2 size={17} />
              </button>

              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-1.5 transition ${isFav ? 'text-[#1ed760]' : 'text-[#b3b3b3]'}`}
              >
                <Heart size={18} className={isFav ? 'fill-[#1ed760]' : ''} />
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
                className="p-1.5 text-[#b3b3b3] hover:text-white"
              >
                <SkipForward size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#666]">
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
                className="w-14 h-14 rounded-md object-cover shadow-lg bg-[#1f1f1f] shrink-0 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition"
                title={currentTrack.album_title || 'Go to album'}
              />
              <div className="truncate max-w-[140px] lg:max-w-[180px]">
                <div className="flex items-center gap-1.5">
                  <h4 
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="text-sm font-bold text-white truncate hover:underline cursor-pointer"
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </h4>
                  {isTrackPreloaded && isTrackPreloaded(currentTrack.id) && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-[#1ed760] shrink-0" 
                      title="Preloaded & offline ready (safe if server disconnects)"
                    />
                  )}
                </div>
                <p 
                  onClick={() => onSelectArtist && onSelectArtist(currentTrack.artist_id)}
                  className="text-xs text-[#b3b3b3] truncate hover:text-white hover:underline cursor-pointer mt-0.5"
                  title={currentTrack.artist_name}
                >
                  {currentTrack.artist_name}
                </p>
              </div>
              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-1.5 transition ml-1 shrink-0 ${
                  isFav ? 'text-[#1ed760]' : 'text-[#b3b3b3] hover:text-white'
                }`}
                title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <Heart size={18} className={isFav ? 'fill-[#1ed760]' : ''} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-xs text-[#666]">
              <div className="w-12 h-12 rounded-md bg-[#1f1f1f] flex items-center justify-center">
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
              className={`transition ${isShuffle ? 'text-[#1ed760]' : 'text-[#b3b3b3] hover:text-white'}`}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>

            <button
              onClick={prevTrack}
              className="text-[#b3b3b3] hover:text-white transition"
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
              className="text-[#b3b3b3] hover:text-white transition"
              title="Next"
            >
              <SkipForward size={18} />
            </button>

            <button
              onClick={toggleRepeat}
              className={`transition ${repeatMode !== 'off' ? 'text-[#1ed760]' : 'text-[#b3b3b3] hover:text-white'}`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Scrub Bar */}
          <div className="w-full flex items-center gap-3 text-xs font-mono text-[#b3b3b3]">
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
                className="w-full h-1 bg-[#4d4d4d] group-hover:bg-[#5e5e5e] rounded-lg appearance-none cursor-pointer accent-[#1ed760] transition disabled:opacity-30"
              />
            </div>
            <span className="w-10 text-[11px]">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Lyrics Button + Queue Drawer Toggle & Volume */}
        <div className="flex items-center justify-end gap-2.5 w-1/4 min-w-[190px]">
          {/* Lyrics Toggle Button - immediately to left of queue button */}
          <button
            onClick={() => setIsLyricsOpen && setIsLyricsOpen(!isLyricsOpen)}
            className={`p-2 rounded-lg transition ${
              isLyricsOpen ? 'text-[#1ed760] bg-[#1f1f1f]' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title="Lyrics"
          >
            <Mic2 size={18} />
          </button>

          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`p-2 rounded-lg transition ${
              isQueueOpen ? 'text-[#1ed760] bg-[#1f1f1f]' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title="Play Queue"
          >
            <ListMusic size={18} />
          </button>

          <button
            onClick={toggleMute}
            className="text-[#b3b3b3] hover:text-white transition"
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
            className="w-24 h-1 bg-[#4d4d4d] hover:bg-[#5e5e5e] rounded-lg appearance-none cursor-pointer accent-[#1ed760]"
          />
        </div>
      </div>
    </footer>
  );
};
