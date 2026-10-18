import React, { useState } from 'react';
import { X, Play, Music, ListMusic, Compass, CheckCircle2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const QueueIsland = ({ 
  isOpen, 
  onClose, 
  onDiscoverMusic,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu
}) => {
  const { queue, queueIndex, currentTrack, playTrack, isTrackPreloaded, reorderQueue } = usePlayer();
  const [draggedUpcomingIdx, setDraggedUpcomingIdx] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { idx, position: 'above' | 'below' }

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);
  const isQueueEmpty = !currentTrack && queue.length === 0;

  return (
    <aside className="hidden lg:flex flex-col h-full w-[300px] shrink-0 bg-surface-island rounded-lg overflow-hidden select-none border border-border-subtle">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-brand-500" />
          <h3 className="font-bold text-sm text-content-primary tracking-tight">Play Queue</h3>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-surface-elevated text-content-secondary hover:text-content-primary flex items-center justify-center transition"
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
            {/* Now Playing */}
            <div>
              <span className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-2.5">
                Now Playing
              </span>
              {currentTrack ? (
                <div 
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      id: currentTrack.id,
                      title: currentTrack.title,
                      artist_name: currentTrack.artist_name,
                      album_id: currentTrack.album_id,
                      album_title: currentTrack.album_title,
                      cover_url: currentTrack.cover_url
                    }));
                    e.dataTransfer.setData('text/plain', String(currentTrack.id));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', currentTrack);
                    }
                  }}
                  className="flex items-center gap-3 p-2.5 bg-surface-elevated rounded-lg border border-border-subtle shadow-sm group cursor-grab active:cursor-grabbing select-none"
                >
                  <img
                    src={currentTrack.cover_url || '/api/covers/0'}
                    alt={currentTrack.title}
                    onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                    className="w-12 h-12 rounded object-cover bg-surface-hover shrink-0 cursor-pointer hover:opacity-90 transition"
                  />
                  <div className="truncate flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 justify-between">
                      <p 
                        onClick={() => onSelectAlbum && onSelectAlbum(currentTrack.album_id)}
                        className="text-xs font-bold text-brand-500 truncate cursor-pointer hover:underline"
                      >
                        {currentTrack.title}
                      </p>
                      {isTrackPreloaded(currentTrack.id) && (
                        <span 
                          title="Cached locally (offline ready)"
                          className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded-full"
                        >
                          <CheckCircle2 size={10} />
                          <span>Ready</span>
                        </span>
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
              ) : (
                <p className="text-xs text-content-subtle">Nothing playing right now</p>
              )}
            </div>

            {/* Next Up */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Next Up ({upcomingTracks.length})
                </span>
              </div>

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
                              setDropTarget({
                                idx: i,
                                position: e.clientY < midY ? 'above' : 'below',
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
                            src={track.cover_url || '/api/covers/0'}
                            alt=""
                            className="w-9 h-9 rounded object-cover bg-surface-elevated2 shrink-0"
                          />
                          <div className="truncate flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <p className="text-xs font-medium text-content-primary group-hover:text-brand-400 truncate">
                                {track.title}
                              </p>
                              {isTrackPreloaded(track.id) && (
                                <span 
                                  title="Preloaded & offline ready (will play even if connection drops)"
                                  className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded-full"
                                >
                                  <CheckCircle2 size={9} />
                                  <span>Preloaded</span>
                                </span>
                              )}
                            </div>
                            <p 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectArtist) onSelectArtist(track.artist_id);
                              }}
                              className="text-[10px] text-content-secondary truncate hover:text-content-primary hover:underline cursor-pointer"
                            >
                              {track.artist_name}
                            </p>
                          </div>
                        </div>
                        {isTargetBelow && (
                          <div className="h-0.5 w-full bg-brand-500 rounded-full my-1 shadow-sm shadow-brand-500/50 pointer-events-none" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-content-subtle py-6 text-center">
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
