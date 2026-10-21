import React, { useState } from 'react';
import { Compass, CheckCircle2 } from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';
import { NowPlayingVideo } from './NowPlayingVideo';

export const QueueIsland = ({ 
  isOpen, 
  onClose, 
  onDiscoverMusic,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu,
}) => {
  const { 
    queue, 
    queueIndex, 
    currentTrack, 
    playTrack, 
    isTrackPreloaded, 
    reorderQueue,
    isFavorite,
    toggleFavorite 
  } = usePlayer();

  const [draggedUpcomingIdx, setDraggedUpcomingIdx] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { idx, position: 'above' | 'below' }

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);
  const isQueueEmpty = !currentTrack && queue.length === 0;

  return (
    <aside className="hidden lg:flex flex-col h-full w-[320px] shrink-0 bg-surface-island rounded-lg overflow-hidden select-none border border-border-subtle shadow-xl">
      {isQueueEmpty ? (
        /* Centered Empty State with Green Button */
        <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
          <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center text-brand-500 mb-4 shadow-lg">
            <Compass size={28} />
          </div>
          <h4 className="font-bold text-content-primary text-base mb-1">Your queue is empty</h4>
          <p className="text-xs text-content-secondary mb-6 max-w-[200px]">
            Add songs from your albums or playlists to queue them up here.
          </p>
          <button
            onClick={onDiscoverMusic}
            className="bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black font-bold text-xs px-5 py-2.5 rounded-full shadow-lg transition flex items-center gap-2"
          >
            Discover Music
          </button>
        </div>
      ) : (
        <>
          {/* ================= PINNED TOP SECTION (VISUALIZER + HEADER) ================= */}
          <div className="p-3.5 pb-2 shrink-0 space-y-3">
            {currentTrack && (
              <NowPlayingVideo track={currentTrack} onSelectAlbum={onSelectAlbum} />
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <h2 className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight">
                Next in queue
              </h2>
              {upcomingTracks.length > 0 && (
                <span className="inline-flex items-center justify-center text-[10px] font-mono font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-full shrink-0 translate-y-[2px]">
                  {upcomingTracks.length} {upcomingTracks.length === 1 ? 'track' : 'tracks'}
                </span>
              )}
            </div>
          </div>

          {/* ================= SCROLLABLE QUEUE TRACKS LIST ================= */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3.5 pt-1 space-y-1">
            {upcomingTracks.length > 0 ? (
              <div 
                onDragOver={(e) => {
                  if (draggedUpcomingIdx !== null) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDragEnter={(e) => {
                  if (draggedUpcomingIdx !== null) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                className="space-y-1"
              >
                {upcomingTracks.map((track, i) => {
                  const isTargetAbove = dropTarget?.idx === i && dropTarget?.position === 'above' && draggedUpcomingIdx !== i;
                  const isTargetBelow = dropTarget?.idx === i && dropTarget?.position === 'below' && draggedUpcomingIdx !== i;
                  const isBeingDragged = draggedUpcomingIdx === i;

                  return (
                    <React.Fragment key={`${track.id}-${i}`}>
                      {isTargetAbove && (
                        <div className="h-0.5 w-full bg-brand-500 rounded-full my-1 shadow-sm shadow-brand-500/50 pointer-events-none" />
                      )}
                      <div
                        draggable="true"
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            id: track.id,
                            title: track.title,
                            artist_name: track.artist_name,
                            album_id: track.album_id,
                            album_title: track.album_title,
                            cover_url: track.cover_url
                          }));
                          e.dataTransfer.setData('text/plain', String(track.id));
                          e.dataTransfer.setData('text/queue-upcoming-idx', String(i));
                          e.dataTransfer.effectAllowed = 'copyMove';
                          setDraggedUpcomingIdx(i);
                        }}
                        onDragEnd={() => {
                          setDraggedUpcomingIdx(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(e) => {
                          if (draggedUpcomingIdx !== null) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const midY = rect.top + rect.height / 2;
                            const newPos = e.clientY < midY ? 'above' : 'below';
                            setDropTarget((prev) => {
                              if (prev && prev.idx === i && prev.position === newPos) return prev;
                              return { idx: i, position: newPos };
                            });
                          }
                        }}
                        onDrop={(e) => {
                          if (draggedUpcomingIdx !== null) {
                            e.preventDefault();
                            const fromRel = draggedUpcomingIdx;
                            let toRel = i;
                            if (dropTarget?.position === 'below' && fromRel > i) {
                              toRel = i + 1;
                            } else if (dropTarget?.position === 'above' && fromRel < i) {
                              toRel = i - 1;
                            }
                            toRel = Math.max(0, Math.min(upcomingTracks.length - 1, toRel));

                            setDraggedUpcomingIdx(null);
                            setDropTarget(null);

                            if (fromRel === toRel) return;

                            const baseQueueIdx = queueIndex >= 0 ? queueIndex + 1 : 0;
                            reorderQueue(baseQueueIdx + fromRel, baseQueueIdx + toRel);
                          }
                        }}
                        onClick={() => playTrack(track, queue)}
                        onContextMenu={(e) => {
                          if (onContextMenu) {
                            e.preventDefault();
                            onContextMenu(e, 'track', track);
                          }
                        }}
                        className={`flex items-center gap-2 p-2 rounded-md hover:bg-surface-elevated group cursor-pointer transition select-none border border-transparent ${
                          draggedUpcomingIdx !== null ? '[&_*]:pointer-events-none' : ''
                        } ${
                          isBeingDragged ? 'opacity-40 border-dashed border-white/20' : ''
                        }`}
                      >
                        <span className="text-[11px] font-mono text-content-subtle w-4 text-center shrink-0">
                          {i + 1}
                        </span>
                        <img
                          src={resolveCoverUrl(track)}
                          alt=""
                          className="w-9 h-9 rounded object-cover bg-surface-elevated2 shrink-0"
                        />
                        <div className="truncate flex-1 min-w-0">
                          <p className="text-xs font-medium text-content-primary group-hover:text-brand-400 truncate">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-content-secondary truncate pointer-events-none select-none">
                            {track.artist_name}
                          </p>
                        </div>
                        {isTrackPreloaded(track.id) && (
                          <CheckCircle2 
                            size={14} 
                            className="text-brand-500 shrink-0 self-center" 
                            title="Preloaded & offline ready"
                          />
                        )}
                      </div>
                      {isTargetBelow && (
                        <div className="h-0.5 w-full bg-brand-500 rounded-full my-1 shadow-sm shadow-brand-500/50 pointer-events-none" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-content-subtle py-6 text-center bg-surface-elevated/40 rounded-xl border border-dashed border-border-subtle/50">
                No upcoming songs in queue
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
};
