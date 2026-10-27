import React from 'react';
import { X, Play, Music, Sparkles, Radio } from 'lucide-react';
import { SpotifyIcon } from './SpotifyIcon';
import { usePlayer } from '../context/PlayerContext';

export const QueueDrawer = ({ isOpen, onClose }) => {
  const { 
    queue, 
    queueIndex, 
    currentTrack, 
    playTrack, 
    autoplaySimilar, 
    setAutoplaySimilar,
    recommendedTracks,
    seedGenre
  } = usePlayer();

  if (!isOpen) return null;

  const upcomingTracks = queue.slice(queueIndex + 1);

  return (
    <aside className="w-80 bg-surface-island border-l border-border-subtle flex flex-col h-full z-30 select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-content-primary text-base">Play Queue</h3>
          {seedGenre && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              {seedGenre}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-content-secondary hover:text-white p-1 rounded-lg transition"
          title="Close queue"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Autoplay Similar Songs Control Card */}
        <div className="p-3 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              autoplaySimilar ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-content-muted'
            }`}>
              <Radio size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Autoplay Similar</span>
              </div>
              <p className="text-[10px] text-content-muted truncate">
                {autoplaySimilar ? 'Similar niche tracks play next' : 'Stops at end of queue'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setAutoplaySimilar(!autoplaySimilar)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors relative shrink-0 ${
              autoplaySimilar ? 'bg-brand-500' : 'bg-surface-panel border border-white/10'
            }`}
            title="Toggle autoplay similar niche tracks"
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
              autoplaySimilar ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Now Playing */}
        <div>
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-2">
            Now Playing
          </span>
          {currentTrack ? (
            <div className="flex items-center gap-3 p-2.5 bg-surface-elevated rounded-xl border border-border-subtle">
              <img
                src={currentTrack.cover_url}
                alt={currentTrack.title}
                className="w-12 h-12 rounded-lg object-cover bg-surface-panel shrink-0"
              />
              <div className="truncate min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-400 truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-content-secondary truncate mt-0.5">
                  {currentTrack.artist_name}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-content-subtle">Nothing playing right now</p>
          )}
        </div>

        {/* Next Up in Queue */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">
              Next Up ({upcomingTracks.length})
            </span>
          </div>
          {upcomingTracks.length > 0 ? (
            <div className="space-y-1">
              {upcomingTracks.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  onClick={() => playTrack(track, queue)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-elevated group cursor-pointer transition border border-transparent hover:border-border-subtle"
                >
                  <span className="text-xs font-mono text-content-muted w-4">{i + 1}</span>
                  <div className="truncate flex-1 min-w-0">
                    <p className="text-xs font-semibold text-content-primary group-hover:text-brand-400 truncate">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-content-muted truncate">{track.artist_name}</p>
                  </div>
                  {track.is_recommended && (
                    <span className="text-[9px] font-bold text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20 shrink-0">
                      Auto
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-content-subtle py-4 text-center rounded-xl bg-surface-panel/40 border border-border-subtle">
              {autoplaySimilar 
                ? 'Queue empty • Similar tracks will autoplay next' 
                : 'No tracks in upcoming queue'}
            </div>
          )}
        </div>

        {/* Recommended for You Preview (when autoplay is active) */}
        {autoplaySimilar && recommendedTracks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-brand-400" />
                <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Recommended For You
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                <SpotifyIcon size={10} />
                <span>Spotify Radio</span>
              </span>
            </div>
            <div className="space-y-1">
              {recommendedTracks.slice(0, 6).map((rec) => (
                <div
                  key={`rec-${rec.id}`}
                  onClick={() => playTrack(rec)}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-panel/40 hover:bg-surface-elevated group cursor-pointer transition border border-border-subtle"
                >
                  <img
                    src={rec.cover_url}
                    alt={rec.title}
                    className="w-9 h-9 rounded-lg object-cover bg-surface-island shrink-0"
                  />
                  <div className="truncate flex-1 min-w-0">
                    <p className="text-xs font-semibold text-content-primary group-hover:text-brand-400 truncate">
                      {rec.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-content-muted truncate mt-0.5">
                      <span className="truncate">{rec.artist_name}</span>
                      <span>•</span>
                      <span className="text-brand-400/90 shrink-0">{rec.recommendation_reason}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
