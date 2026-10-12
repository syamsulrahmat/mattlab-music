import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, Pause, SkipBack, SkipForward, X, Maximize2, Minimize2, 
  ExternalLink, Move, PictureInPicture2 
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const FloatingMiniPlayer = ({ isOpen: isOpenProp, onClose: onCloseProp }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    pipWindow,
    isMiniPlayerOpen,
    setIsMiniPlayerOpen,
    togglePiP,
  } = usePlayer();

  const isOpen = isOpenProp !== undefined ? isOpenProp : isMiniPlayerOpen;
  const onClose = onCloseProp || (() => setIsMiniPlayerOpen(false));

  // Mode: 'micro' (3 buttons only), 'compact' (cover + title + 3 buttons), 'expanded' (full details)
  const [sizeMode, setSizeMode] = useState(() => {
    return localStorage.getItem('mini_player_size_mode') || 'compact';
  });

  // Draggable position coordinates for in-page mini player
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('mini_player_pos');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return { x: window.innerWidth - 320, y: window.innerHeight - 130 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const containerRef = useRef(null);

  // Sync sizeMode to localStorage and update PiP window dimensions if open
  const handleSetSizeMode = (mode) => {
    setSizeMode(mode);
    localStorage.setItem('mini_player_size_mode', mode);
    if (pipWindow) {
      try {
        if (mode === 'micro') pipWindow.resizeTo(185, 65);
        else if (mode === 'compact') pipWindow.resizeTo(330, 105);
        else if (mode === 'expanded') pipWindow.resizeTo(340, 150);
      } catch (_) {}
    }
  };

  // Cycle between micro -> compact -> expanded -> micro
  const cycleSizeMode = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (sizeMode === 'micro') handleSetSizeMode('compact');
    else if (sizeMode === 'compact') handleSetSizeMode('expanded');
    else handleSetSizeMode('micro');
  };

  // Listen for native OS window resize events on the PiP window
  useEffect(() => {
    if (!pipWindow) return;
    const handlePipResize = () => {
      try {
        if (pipWindow.innerWidth < 235 || pipWindow.innerHeight < 75) {
          if (sizeMode !== 'micro') {
            setSizeMode('micro');
            localStorage.setItem('mini_player_size_mode', 'micro');
          }
        }
      } catch (_) {}
    };

    pipWindow.addEventListener('resize', handlePipResize);
    return () => {
      try {
        pipWindow.removeEventListener('resize', handlePipResize);
      } catch (_) {}
    };
  }, [pipWindow, sizeMode]);

  // Mouse & Touch Dragging Handlers for in-page mini player
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 130, dragRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, dragRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      localStorage.setItem('mini_player_pos', JSON.stringify(position));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, position]);

  if (!currentTrack && !pipWindow) return null;
  if (!isOpen && !pipWindow) return null;

  // Render content for Document Picture-in-Picture window (always on top across tabs and desktop apps)
  const renderPiPContent = () => {
    if (sizeMode === 'micro') {
      return (
        <div className="w-full h-full flex items-center justify-between px-3 py-1 bg-[#121212] text-white font-sans select-none box-border">
          <div className="flex items-center gap-1.5 mx-auto">
            <button
              onClick={prevTrack}
              className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Previous"
            >
              <SkipBack size={15} />
            </button>
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-[#1ed760] text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black ml-0.5" />}
            </button>
            <button
              onClick={nextTrack}
              className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
              title="Next"
            >
              <SkipForward size={15} />
            </button>
            <div className="w-px h-3.5 bg-white/10 mx-1" />
            <button
              onClick={cycleSizeMode}
              className="p-1 text-[#777] hover:text-white rounded transition"
              title="Expand (Cover & Title)"
            >
              <Maximize2 size={12} />
            </button>
            <button
              onClick={() => pipWindow?.close()}
              className="p-1 text-[#777] hover:text-white rounded transition"
              title="Close PiP"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      );
    }

    if (sizeMode === 'expanded') {
      return (
        <div className="w-full h-full flex flex-col justify-between p-2.5 bg-[#121212] text-white font-sans select-none box-border space-y-1.5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
              <img
                src={currentTrack?.cover_url || '/api/covers/0'}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shadow shrink-0 bg-[#242424]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {currentTrack?.title || 'No Track'}
                </p>
                <p className="text-[10px] text-[#b3b3b3] truncate mt-0.5">
                  {currentTrack?.artist_name || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={cycleSizeMode}
                className="p-1 text-[#777] hover:text-white rounded transition"
                title="Shrink Mode"
              >
                <Minimize2 size={13} />
              </button>
              <button
                onClick={() => pipWindow?.close()}
                className="p-1 text-[#777] hover:text-white rounded transition"
                title="Close PiP"
              >
                <X size={13} />
              </button>
            </div>
          </div>
          {/* Scrubber progress */}
          <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
            <div
              className="bg-[#1ed760] h-full transition-all duration-150"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={prevTrack}
              className="p-1 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 transition"
              title="Previous"
            >
              <SkipBack size={15} />
            </button>
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} className="fill-black" /> : <Play size={14} className="fill-black ml-0.5" />}
            </button>
            <button
              onClick={nextTrack}
              className="p-1 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 transition"
              title="Next"
            >
              <SkipForward size={15} />
            </button>
          </div>
        </div>
      );
    }

    // Default 'compact' mode
    return (
      <div className="w-full h-full flex items-center justify-between p-2.5 bg-[#121212] text-white font-sans select-none box-border">
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
          {currentTrack && (
            <img
              src={currentTrack.cover_url || '/api/covers/0'}
              alt=""
              className="w-10 h-10 rounded-lg object-cover shadow shrink-0 bg-[#242424]"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {currentTrack?.title || 'No Track'}
            </p>
            <p className="text-[10px] text-[#b3b3b3] truncate mt-0.5">
              {currentTrack?.artist_name || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={prevTrack}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
            title="Previous"
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} className="fill-black" /> : <Play size={14} className="fill-black ml-0.5" />}
          </button>
          <button
            onClick={nextTrack}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
            title="Next"
          >
            <SkipForward size={15} />
          </button>
          <div className="w-px h-3.5 bg-white/10 mx-0.5" />
          <button
            onClick={cycleSizeMode}
            className="p-1 text-[#777] hover:text-white rounded transition"
            title="Shrink to 3-button mode"
          >
            <Minimize2 size={13} />
          </button>
          <button
            onClick={() => pipWindow?.close()}
            className="p-1 text-[#777] hover:text-white rounded transition"
            title="Close PiP"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Document PiP Portal (Persistent OS desktop window across tabs & apps) */}
      {pipWindow && createPortal(renderPiPContent(), pipWindow.document.body)}

      {/* 2. In-App Draggable & Resizable Mini Player Fallback */}
      {isOpen && !pipWindow && (
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            touchAction: 'none',
          }}
          className={`fixed z-50 transition-shadow select-none shadow-2xl rounded-2xl border border-white/10 bg-[#121212]/95 backdrop-blur-xl group cursor-move ${
            isDragging ? 'shadow-green-500/20 scale-[1.01]' : ''
          }`}
        >
          {/* MICRO MODE: Only the 3 transport buttons */}
          {sizeMode === 'micro' && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 rounded-full border border-white/10">
              <button
                type="button"
                onClick={prevTrack}
                className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
                title="Previous"
              >
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="w-7 h-7 rounded-full bg-[#1ed760] text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={nextTrack}
                className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition"
                title="Next"
              >
                <SkipForward size={14} />
              </button>

              <div className="w-px h-3.5 bg-white/10 mx-0.5" />

              <button
                type="button"
                onClick={cycleSizeMode}
                className="p-1 text-[#888] hover:text-white rounded-md hover:bg-white/10 transition"
                title="Expand Mini Player"
              >
                <Maximize2 size={12} />
              </button>
              {'documentPictureInPicture' in window && (
                <button
                  type="button"
                  onClick={togglePiP}
                  className="p-1 text-[#888] hover:text-[#1ed760] rounded-md hover:bg-white/10 transition"
                  title="Pop out Picture-in-Picture (Cross-tab window)"
                >
                  <PictureInPicture2 size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-[#888] hover:text-white rounded-md hover:bg-white/10 transition"
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* COMPACT MODE: Cover art + title + 3 buttons */}
          {sizeMode === 'compact' && (
            <div className="flex items-center gap-3 p-2 min-w-[260px] max-w-[320px]">
              <img
                src={currentTrack?.cover_url || '/api/covers/0'}
                alt=""
                className="w-10 h-10 rounded-lg object-cover bg-[#222] shrink-0 shadow-sm"
              />
              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs font-bold text-white truncate">
                  {currentTrack?.title || 'No Track'}
                </p>
                <p className="text-[10px] text-[#b3b3b3] truncate mt-0.5">
                  {currentTrack?.artist_name || ''}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1 text-[#b3b3b3] hover:text-white transition"
                  title="Previous"
                >
                  <SkipBack size={14} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1 text-[#b3b3b3] hover:text-white transition"
                  title="Next"
                >
                  <SkipForward size={14} />
                </button>

                <div className="w-px h-3.5 bg-white/10 mx-0.5" />

                <button
                  type="button"
                  onClick={cycleSizeMode}
                  className="p-1 text-[#888] hover:text-white rounded transition"
                  title="Resize Mini Player"
                >
                  <Maximize2 size={12} />
                </button>
                {'documentPictureInPicture' in window && (
                  <button
                    type="button"
                    onClick={togglePiP}
                    className="p-1 text-[#888] hover:text-[#1ed760] rounded transition"
                    title="Pop out Picture-in-Picture (Cross-tab window)"
                  >
                    <ExternalLink size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-[#888] hover:text-white rounded transition"
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* EXPANDED MODE: Larger cover + title + artist + seek progress + controls */}
          {sizeMode === 'expanded' && (
            <div className="flex flex-col p-3 min-w-[290px] max-w-[340px] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                  <img
                    src={currentTrack?.cover_url || '/api/covers/0'}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover bg-[#222] shrink-0 shadow-md"
                  />
                  <div className="truncate flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {currentTrack?.title || 'No Track'}
                    </p>
                    <p className="text-[10px] text-[#b3b3b3] truncate mt-0.5">
                      {currentTrack?.artist_name || ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={cycleSizeMode}
                    className="p-1 text-[#888] hover:text-white rounded transition"
                    title="Shrink to 3-button mode"
                  >
                    <Minimize2 size={13} />
                  </button>
                  {'documentPictureInPicture' in window && (
                    <button
                      type="button"
                      onClick={togglePiP}
                      className="p-1 text-[#888] hover:text-[#1ed760] rounded transition"
                      title="Pop out Picture-in-Picture"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-[#888] hover:text-white rounded transition"
                    title="Close"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-[#1ed760] h-full transition-all duration-150"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>

              {/* Transport Buttons */}
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={prevTrack}
                  className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 transition"
                  title="Previous"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={15} className="fill-black" /> : <Play size={15} className="fill-black ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-1.5 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 transition"
                  title="Next"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
