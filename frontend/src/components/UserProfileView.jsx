import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Music,
  Radio,
  Clock,
  Plus,
  Check,
  Disc3,
  Calendar,
  Headphones,
  ListMusic,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';

const formatDurationHuman = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0 mins';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hrs} hr${hrs === 1 ? '' : 's'}${remainingMins > 0 ? ` ${remainingMins} min` : ''}`;
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffSec) || diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const UserProfileView = ({
  userId,
  onBack,
  onSelectPlaylist,
  onSelectAlbum,
  onSelectArtist,
  onPlaylistCloned,
}) => {
  const { user: currentUser } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlay, showToast } = usePlayer();

  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cloningPlaylistId, setCloningPlaylistId] = useState(null);
  const [clonedPlaylistIds, setClonedPlaylistIds] = useState(new Set());

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/users/${userId}/profile`);
      if (!res.ok) {
        throw new Error('User not found');
      }
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setError(err.message || 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  // Clone playlist into current user's library
  const handleClonePlaylist = async (playlist, e) => {
    if (e) e.stopPropagation();
    if (cloningPlaylistId === playlist.id || clonedPlaylistIds.has(playlist.id)) return;

    setCloningPlaylistId(playlist.id);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/clone`, {
        method: 'POST',
      });
      if (res.ok) {
        const cloned = await res.json();
        setClonedPlaylistIds((prev) => new Set(prev).add(playlist.id));
        if (showToast) {
          showToast(`✨ Saved "${playlist.name}" to your library!`);
        }
        onPlaylistCloned?.(cloned);
      } else {
        const err = await res.json().catch(() => ({}));
        if (showToast) {
          showToast(`⚠️ ${err.detail || 'Failed to save playlist'}`);
        }
      }
    } catch (err) {
      console.error('Failed to clone playlist:', err);
      if (showToast) {
        showToast('⚠️ Error saving playlist to library');
      }
    } finally {
      setCloningPlaylistId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-content-secondary gap-3">
        <Loader2 size={32} className="animate-spin text-brand-500" />
        <p className="text-sm font-semibold">Loading user profile...</p>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-content-secondary gap-3 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-island border border-border-medium flex items-center justify-center text-red-400">
          <Music size={24} />
        </div>
        <h3 className="text-white font-bold text-base">User Not Found</h3>
        <p className="text-xs text-content-secondary max-w-sm">{error || 'This user does not exist or has been removed.'}</p>
        <button
          onClick={onBack}
          className="mt-2 px-4 py-1.5 rounded-full bg-surface-elevated hover:bg-surface-hover text-white text-xs font-semibold transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  const { user, now_playing, playlists, stats, is_self } = profileData;
  const isNowPlayingThisTrack = now_playing && currentTrack?.id === now_playing.id && isPlaying;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 select-text">
      {/* ── Top Navigation Bar ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-surface-island hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition border border-border-subtle"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-xs font-mono text-content-muted uppercase tracking-wider">
          User Profile
        </span>
      </div>

      {/* ── User Profile Header Hero Banner ── */}
      <div className="bg-gradient-to-b from-surface-elevated to-surface-island border border-border-medium rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-end gap-6 shadow-xl relative overflow-hidden">
        {/* Ambient glow backdrop */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative shrink-0">
          <UserAvatar user={user} size="2xl" className="ring-4 ring-white/10 shadow-2xl" />
          {now_playing?.is_active && (
            <span
              className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 ring-4 ring-surface-elevated flex items-center justify-center text-black"
              title="Currently Listening"
            >
              <Radio size={11} className="animate-pulse" />
            </span>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-1 flex-wrap">
            <span className="text-[11px] font-mono text-content-secondary uppercase tracking-widest font-semibold">
              MattLab Profile
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                user.role === 'admin'
                  ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                  : 'bg-white/10 text-content-secondary border border-white/15'
              }`}
            >
              {user.role}
            </span>
            {is_self && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-content-primary">
                You
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate">
            {user.display_name}
          </h1>
          <p className="text-xs sm:text-sm text-content-secondary font-mono mt-0.5">
            @{user.username}
          </p>

          {/* Quick Stats Pill Row */}
          <div className="flex items-center justify-center sm:justify-start gap-4 mt-4 text-xs text-content-secondary flex-wrap">
            <div className="flex items-center gap-1.5 font-medium">
              <Headphones size={14} className="text-brand-400" />
              <span>
                <strong className="text-white font-bold">{stats.total_plays.toLocaleString()}</strong> track listens
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <ListMusic size={14} className="text-brand-400" />
              <span>
                <strong className="text-white font-bold">{stats.playlist_count}</strong> public playlists
              </span>
            </div>
            {user.created_at && (
              <div className="flex items-center gap-1.5 font-medium text-content-muted">
                <Calendar size={13} />
                <span>Joined {new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Activity Card ("Now Playing / Last Played") ── */}
      {now_playing ? (
        <div className="bg-surface-island border border-border-medium rounded-2xl p-5 sm:p-6 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              {now_playing.is_active ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Listening Right Now</span>
                  </span>
                </>
              ) : (
                <>
                  <Clock size={14} className="text-content-muted" />
                  <span className="text-xs font-semibold text-content-secondary">
                    Last Played {formatRelativeTime(now_playing.played_at)}
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (currentTrack?.id === now_playing.id) {
                  togglePlay();
                } else {
                  playTrack(now_playing, [now_playing], 0);
                }
              }}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-md transition active:scale-95"
            >
              {isNowPlayingThisTrack ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              <span>{isNowPlayingThisTrack ? 'Pause' : 'Listen Along'}</span>
            </button>
          </div>

          <div className="flex items-center gap-4 bg-surface-elevated/70 border border-border-subtle p-3 rounded-xl">
            <img
              src={now_playing.cover_url || '/api/covers/0'}
              alt=""
              className="w-14 h-14 rounded-lg object-cover bg-surface-island shrink-0 border border-border-subtle shadow"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm sm:text-base font-bold text-white truncate hover:text-brand-400 transition cursor-pointer"
                onClick={() => now_playing.album_id && onSelectAlbum?.(now_playing.album_id)}
              >
                {now_playing.title}
              </h4>
              <p className="text-xs text-content-secondary truncate mt-0.5">
                <span
                  className="hover:underline cursor-pointer hover:text-white"
                  onClick={() => now_playing.artist_id && onSelectArtist?.(now_playing.artist_id)}
                >
                  {now_playing.artist_name}
                </span>
                {now_playing.album_title && (
                  <>
                    <span className="text-content-muted mx-1.5">•</span>
                    <span
                      className="hover:underline cursor-pointer hover:text-white"
                      onClick={() => now_playing.album_id && onSelectAlbum?.(now_playing.album_id)}
                    >
                      {now_playing.album_title}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Public Playlists Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Playlists by {user.display_name}
            </h2>
            <p className="text-xs text-content-secondary mt-0.5">
              Browse public playlists and save them to your library
            </p>
          </div>
          <span className="text-xs font-mono text-content-muted">
            {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
          </span>
        </div>

        {playlists.length === 0 ? (
          <div className="bg-surface-island/50 border border-dashed border-border-medium rounded-2xl p-8 text-center text-content-secondary">
            <ListMusic size={28} className="mx-auto mb-2 text-content-muted" />
            <p className="text-xs font-semibold text-white">No playlists created yet</p>
            <p className="text-[11px] text-content-muted mt-0.5">When {user.display_name} creates public playlists, they will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {playlists.map((pl) => {
              const isCloned = clonedPlaylistIds.has(pl.id);
              const isCloning = cloningPlaylistId === pl.id;

              return (
                <div
                  key={pl.id}
                  onClick={() => onSelectPlaylist?.(pl.id)}
                  className="group bg-surface-island/70 hover:bg-surface-island border border-border-subtle hover:border-border-medium p-3 rounded-2xl transition shadow-sm hover:shadow-xl cursor-pointer flex flex-col justify-between"
                >
                  {/* Playlist Cover Art Collage (2x2) */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-elevated border border-border-subtle mb-3 shadow">
                    {pl.covers && pl.covers.length >= 4 ? (
                      <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                        {pl.covers.slice(0, 4).map((cUrl, idx) => (
                          <img key={idx} src={cUrl} alt="" className="w-full h-full object-cover" />
                        ))}
                      </div>
                    ) : pl.covers && pl.covers.length > 0 ? (
                      <img src={pl.covers[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-content-muted">
                        <ListMusic size={32} />
                      </div>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-brand-400 transition">
                      {pl.name}
                    </h3>
                    <p className="text-[11px] text-content-secondary truncate mt-0.5">
                      {pl.track_count} tracks • {formatDurationHuman(pl.total_duration)}
                    </p>
                  </div>

                  {/* 1-Click "Save to My Library" button */}
                  {!is_self && (
                    <button
                      type="button"
                      onClick={(e) => handleClonePlaylist(pl, e)}
                      disabled={isCloned || isCloning}
                      className={`mt-3 w-full py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 border ${
                        isCloned
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 cursor-default'
                          : 'bg-surface-elevated hover:bg-brand-500 hover:text-black border-border-medium text-content-primary'
                      }`}
                      title={isCloned ? 'Saved to your library' : 'Clone playlist into your library'}
                    >
                      {isCloning ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : isCloned ? (
                        <>
                          <Check size={12} className="text-emerald-400" />
                          <span>Saved to Library</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>Save to My Library</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
