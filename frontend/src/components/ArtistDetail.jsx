import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Clock, CheckCircle2, Heart, Plus, Disc3, Shuffle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { shuffleArray, shuffledQueueStartingWith } from '../utils/shuffle';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const ArtistDetail = ({ 
  artistId, 
  onBack, 
  onSelectAlbum, 
  onAddToPlaylist,
  onContextMenu 
}) => {
  const [artist, setArtist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [lastSelectedTrackIdx, setLastSelectedTrackIdx] = useState(null);

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

    fetch(`/api/artists/${artistId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setArtist(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load artist:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [artistId]);

  const tracks = Array.isArray(artist?.tracks) ? artist.tracks : [];

  const isCurrentArtistPlaying =
    currentTrack && tracks.some((t) => t.id === currentTrack.id);

  const handleTrackPlay = (track) => {
    if (isShuffle && tracks.length > 1) {
      playTrack(track, shuffledQueueStartingWith(track, tracks));
    } else {
      playTrack(track, tracks);
    }
  };

  const handlePlayAll = () => {
    if (isCurrentArtistPlaying) {
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
      if (isCurrentArtistPlaying && currentTrack) {
        setQueue(shuffledQueueStartingWith(currentTrack, tracks));
        setQueueIndex(0);
      } else if (!isPlaying && tracks.length > 0) {
        const shuffled = shuffleArray(tracks);
        playTrack(shuffled[0], shuffled);
      }
    } else {
      if (isCurrentArtistPlaying && currentTrack) {
        const currIdx = tracks.findIndex((t) => t.id === currentTrack.id);
        setQueue(tracks);
        setQueueIndex(currIdx !== -1 ? currIdx : 0);
      }
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

  if (isLoading || !artist) {
    return (
      <div className="flex items-center justify-center h-64 text-content-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="pb-16 select-none relative w-full">
      {/* Full-bleed Header Banner taking all the area without back button */}
      <div className="bg-gradient-to-b from-emerald-950/45 via-surface-panel/75 to-surface-island px-6 sm:px-8 pt-8 sm:pt-10 pb-8 sm:pb-10 w-full border-b border-border-subtle">
        <div className="flex flex-col md:flex-row gap-6 md:gap-7 items-start md:items-end">
          <div className="relative group shrink-0">
            <img
              src={artist.image_url || `/api/artists/${artist.id}/image`}
              alt={artist.name}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/api/covers/0';
              }}
              className="w-44 h-44 sm:w-52 sm:h-52 rounded-full shadow-2xl object-cover bg-surface-elevated2 border-2 border-border-medium group-hover:scale-105 transition duration-300"
            />
          </div>

          <div className="flex flex-col justify-end min-w-0">
            <div className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider text-brand-500 mb-1">
              <CheckCircle2 size={16} className="fill-brand-500 text-black" />
              <span>Verified Artist</span>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-content-primary mt-1 mb-3 tracking-tight truncate">
              {artist.name}
            </h1>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-content-secondary font-medium flex-wrap">
              <span className="text-content-primary font-semibold">{tracks.length} songs</span>
              <span>•</span>
              <span>{artist.albums?.length || 0} albums</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-6 sm:px-8 py-3.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-2xl transition disabled:opacity-40"
            title={isCurrentArtistPlaying && isPlaying ? "Pause" : `Play all songs by ${artist.name}`}
          >
            {isCurrentArtistPlaying && isPlaying ? (
              <Pause size={24} className="fill-black" />
            ) : (
              <Play size={24} className="fill-black ml-1" />
            )}
          </button>

          <button
            onClick={handleToggleShuffle}
            disabled={tracks.length === 0}
            className={`p-3 rounded-full hover:bg-white/10 transition disabled:opacity-40 ${
              isShuffle ? 'text-brand-500' : 'text-content-secondary hover:text-white'
            }`}
            title={isShuffle ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle size={20} />
          </button>
        </div>
      </div>

      {/* Popular Tracks Section */}
      <div className="px-6 sm:px-8 mt-6 mb-12">
        <h2 className="text-xl font-bold text-content-primary mb-4 tracking-tight">Popular Songs</h2>
        <div>
          <div className="sticky top-0 z-20 bg-surface-island/95 backdrop-blur-md rounded-lg grid grid-cols-[36px_1fr_36px_50px] md:grid-cols-[40px_3fr_2fr_36px_60px] px-3 sm:px-4 py-2.5 text-xs font-semibold uppercase text-content-secondary border-b border-border-medium items-center tracking-wider shadow-md">
            <span className="text-center">#</span>
            <span>Title</span>
            <span className="hidden md:block">Album</span>
            <span />
            <span className="text-right flex items-center justify-end">
              <Clock size={14} />
            </span>
          </div>

          <div className="divide-y divide-transparent mt-1">
            {tracks.slice(0, 30).map((track, idx) => {
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
                      const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
                      const orderedTracks = isMulti
                        ? tracks.filter((t) => selectedTrackIds.has(t.id))
                        : [track];
                      onContextMenu(e, 'track', {
                        ...track,
                        selectedTracks: orderedTracks,
                        track_ids: orderedTracks.map((t) => t.id),
                        artist_name: track.artist_name || artist.name,
                      });
                    }
                  }}
                  draggable="true"
                  onDragStart={(e) => {
                    const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
                    const orderedTracks = isMulti
                      ? tracks.filter((t) => selectedTrackIds.has(t.id))
                      : [track];
                    const trackIds = orderedTracks.map((t) => t.id);

                    e.dataTransfer.setData('application/json', JSON.stringify({
                      id: track.id,
                      track_ids: trackIds,
                      tracks: orderedTracks,
                      title: track.title,
                      artist_name: track.artist_name || artist.name,
                      album_id: track.album_id,
                      album_title: track.album_title,
                      cover_url: track.cover_url
                    }));
                    e.dataTransfer.setData('text/plain', trackIds.join(','));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`grid grid-cols-[36px_1fr_36px_50px] md:grid-cols-[40px_3fr_2fr_36px_60px] px-3 sm:px-4 py-2.5 rounded-lg group transition items-center cursor-default select-none ${
                    isSelected
                      ? 'bg-surface-hover ring-1 ring-white/20 text-content-primary'
                      : 'hover:bg-surface-elevated text-content-primary'
                  }`}
                >
                  {/* Column 1: Index / Play-Pause / Animated Equalizer / Loading Spinner */}
                  <div className="flex items-center justify-center w-8 h-8">
                    {isThisBuffering ? (
                      /* Spinner stays visible even on hover until song actually plays */
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                        }}
                        className="flex items-center justify-center w-7 h-7 cursor-pointer"
                        title="Buffering audio... (click to cancel)"
                      >
                        <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Unfocused state (group-hover:hidden) */}
                        <div className="flex items-center justify-center group-hover:hidden">
                          {isThisPlaying ? (
                            /* Animated Equalizer Bars */
                            <div className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 pb-0.5" title="Playing">
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-1" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-2" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-3" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-4" />
                            </div>
                          ) : (
                            /* Normal track number (green if current track paused, gray otherwise) */
                            <span className={`text-sm font-medium ${isThisTrack ? 'text-brand-500' : 'text-content-secondary'}`}>
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
                          className="hidden group-hover:flex items-center justify-center w-7 h-7 text-white hover:text-brand-400 transition"
                          title={isThisPlaying ? "Pause" : "Play"}
                        >
                          {isThisPlaying ? (
                            <Pause size={15} className="fill-current" />
                          ) : (
                            <Play size={15} className="fill-current ml-0.5" />
                          )}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Column 2: Cover & Title */}
                  <div className="flex items-center gap-3 truncate pr-4">
                    <img
                      src={track.cover_url || '/api/covers/0'}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-surface-elevated shrink-0"
                    />
                    <div className="truncate">
                      <p className={`text-sm font-medium truncate ${isThisTrack ? 'text-brand-500 font-bold' : 'text-content-primary'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-content-secondary truncate md:hidden">
                        {track.album_title}
                      </p>
                    </div>
                  </div>

                  {/* Column 3: Album (hidden < md) */}
                  <div className="hidden md:block truncate pr-4">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectAlbum) onSelectAlbum(track.album_id);
                      }}
                      className="text-xs text-content-secondary hover:text-white hover:underline truncate cursor-pointer inline"
                    >
                      {track.album_title}
                    </span>
                  </div>

                  {/* Column 4: Heart & Add to playlist */}
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(track.id);
                      }}
                      className={`p-1.5 transition ${
                        isFav ? 'text-brand-500' : 'opacity-0 group-hover:opacity-100 text-content-muted hover:text-white'
                      }`}
                      title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                    >
                      <Heart size={15} className={isFav ? 'fill-brand-500' : ''} />
                    </button>
                    {onAddToPlaylist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToPlaylist(track);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-content-muted hover:text-white transition"
                        title="Add to playlist"
                      >
                        <Plus size={15} />
                      </button>
                    )}
                  </div>

                  {/* Column 5: Duration */}
                  <span className="text-right text-xs font-mono text-content-secondary">
                    {formatDuration(track.duration_seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Discography / Albums Shelf */}
      {artist.albums && artist.albums.length > 0 && (
        <section className="px-6 sm:px-8">
          <h2 className="text-xl font-bold text-content-primary mb-4 tracking-tight">Discography</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {artist.albums.map((album) => (
              <div
                key={album.id}
                onClick={() => onSelectAlbum(album.id)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'album', { ...album, artist_id: artist.id });
                  }
                }}
                className="group bg-surface-panel hover:bg-surface-elevated2 p-3 rounded-xl transition duration-200 cursor-pointer flex flex-col justify-between border border-border-subtle"
              >
                <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-surface-elevated shadow-md">
                  <img
                    src={album.cover_url}
                    alt={album.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-content-primary truncate group-hover:text-brand-400 transition">
                    {album.title}
                  </h3>
                  <p className="text-[11px] text-content-secondary truncate mt-0.5">
                    {album.year ? `Album • ${album.year}` : 'Album'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
