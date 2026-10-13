import React, { useEffect, useRef } from 'react';
import { 
  Play, Pause, Plus, Heart, ListPlus, Disc3, Mic2, CornerDownRight, Trash2 
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const ContextMenu = ({
  isOpen,
  x,
  y,
  type = 'track',
  data,
  onClose,
  onSelectAlbum,
  onSelectArtist,
  onAddToPlaylist,
}) => {
  const menuRef = useRef(null);
  const { 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay, 
    addToQueue, 
    playNextInQueue, 
    isFavorite, 
    toggleFavorite 
  } = usePlayer();

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleScroll = () => onClose();

    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  // Screen boundary positioning adjustment
  const menuWidth = 220;
  const menuHeight = 240;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const isCurrentPlayingThis = data && currentTrack && currentTrack.id === data.id;
  const isFav = data && data.id ? isFavorite(data.id) : false;

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 w-56 bg-[#282828] text-[#e0e0e0] rounded-md shadow-2xl border border-white/10 py-1.5 text-xs font-medium select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'track' && (
        <>
          <button
            onClick={() => {
              if (isCurrentPlayingThis) {
                togglePlay();
              } else {
                playTrack(data);
              }
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
          >
            {isCurrentPlayingThis && isPlaying ? (
              <>
                <Pause size={15} className="text-[#1ed760]" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={15} className="text-[#1ed760]" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              addToQueue(data);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
          >
            <ListPlus size={15} className="text-[#b3b3b3]" />
            <span>Add to queue</span>
          </button>

          <button
            onClick={() => {
              playNextInQueue(data);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
          >
            <CornerDownRight size={15} className="text-[#b3b3b3]" />
            <span>Play next</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          <button
            onClick={() => {
              toggleFavorite(data.id);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
          >
            <Heart size={15} className={isFav ? 'fill-[#1ed760] text-[#1ed760]' : 'text-[#b3b3b3]'} />
            <span>{isFav ? 'Remove from Liked Songs' : 'Save to your Liked Songs'}</span>
          </button>

          {onAddToPlaylist && (
            <button
              onClick={() => {
                onAddToPlaylist(data);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
            >
              <Plus size={15} className="text-[#b3b3b3]" />
              <span>Add to playlist</span>
            </button>
          )}

          {(data.album_id || data.artist_id) && (
            <div className="h-[1px] bg-white/10 my-1 mx-2" />
          )}

          {data.album_id && onSelectAlbum && (
            <button
              onClick={() => {
                onSelectAlbum(data.album_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
            >
              <Disc3 size={15} className="text-[#b3b3b3]" />
              <span>Go to album</span>
            </button>
          )}

          {data.artist_id && onSelectArtist && (
            <button
              onClick={() => {
                onSelectArtist(data.artist_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
            >
              <Mic2 size={15} className="text-[#b3b3b3]" />
              <span>Go to artist</span>
            </button>
          )}

          {(data.onDelete || data.onRemoveFromPlaylist) && (
            <>
              <div className="h-[1px] bg-white/10 my-1 mx-2" />
              <button
                onClick={() => {
                  if (data.onDelete) data.onDelete();
                  else if (data.onRemoveFromPlaylist) data.onRemoveFromPlaylist();
                  onClose();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-red-500/20 hover:text-red-400 flex items-center gap-2.5 transition text-red-400 font-semibold"
              >
                <Trash2 size={15} />
                <span>{data.deleteLabel || 'Delete from playlist'}</span>
              </button>
            </>
          )}
        </>
      )}

      {type === 'album' && (
        <>
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/albums/${data.id}`);
                const albumData = await res.json();
                if (albumData.tracks && albumData.tracks.length > 0) {
                  playTrack(albumData.tracks[0], albumData.tracks);
                }
              } catch (e) {
                console.error(e);
              }
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
          >
            <Play size={15} className="text-[#1ed760]" />
            <span>Play album</span>
          </button>

          {onSelectAlbum && (
            <button
              onClick={() => {
                onSelectAlbum(data.id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
            >
              <Disc3 size={15} className="text-[#b3b3b3]" />
              <span>Go to album</span>
            </button>
          )}

          {data.artist_id && onSelectArtist && (
            <button
              onClick={() => {
                onSelectArtist(data.artist_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
            >
              <Mic2 size={15} className="text-[#b3b3b3]" />
              <span>Go to artist</span>
            </button>
          )}
        </>
      )}

      {type === 'artist' && onSelectArtist && (
        <button
          onClick={() => {
            onSelectArtist(data.id);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center gap-2.5 transition"
        >
          <Mic2 size={15} className="text-[#1ed760]" />
          <span>Go to artist</span>
        </button>
      )}
    </div>
  );
};
