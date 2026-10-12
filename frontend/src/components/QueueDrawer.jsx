import React from 'react';
import { X, Play, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const QueueDrawer = ({ isOpen, onClose }) => {
  const { queue, queueIndex, currentTrack, playTrack } = usePlayer();

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);

  return (
    <aside className="w-80 bg-[#121212] border-l border-[#282828] flex flex-col h-full z-30 select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-[#282828]">
        <h3 className="font-bold text-white text-base">Play Queue</h3>
        <button
          onClick={onClose}
          className="text-[#B3B3B3] hover:text-white p-1 rounded-lg transition"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Now Playing */}
        <div>
          <span className="text-xs font-bold text-[#B3B3B3] uppercase tracking-wider block mb-2">
            Now Playing
          </span>
          {currentTrack ? (
            <div className="flex items-center gap-3 p-2.5 bg-[#282828] rounded-lg">
              <img
                src={currentTrack.cover_url}
                alt={currentTrack.title}
                className="w-12 h-12 rounded object-cover bg-[#181818]"
              />
              <div className="truncate">
                <p className="text-sm font-semibold text-[#1DB954] truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-[#B3B3B3] truncate">
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
          <span className="text-xs font-bold text-[#B3B3B3] uppercase tracking-wider block mb-2">
            Next Up ({upcomingTracks.length})
          </span>
          {upcomingTracks.length > 0 ? (
            <div className="space-y-1">
              {upcomingTracks.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  onClick={() => playTrack(track, queue)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1f1f1f] group cursor-pointer transition"
                >
                  <span className="text-xs font-mono text-[#666] w-4">{i + 1}</span>
                  <div className="truncate flex-1">
                    <p className="text-xs font-medium text-white group-hover:text-[#1DB954] truncate">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-[#888] truncate">{track.artist_name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#666] py-6 text-center">
              No tracks in upcoming queue
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
