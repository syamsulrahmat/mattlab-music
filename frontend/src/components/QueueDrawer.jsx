import React from 'react';
import { X, Play, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const QueueDrawer = ({ isOpen, onClose }) => {
  const { queue, queueIndex, currentTrack, playTrack } = usePlayer();

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);

  return (
    <aside className="w-80 bg-surface-island border-l border-border-subtle flex flex-col h-full z-30 select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border-subtle">
        <h3 className="font-bold text-content-primary text-base">Play Queue</h3>
        <button
          onClick={onClose}
          className="text-content-secondary hover:text-white p-1 rounded-lg transition"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Now Playing */}
        <div>
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-2">
            Now Playing
          </span>
          {currentTrack ? (
            <div className="flex items-center gap-3 p-2.5 bg-surface-elevated rounded-lg">
              <img
                src={currentTrack.cover_url}
                alt={currentTrack.title}
                className="w-12 h-12 rounded object-cover bg-surface-panel"
              />
              <div className="truncate">
                <p className="text-sm font-semibold text-brand-500 truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-content-secondary truncate">
                  {currentTrack.artist_name}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-content-subtle">Nothing playing right now</p>
          )}
        </div>

        {/* Next Up */}
        <div>
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-2">
            Next Up ({upcomingTracks.length})
          </span>
          {upcomingTracks.length > 0 ? (
            <div className="space-y-1">
              {upcomingTracks.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  onClick={() => playTrack(track, queue)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover group cursor-pointer transition"
                >
                  <span className="text-xs font-mono text-content-subtle w-4">{i + 1}</span>
                  <div className="truncate flex-1">
                    <p className="text-xs font-medium text-content-primary group-hover:text-brand-400 truncate">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-content-muted truncate">{track.artist_name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-content-subtle py-6 text-center">
              No tracks in upcoming queue
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
