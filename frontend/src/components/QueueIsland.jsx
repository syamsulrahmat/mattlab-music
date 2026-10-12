import React from 'react';
import { X, Play, Music, ListMusic, Compass } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const QueueIsland = ({ 
  isOpen, 
  onClose, 
  onDiscoverMusic,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu
}) => {
  const { queue, queueIndex, currentTrack, playTrack } = usePlayer();

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);
  const isQueueEmpty = !currentTrack && queue.length === 0;

  return (
    <aside className="hidden lg:flex flex-col h-full w-[300px] shrink-0 bg-[#121212] rounded-lg overflow-hidden select-none border border-white/5">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-[#1ed760]" />
          <h3 className="font-bold text-sm text-white tracking-tight">Play Queue</h3>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-[#1f1f1f] text-[#b3b3b3] hover:text-white flex items-center justify-center transition"
          title="Close Queue"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isQueueEmpty ? (
          /* Centered Empty State with Green Button */
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
            <div className="w-16 h-16 rounded-full bg-[#1f1f1f] flex items-center justify-center text-[#1ed760] mb-4 shadow-lg">
              <Compass size={28} />
            </div>
            <h4 className="font-bold text-white text-base mb-1">Your queue is empty</h4>
            <p className="text-xs text-[#b3b3b3] mb-6 max-w-[200px]">
              Add songs from your albums or playlists to queue them up here.
            </p>
            <button
              onClick={onDiscoverMusic}
              className="bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black font-bold text-xs px-5 py-2.5 rounded-full shadow-lg transition flex items-center gap-2"
            >
              Discover Music
            </button>
          </div>
        ) : (
          <>
            {/* Now Playing */}
            <div>
              <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block mb-2.5">
                Now Playing
              </span>
              {currentTrack ? (
                <div 
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', currentTrack);
                    }
                  }}
                  className="flex items-center gap-3 p-2.5 bg-[#1f1f1f] rounded-lg border border-white/5 shadow-sm group"
                >
                  <img
                    src={currentTrack.cover_url || '/api/covers/0'}
                    alt={currentTrack.title}
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="w-12 h-12 rounded object-cover bg-[#282828] shrink-0 cursor-pointer hover:opacity-90 transition"
                  />
                  <div className="truncate flex-1">
                    <p 
                      onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                      className="text-xs font-bold text-[#1ed760] truncate cursor-pointer hover:underline"
                    >
                      {currentTrack.title}
                    </p>
                    <p 
                      onClick={() => onSelectArtist && onSelectArtist(currentTrack.artist_id)}
                      className="text-[11px] text-[#b3b3b3] truncate mt-0.5 cursor-pointer hover:text-white hover:underline"
                    >
                      {currentTrack.artist_name}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#666]">Nothing playing right now</p>
              )}
            </div>

            {/* Next Up */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider">
                  Next Up ({upcomingTracks.length})
                </span>
              </div>

              {upcomingTracks.length > 0 ? (
                <div className="space-y-1">
                  {upcomingTracks.map((track, i) => (
                    <div
                      key={`${track.id}-${i}`}
                      onClick={() => playTrack(track, queue)}
                      onContextMenu={(e) => {
                        if (onContextMenu) {
                          e.preventDefault();
                          onContextMenu(e, 'track', track);
                        }
                      }}
                      className="flex items-center gap-2.5 p-2 rounded-md hover:bg-[#1f1f1f] group cursor-pointer transition"
                    >
                      <span className="text-[11px] font-mono text-[#666] w-4 text-center">
                        {i + 1}
                      </span>
                      <img
                        src={track.cover_url || '/api/covers/0'}
                        alt=""
                        className="w-9 h-9 rounded object-cover bg-[#242424] shrink-0"
                      />
                      <div className="truncate flex-1">
                        <p className="text-xs font-medium text-white group-hover:text-[#1ed760] truncate">
                          {track.title}
                        </p>
                        <p 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectArtist) onSelectArtist(track.artist_id);
                          }}
                          className="text-[10px] text-[#b3b3b3] truncate hover:text-white hover:underline cursor-pointer"
                        >
                          {track.artist_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#666] py-6 text-center">
                  No upcoming songs in queue
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
