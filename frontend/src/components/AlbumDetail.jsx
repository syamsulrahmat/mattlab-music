import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Clock, Heart, Plus, Check, Shuffle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { shuffleArray, shuffledQueueStartingWith } from '../utils/shuffle';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const AlbumDetail = ({ 
  albumId, 
  onBack, 
  onAddToPlaylist, 
  onSelectArtist, 
  onContextMenu,
  onPlaylistCreated
}) => {
  const [album, setAlbum] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [lastSelectedTrackIdx, setLastSelectedTrackIdx] = useState(null);
  const [addedToLibrary, setAddedToLibrary] = useState(false);
  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);

  const { 
    currentTrack, 
    isPlaying, 
    isBuffering,
    playTrack, 
    togglePlay, 
    isShuffle, 
    toggleShuffle, 
    setQueue, 
    setQueueIndex, 
    isFavorite, 
    toggleFavorite 
  } = usePlayer();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setSelectedTrackIds(new Set());
    setLastSelectedTrackIdx(null);

    fetch(`/api/albums/${albumId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setAlbum(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load album:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [albumId]);

  const tracks = Array.isArray(album?.tracks) ? album.tracks : [];

  const isCurrentAlbumPlaying =
    currentTrack && tracks.some((t) => t.id === currentTrack.id);

  const handleTrackPlay = (track) => {
    if (isShuffle && tracks.length > 1) {
      playTrack(track, shuffledQueueStartingWith(track, tracks));
    } else {
      playTrack(track, tracks);
    }
  };

  const handlePlayAll = () => {
    if (isCurrentAlbumPlaying) {
      togglePlay();
    } else if (tracks.length > 0) {
      if (isShuffle) {
        const shuffled = shuffleArray(tracks);
        playTrack(shuffled[0], shuffled);
      } else {
        playTrack(tracks[0], tracks);
      }
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    toggleShuffle();

    if (nextShuffle) {
      if (isCurrentAlbumPlaying && currentTrack) {
        setQueue(shuffledQueueStartingWith(currentTrack, tracks));
        setQueueIndex(0);
      } else if (!isPlaying && tracks.length > 0) {
        const shuffled = shuffleArray(tracks);
        playTrack(shuffled[0], shuffled);
      }
    } else {
      if (isCurrentAlbumPlaying && currentTrack) {
        const currIdx = tracks.findIndex((t) => t.id === currentTrack.id);
        setQueue(tracks);
        setQueueIndex(currIdx !== -1 ? currIdx : 0);
      }
    }
  };

  const handleAddToLibrary = async () => {
    if (!album || isAddingToLibrary) return;
    setIsAddingToLibrary(true);
    try {
      const res = await fetch(`/api/playlists/from-album/${album.id}`, { method: 'POST' });
      if (res.ok) {
        setAddedToLibrary(true);
        if (onPlaylistCreated) onPlaylistCreated();
        setTimeout(() => setAddedToLibrary(false), 3500);
      }
    } catch (err) {
      console.error('Failed to add album to library:', err);
    } finally {
      setIsAddingToLibrary(false);
    }
  };

  const handleRowClick = (e, track, idx) => {
    if (e.shiftKey && lastSelectedTrackIdx !== null) {
      const start = Math.min(lastSelectedTrackIdx, idx);
      const end = Math.max(lastSelectedTrackIdx, idx);
      const nextSet = new Set(selectedTrackIds);
      for (let i = start; i <= end; i++) {
        if (tracks[i]) nextSet.add(tracks[i].id);
      }
      setSelectedTrackIds(nextSet);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      setLastSelectedTrackIdx(idx);
    } else {
      setSelectedTrackIds(new Set([track.id]));
      setLastSelectedTrackIdx(idx);
    }
  };

  // Keyboard navigation & selection
  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const selectedTrackIdsRef = useRef(selectedTrackIds);
  useEffect(() => { selectedTrackIdsRef.current = selectedTrackIds; }, [selectedTrackIds]);

  const lastSelectedTrackIdxRef = useRef(lastSelectedTrackIdx);
  useEffect(() => { lastSelectedTrackIdxRef.current = lastSelectedTrackIdx; }, [lastSelectedTrackIdx]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const currentSelectedIds = selectedTrackIdsRef.current;
      const currentTracks = tracksRef.current;
      const currentLastIdx = lastSelectedTrackIdxRef.current;

      // 1. Enter to play selected track
      if (e.key === 'Enter' && currentSelectedIds.size === 1 && currentTracks.length > 0) {
        const [singleId] = Array.from(currentSelectedIds);
        const found = currentTracks.find((t) => t.id === singleId);
        if (found) {
          e.preventDefault();
          handleTrackPlay(found);
        }
        return;
      }

      // 2. Escape to deselect
      if (e.key === 'Escape' && currentSelectedIds.size > 0) {
        setSelectedTrackIds(new Set());
        selectedTrackIdsRef.current = new Set();
        return;
      }

      // 3. Plain ArrowUp / ArrowDown to switch selected song & scroll into view
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        if (currentTracks.length === 0) return;
        e.preventDefault();

        if (e.code === 'ArrowDown') {
          let nextIdx = 0;
          if (currentLastIdx !== null && currentLastIdx >= 0 && currentLastIdx < currentTracks.length) {
            nextIdx = Math.min(currentTracks.length - 1, currentLastIdx + 1);
          } else if (currentSelectedIds.size > 0) {
            const maxIdx = currentTracks.reduce(
              (acc, t, idx) => (currentSelectedIds.has(t.id) ? Math.max(acc, idx) : acc),
              -1
            );
            nextIdx = maxIdx !== -1 ? Math.min(currentTracks.length - 1, maxIdx + 1) : 0;
          }

          const nextTrack = currentTracks[nextIdx];
          if (nextTrack) {
            let nextSet;
            if (e.shiftKey) {
              nextSet = new Set([...currentSelectedIds, nextTrack.id]);
            } else {
              nextSet = new Set([nextTrack.id]);
            }
            setSelectedTrackIds(nextSet);
            selectedTrackIdsRef.current = nextSet;
            setLastSelectedTrackIdx(nextIdx);
            lastSelectedTrackIdxRef.current = nextIdx;

            const el = document.querySelector(`[data-track-id="${nextTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        } else if (e.code === 'ArrowUp') {
          let prevIdx = currentTracks.length - 1;
          if (currentLastIdx !== null && currentLastIdx >= 0 && currentLastIdx < currentTracks.length) {
            prevIdx = Math.max(0, currentLastIdx - 1);
          } else if (currentSelectedIds.size > 0) {
            const minIdx = currentTracks.reduce(
              (acc, t, idx) => (currentSelectedIds.has(t.id) ? Math.max(acc, idx) : acc),
              -1
            );
            prevIdx = minIdx !== -1 ? Math.max(0, minIdx - 1) : 0;
          }

          const prevTrack = currentTracks[prevIdx];
          if (prevTrack) {
            let nextSet;
            if (e.shiftKey) {
              nextSet = new Set([...currentSelectedIds, prevTrack.id]);
            } else {
              nextSet = new Set([prevTrack.id]);
            }
            setSelectedTrackIds(nextSet);
            selectedTrackIdsRef.current = nextSet;
            setLastSelectedTrackIdx(prevIdx);
            lastSelectedTrackIdxRef.current = prevIdx;

            const el = document.querySelector(`[data-track-id="${prevTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks, isShuffle, playTrack]);

  if (isLoading || !album) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1ed760]" />
      </div>
    );
  }

  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);

  return (
    <div className="pb-16 select-none relative w-full">
      {/* Full-bleed Header Banner taking all the area without back button */}
      <div className="bg-gradient-to-b from-purple-950/45 via-[#181818]/75 to-[#121212] px-6 sm:px-8 pt-8 sm:pt-10 pb-8 sm:pb-10 w-full border-b border-white/5">
        <div className="flex flex-col md:flex-row gap-6 md:gap-7 items-start md:items-end">
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-xl shadow-2xl object-cover bg-[#1f1f1f] shrink-0 border border-white/10"
          />
          <div className="flex flex-col justify-end min-w-0">
            <span className="text-xs uppercase font-bold tracking-widest text-[#b3b3b3]">
              Album
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mt-1 mb-3 tracking-tight truncate">
              {album.title}
            </h1>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#b3b3b3] font-medium flex-wrap">
              <span
                onClick={() => onSelectArtist && onSelectArtist(album.artist_id)}
                className="text-white font-semibold hover:underline cursor-pointer"
              >
                {album.artist_name}
              </span>
              {album.year && <span>• {album.year}</span>}
              <span>• {tracks.length} songs</span>
              <span>• {totalMins} min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="sticky top-0 z-20 bg-[#121212]/95 backdrop-blur-md px-6 sm:px-8 py-3.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayAll}
            className="w-14 h-14 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-2xl transition"
            title={isCurrentAlbumPlaying && isPlaying ? "Pause" : "Play Album"}
          >
            {isCurrentAlbumPlaying && isPlaying ? (
              <Pause size={24} className="fill-black" />
            ) : (
              <Play size={24} className="fill-black ml-1" />
            )}
          </button>

          <button
            onClick={handleToggleShuffle}
            className={`p-3 rounded-full hover:bg-white/10 transition ${
              isShuffle ? 'text-[#1ed760]' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title={isShuffle ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle size={20} />
          </button>

          <button
            onClick={handleAddToLibrary}
            disabled={isAddingToLibrary}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#242424] hover:bg-[#2f2f2f] text-white text-xs font-bold transition border border-white/10 active:scale-95"
            title="Add album to library as playlist"
          >
            {addedToLibrary ? (
              <>
                <Check size={16} className="text-[#1ed760]" />
                <span className="text-[#1ed760]">Added to Library</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Add to Library</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tracklist Table */}
      <div className="px-6 sm:px-8 mt-4">
        <div className="grid grid-cols-[36px_1fr_36px_36px_60px] md:grid-cols-[40px_1fr_40px_40px_70px] px-3 sm:px-4 py-2 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/5 tracking-wider">
          <span className="text-center">#</span>
          <span>Title</span>
          <span />
          <span />
          <span className="text-right flex items-center justify-end">
            <Clock size={14} />
          </span>
        </div>

        <div className="divide-y divide-transparent mt-1">
          {tracks.map((track, idx) => {
            const isThisTrack = currentTrack?.id === track.id;
            const isThisPlaying = isThisTrack && isPlaying;
            const isThisBuffering = isThisTrack && isBuffering;
            const isSelected = selectedTrackIds.has(track.id);
            const isFav = isFavorite(track.id);

            return (
              <div
                key={track.id}
                data-track-id={track.id}
                onClick={(e) => handleRowClick(e, track, idx)}
                onDoubleClick={() => handleTrackPlay(track)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'track', {
                      ...track,
                      album_id: album.id,
                      album_title: album.title,
                      cover_url: album.cover_url,
                    });
                  }
                }}
                draggable="true"
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    id: track.id,
                    title: track.title,
                    artist_name: track.artist_name || album.artist_name,
                    album_id: album.id,
                    album_title: album.title,
                    cover_url: album.cover_url,
                  }));
                  e.dataTransfer.setData('text/plain', String(track.id));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`grid grid-cols-[36px_1fr_36px_36px_60px] md:grid-cols-[40px_1fr_40px_40px_70px] px-3 sm:px-4 py-2.5 rounded-lg group transition items-center cursor-default select-none ${
                  isSelected
                    ? 'bg-[#2a2a2a] ring-1 ring-white/20 text-white'
                    : 'hover:bg-[#1f1f1f] text-white'
                }`}
              >
                {/* Column 1: Index / Play-Pause / Animated Equalizer / Loading Wave */}
                <div className="flex items-center justify-center w-8 h-8">
                  {/* Unfocused state (group-hover:hidden) */}
                  <div className="flex items-center justify-center group-hover:hidden">
                    {isThisBuffering ? (
                      /* Mini Circular Green Spinner */
                      <div className="w-3.5 h-3.5 border-2 border-[#1ed760] border-t-transparent rounded-full animate-spin" title="Loading audio..." />
                    ) : isThisPlaying ? (
                      /* Animated Spotify Equalizer Bars */
                      <div className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 pb-0.5" title="Playing">
                        <span className="w-[3px] bg-[#1ed760] rounded-full animate-eq-1" />
                        <span className="w-[3px] bg-[#1ed760] rounded-full animate-eq-2" />
                        <span className="w-[3px] bg-[#1ed760] rounded-full animate-eq-3" />
                        <span className="w-[3px] bg-[#1ed760] rounded-full animate-eq-4" />
                      </div>
                    ) : (
                      /* Normal track number (green if current track paused, gray otherwise) */
                      <span className={`text-sm font-medium ${isThisTrack ? 'text-[#1ed760]' : 'text-[#b3b3b3]'}`}>
                        {idx + 1}
                      </span>
                    )}
                  </div>

                  {/* Hover state (hidden group-hover:flex) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisTrack) {
                        togglePlay();
                      } else {
                        handleTrackPlay(track);
                      }
                    }}
                    className="hidden group-hover:flex items-center justify-center w-7 h-7 text-white hover:text-[#1ed760] transition"
                    title={isThisPlaying || isThisBuffering ? "Pause" : "Play"}
                  >
                    {isThisPlaying || isThisBuffering ? (
                      <Pause size={15} className="fill-current" />
                    ) : (
                      <Play size={15} className="fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Column 2: Title & Artist info */}
                <div className="truncate pr-4">
                  <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-[#1ed760]' : 'text-white'}`}>
                    {track.title}
                  </p>
                  <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectArtist) onSelectArtist(track.artist_id || album.artist_id);
                      }}
                      className="hover:underline hover:text-white cursor-pointer"
                    >
                      {track.artist_name || album.artist_name}
                    </span>
                    {track.file_format && (
                      <span className="text-[#666]"> • <span className="uppercase text-[10px]">{track.file_format}</span></span>
                    )}
                  </p>
                </div>

                {/* Column 3: Add to playlist */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAddToPlaylist) onAddToPlaylist(track);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-white transition"
                    title="Add to playlist"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Column 4: Favorite button */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(track.id);
                    }}
                    className={`p-1 transition ${
                      isFav ? 'text-[#1ed760]' : 'opacity-0 group-hover:opacity-100 text-[#888] hover:text-white'
                    }`}
                    title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  >
                    <Heart size={16} className={isFav ? 'fill-[#1ed760]' : ''} />
                  </button>
                </div>

                {/* Column 5: Duration */}
                <span className="text-right text-xs font-mono text-[#b3b3b3]">
                  {formatDuration(track.duration_seconds)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
