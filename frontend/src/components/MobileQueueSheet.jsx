import React from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause, Trash2, ListMusic, Compass } from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';

export const MobileQueueSheet = ({
  isOpen,
  onClose,
  onSelectAlbum,
  onSelectArtist,
}) => {
  const {
    queue,
    queueIndex,
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    reorderQueue,
  } = usePlayer();

  if (!isOpen) return null;

  const upcomingTracks = queue ? queue.slice(queueIndex + 1) : [];

  const handlePlayUpcoming = (track, upcomingIdx) => {
    // New index in queue is queueIndex + 1 + upcomingIdx
    playTrack(track);
  };

  const handleRemoveTrack = (upcomingIdx, e) => {
    e.stopPropagation();
    if (!queue || !reorderQueue) return;
    const actualIdx = queueIndex + 1 + upcomingIdx;
    const newQueue = [...queue.slice(0, actualIdx), ...queue.slice(actualIdx + 1)];
    reorderQueue(newQueue);
  };

  const handleClearUpcoming = () => {
    if (!queue || !reorderQueue) return;
    const newQueue = queue.slice(0, queueIndex + 1);
    reorderQueue(newQueue);
  };

  return createPortal(
    <div
      data-dev-component="MobileQueueSheet"
      data-dev-file="src/components/MobileQueueSheet.jsx"
      data-dev-desc="Touch-friendly bottom sheet for inspecting and managing the active play queue on mobile"
      className="fixed inset-0 h-[100dvh] max-h-[100dvh] z-[80] flex flex-col justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85dvh] bg-surface-elevated border-t border-border-medium rounded-t-3xl flex flex-col overflow-hidden text-white shadow-2xl animate-in slide-in-from-bottom-8 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header ── */}
        <div className="pt-3 px-4 pb-3 border-b border-border-subtle/50 flex flex-col items-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 mb-3" />
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic size={18} className="text-brand-400" />
              <h3 className="font-bold text-base text-white">Play Queue</h3>
              {upcomingTracks.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30">
                  {upcomingTracks.length} next
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {upcomingTracks.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearUpcoming}
                  className="text-xs text-content-secondary hover:text-red-400 px-2 py-1 transition"
                >
                  Clear Queue
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-surface-island flex items-center justify-center text-content-secondary hover:text-white transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content List ── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pb-[max(2.5rem,calc(env(safe-area-inset-bottom,0px)+2rem))]">
          {/* Currently Playing Card */}
          {currentTrack ? (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-content-muted block mb-2 px-1">
                Now Playing
              </span>
              <div className="bg-surface-island/80 border border-brand-500/30 rounded-2xl p-3 flex items-center gap-3 shadow-md">
                <img
                  src={resolveCoverUrl(currentTrack)}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-brand-400 truncate">
                    {currentTrack.title}
                  </h4>
                  <p className="text-xs text-content-secondary truncate mt-0.5">
                    {currentTrack.artist_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full bg-brand-500 text-black flex items-center justify-center shrink-0 shadow active:scale-95 transition"
                >
                  {isPlaying ? (
                    <Pause size={16} className="fill-black" />
                  ) : (
                    <Play size={16} className="fill-black ml-0.5" />
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {/* Next Up Section */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-content-muted block mb-2 px-1">
              Next in Queue
            </span>

            {upcomingTracks.length === 0 ? (
              <div className="bg-surface-island/40 border border-dashed border-border-medium rounded-2xl p-6 text-center text-content-secondary">
                <Compass size={24} className="mx-auto mb-2 text-content-muted" />
                <p className="text-xs font-semibold text-white">No upcoming tracks</p>
                <p className="text-[11px] text-content-muted mt-0.5">
                  Tracks you add to the queue or songs from playlists will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {upcomingTracks.map((track, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    onClick={() => handlePlayUpcoming(track, idx)}
                    className="p-2.5 rounded-xl bg-surface-island/40 hover:bg-surface-island border border-border-subtle/50 flex items-center justify-between gap-3 active:scale-[0.99] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-content-muted w-4 text-center shrink-0">
                        {idx + 1}
                      </span>
                      <img
                        src={resolveCoverUrl(track)}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0 bg-surface-elevated"
                      />
                      <div className="min-w-0 flex-1">
                        <h5 className="text-xs font-bold text-white truncate">
                          {track.title}
                        </h5>
                        <p className="text-[11px] text-content-secondary truncate mt-0.5">
                          {track.artist_name}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleRemoveTrack(idx, e)}
                      className="p-2 text-content-subtle hover:text-red-400 active:scale-90 transition shrink-0"
                      title="Remove from Queue"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
