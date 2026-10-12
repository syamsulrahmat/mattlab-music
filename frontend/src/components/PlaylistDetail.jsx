import React, { useEffect, useState } from 'react';
import { Play, Pause, Trash2, ArrowLeft, Clock, Music, Shuffle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const PlaylistDetail = ({ 
  playlistId, 
  onBack, 
  onPlaylistDeleted, 
  onSelectAlbum, 
  onSelectArtist, 
  onContextMenu 
}) => {
  const [playlist, setPlaylist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [draggedTrackIdx, setDraggedTrackIdx] = useState(null);
  const [dragOverTrackIdx, setDragOverTrackIdx] = useState(null);
  const { 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay, 
    isShuffle, 
    toggleShuffle, 
    setQueue, 
    setQueueIndex 
  } = usePlayer();

  const fetchPlaylist = async () => {
    if (!playlistId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`);
      if (!res.ok) throw new Error('Playlist not found');
      const data = await res.json();
      setPlaylist({
        ...data,
        tracks: Array.isArray(data.tracks) ? data.tracks : [],
        covers: Array.isArray(data.covers) ? data.covers : [],
      });
    } catch (err) {
      console.error('Failed to load playlist:', err);
      setPlaylist(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSelectedTrackId(null);
    fetchPlaylist();
  }, [playlistId]);

  const tracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
  const isCurrentPlayingInPlaylist =
    currentTrack && tracks.some((t) => t.id === currentTrack.id);

  const handleTrackPlay = (track) => {
    if (isShuffle && tracks.length > 1) {
      const others = tracks.filter((t) => t.id !== track.id);
      const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
      playTrack(track, [track, ...shuffledOthers]);
    } else {
      playTrack(track, tracks);
    }
  };

  // Keyboard navigation: Enter or Space to play selected track
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.key === 'Enter' || e.code === 'Space') && selectedTrackId && tracks.length > 0) {
        const found = tracks.find((t) => t.id === selectedTrackId);
        if (found) {
          e.preventDefault();
          handleTrackPlay(found);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrackId, tracks, isShuffle, playTrack]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1ed760]" />
      </div>
    );
  }

  if (!playlist || !playlist.id) {
    return (
      <div className="p-8 text-center text-[#b3b3b3]">
        <h3 className="text-lg font-bold text-white mb-2">Playlist not found</h3>
        <p className="text-xs text-[#777] mb-4">This playlist may have been deleted or moved.</p>
        <button onClick={onBack} className="text-xs text-[#1ed760] hover:underline font-bold">
          ← Go Back
        </button>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (isCurrentPlayingInPlaylist) {
      togglePlay();
    } else if (tracks.length > 0) {
      if (isShuffle) {
        const randIdx = Math.floor(Math.random() * tracks.length);
        const chosen = tracks[randIdx];
        const others = tracks.filter((t) => t.id !== chosen.id);
        const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
        playTrack(chosen, [chosen, ...shuffledOthers]);
      } else {
        playTrack(tracks[0], tracks);
      }
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    toggleShuffle();

    if (nextShuffle) {
      if (isCurrentPlayingInPlaylist && currentTrack) {
        const others = tracks.filter((t) => t.id !== currentTrack.id);
        const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
        setQueue([currentTrack, ...shuffledOthers]);
        setQueueIndex(0);
      } else if (!isPlaying && tracks.length > 0) {
        const randIdx = Math.floor(Math.random() * tracks.length);
        const chosen = tracks[randIdx];
        const others = tracks.filter((t) => t.id !== chosen.id);
        const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
        playTrack(chosen, [chosen, ...shuffledOthers]);
      }
    } else {
      if (isCurrentPlayingInPlaylist && currentTrack) {
        const currIdx = tracks.findIndex((t) => t.id === currentTrack.id);
        setQueue(tracks);
        setQueueIndex(currIdx !== -1 ? currIdx : 0);
      }
    }
  };

  const handleRemoveTrack = async (e, trackId) => {
    e.stopPropagation();
    try {
      await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
      setPlaylist((prev) => (prev ? {
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      } : prev));
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!window.confirm(`Are you sure you want to delete "${playlist.name}"?`)) return;
    try {
      await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      onPlaylistDeleted(playlistId);
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);

  return (
    <div className="pb-12 select-none">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#b3b3b3] hover:text-white mb-6 transition font-medium"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-8">
        <PlaylistCover 
          covers={playlist.covers || []} 
          size="w-48 h-48 md:w-56 md:h-56" 
          iconSize={64} 
          className="shadow-2xl rounded-lg" 
        />
        <div className="flex-1">
          <span className="text-xs uppercase font-bold tracking-wider text-[#b3b3b3]">Playlist</span>
          <h1 className="text-3xl md:text-5xl font-black text-white mt-1 mb-2 tracking-tight">
            {playlist.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#b3b3b3] font-medium">
            <span className="text-white font-semibold">{tracks.length} songs</span>
            {totalMins > 0 && ` • ${totalMins} min`}
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="w-14 h-14 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition disabled:opacity-40"
            title="Play Playlist"
          >
            {isCurrentPlayingInPlaylist && isPlaying ? (
              <Pause size={24} className="fill-black" />
            ) : (
              <Play size={24} className="fill-black ml-1" />
            )}
          </button>

          <button
            onClick={handleToggleShuffle}
            disabled={tracks.length === 0}
            className={`relative p-3 rounded-full hover:scale-105 active:scale-95 transition flex items-center justify-center disabled:opacity-40 ${
              isShuffle ? 'text-[#1ed760] hover:text-[#1fdf64]' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title={isShuffle ? 'Disable Shuffle' : 'Shuffle playlist queue'}
          >
            <Shuffle size={24} />
            {isShuffle && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#1ed760]" />
            )}
          </button>
        </div>

        <button
          onClick={handleDeletePlaylist}
          className="flex items-center gap-2 text-xs font-semibold text-[#888] hover:text-red-400 p-2 rounded-lg transition"
          title="Delete playlist"
        >
          <Trash2 size={16} />
          Delete Playlist
        </button>
      </div>

      {/* Tracklist */}
      {tracks.length === 0 ? (
        <div className="text-center py-20 text-[#666]">
          <p className="text-sm">This playlist is currently empty.</p>
          <p className="text-xs text-[#555] mt-1">Add songs from albums or search to build this playlist.</p>
        </div>
      ) : (
        <div className="bg-[#181818]/70 rounded-lg p-2 border border-white/5">
          <div className="grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-2 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/5">
            <span>#</span>
            <span>Title</span>
            <span className="hidden md:block">Album</span>
            <span />
            <span className="text-right flex items-center justify-end">
              <Clock size={14} />
            </span>
          </div>

          <div className="divide-y divide-transparent">
            {tracks.map((track, idx) => {
              const isThisTrack = currentTrack?.id === track.id;
              const isThisPlaying = isThisTrack && isPlaying;
              const isSelected = selectedTrackId === track.id;
              const isDragOver = dragOverTrackIdx === idx;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => setSelectedTrackId(track.id)}
                  onDoubleClick={() => handleTrackPlay(track)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(e, 'track', track);
                    }
                  }}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/track-index', String(idx));
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      id: track.id,
                      title: track.title,
                      artist_name: track.artist_name,
                      album_id: track.album_id,
                      album_title: track.album_title,
                      cover_url: track.cover_url
                    }));
                    e.dataTransfer.setData('text/plain', String(track.id));
                    e.dataTransfer.effectAllowed = 'copyMove';
                    setDraggedTrackIdx(idx);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTrackIdx !== idx) setDragOverTrackIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverTrackIdx === idx) setDragOverTrackIdx(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOverTrackIdx(null);
                    const rawFrom = e.dataTransfer.getData('text/track-index');
                    const fromIdx = draggedTrackIdx !== null ? draggedTrackIdx : (rawFrom ? parseInt(rawFrom, 10) : null);
                    setDraggedTrackIdx(null);
                    if (fromIdx === null || isNaN(fromIdx) || fromIdx === idx) return;

                    const newTracks = [...tracks];
                    const [moved] = newTracks.splice(fromIdx, 1);
                    newTracks.splice(idx, 0, moved);

                    setPlaylist((prev) => (prev ? { ...prev, tracks: newTracks } : prev));

                    try {
                      await fetch(`/api/playlists/${playlistId}/reorder`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ track_ids: newTracks.map((t) => t.id) }),
                      });
                    } catch (err) {
                      console.error('Failed to save playlist reorder:', err);
                    }
                  }}
                  className={`grid grid-cols-[40px_1fr_1fr_40px_70px] px-4 py-3 rounded-md group transition items-center cursor-pointer select-none active:cursor-grabbing ${
                    isDragOver ? 'border-t-2 border-[#1ed760] bg-[#1ed760]/10' : ''
                  } ${
                    isThisTrack
                      ? 'bg-[#242424] text-[#1ed760]'
                      : isSelected
                      ? 'bg-[#2a2a2a] ring-1 ring-white/20 text-white'
                      : 'hover:bg-[#1f1f1f] text-white'
                  }`}
                >
                  <span className="text-sm font-medium text-[#b3b3b3] group-hover:hidden">
                    {isThisPlaying ? <span className="text-[#1ed760]">▶</span> : idx + 1}
                  </span>
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisTrack) {
                        togglePlay();
                      } else {
                        handleTrackPlay(track);
                      }
                    }}
                    className="hidden group-hover:block text-[#1ed760] cursor-pointer"
                    title="Play"
                  >
                    {isThisPlaying ? (
                      <Pause size={16} className="fill-current" />
                    ) : (
                      <Play size={16} className="fill-current" />
                    )}
                  </span>

                  <div className="flex items-center gap-3 truncate pr-4">
                    <img
                      src={track.cover_url || '/api/covers/0'}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-[#1f1f1f] shrink-0"
                    />
                    <div className="truncate">
                      <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-[#1ed760]' : 'text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectArtist) onSelectArtist(track.artist_id);
                          }}
                          className="hover:underline hover:text-white cursor-pointer"
                        >
                          {track.artist_name}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectAlbum) onSelectAlbum(track.album_id);
                    }}
                    className="hidden md:block text-xs text-[#b3b3b3] hover:text-white hover:underline truncate cursor-pointer pr-4"
                  >
                    {track.album_title}
                  </span>

                  <button
                    onClick={(e) => handleRemoveTrack(e, track.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-red-400 transition"
                    title="Remove from playlist"
                  >
                    <Trash2 size={16} />
                  </button>

                  <span className="text-right text-xs font-mono text-[#b3b3b3]">
                    {formatDuration(track.duration_seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
