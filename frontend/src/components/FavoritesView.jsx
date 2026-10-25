import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Play, Pause, Heart, Clock, Search, X, Shuffle, 
  Calendar, Type, Mic2, Disc3, ChevronDown, ChevronUp, ListOrdered, Check, MoreVertical 
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { shuffleArray, shuffledQueueStartingWith } from '../utils/shuffle';
import { TracklistFilterBar } from './TracklistFilterBar';
import { SortDropdownMenu } from './SortDropdownMenu';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const parseUtcDate = (dateStr) => {
  if (!dateStr) return null;
  const str = String(dateStr);
  const cleaned = str.includes('Z') || str.includes('+') ? str : str.replace(' ', 'T') + 'Z';
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
};

const formatAddedAt = (dateStr) => {
  const d = parseUtcDate(dateStr);
  if (!d) return '—';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

export const FavoritesView = ({ 
  onSelectAlbum, 
  onSelectArtist, 
  onAddToPlaylist, 
  onContextMenu 
}) => {
  const [rawTracks, setRawTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection state
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [lastSelectedTrackIdx, setLastSelectedTrackIdx] = useState(null);

  // Filter & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterFocused, setIsFilterFocused] = useState(false);
  const [focusedTrackIdx, setFocusedTrackIdx] = useState(-1);
  const filterInputRef = useRef(null);
  const tracklistAnchorRef = useRef(null);

  const [sortBy, setSortBy] = useState('added_at'); // 'added_at', 'title', 'artist', 'album', 'duration'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc', 'asc' (desc by default for newest likes first)
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

  const { 
    currentTrack, 
    isPlaying, 
    isBuffering, 
    playTrack, 
    togglePlay, 
    toggleFavorite,
    removeFavoritesBulk,
    isShuffle,
    toggleShuffle,
    setQueue,
    setQueueIndex,
    showToast,
  } = usePlayer();

  const fetchFavorites = () => {
    setIsLoading(true);
    fetch('/api/favorites', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setRawTracks(data.items || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load favorites:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  // Close sort menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSortMenuOpen]);

  // Column header toggle handler
  const handleColumnHeaderSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder(columnKey === 'added_at' ? 'desc' : 'asc');
    }
  };

  // Sorted tracks (unfiltered)
  const allTracks = useMemo(() => {
    const sorted = [...rawTracks].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'artist') {
        cmp = (a.artist_name || '').localeCompare(b.artist_name || '');
      } else if (sortBy === 'album') {
        cmp = (a.album_title || '').localeCompare(b.album_title || '');
      } else if (sortBy === 'added_at') {
        const timeA = parseUtcDate(a.added_at || a.favorited_at)?.getTime() || 0;
        const timeB = parseUtcDate(b.added_at || b.favorited_at)?.getTime() || 0;
        cmp = timeA - timeB;
      } else if (sortBy === 'duration') {
        cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rawTracks, sortBy, sortOrder]);

  // Filtered tracks for display
  const tracks = useMemo(() => {
    if (!searchQuery.trim()) {
      return allTracks;
    }
    const q = searchQuery.toLowerCase().trim();
    return allTracks.filter((t) =>
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist_name && t.artist_name.toLowerCase().includes(q)) ||
      (t.album_title && t.album_title.toLowerCase().includes(q))
    );
  }, [allTracks, searchQuery]);

  const isCurrentPlayingInFav = currentTrack && rawTracks.some((t) => t.id === currentTrack.id);

  // Synchronization refs for lag-free keyboard navigation
  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const allTracksRef = useRef(allTracks);
  useEffect(() => { allTracksRef.current = allTracks; }, [allTracks]);

  const selectedTrackIdsRef = useRef(selectedTrackIds);
  useEffect(() => { selectedTrackIdsRef.current = selectedTrackIds; }, [selectedTrackIds]);

  const lastSelectedTrackIdxRef = useRef(lastSelectedTrackIdx);
  useEffect(() => { lastSelectedTrackIdxRef.current = lastSelectedTrackIdx; }, [lastSelectedTrackIdx]);

  // Auto-scroll focused search track into view
  useEffect(() => {
    if (focusedTrackIdx >= 0 && tracks[focusedTrackIdx]) {
      const el = document.querySelector(`[data-fav-track-id="${tracks[focusedTrackIdx].id}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedTrackIdx, tracks]);

  // Reset search focus when query changes
  useEffect(() => {
    setFocusedTrackIdx(-1);
  }, [searchQuery]);

  // Playback handlers
  const handleTrackPlay = (track) => {
    const favTracks = allTracks.map((t) => ({ ...t, playlist_id: 'favorites' }));
    if (favTracks.length === 0) return;

    const trackWithPl = { ...track, playlist_id: 'favorites' };
    if (isShuffle && favTracks.length > 1) {
      playTrack(trackWithPl, shuffledQueueStartingWith(trackWithPl, favTracks));
    } else {
      playTrack(trackWithPl, favTracks);
    }
  };

  const handlePlayAll = () => {
    if (isCurrentPlayingInFav) {
      togglePlay();
    } else {
      const favTracks = allTracks.map((t) => ({ ...t, playlist_id: 'favorites' }));
      if (favTracks.length === 0) return;

      const candidateTracks = tracks.map((t) => ({ ...t, playlist_id: 'favorites' }));
      const pool = candidateTracks.length > 0 ? candidateTracks : favTracks;

      if (isShuffle) {
        if (favTracks.length > 1) {
          const randomIndex = Math.floor(Math.random() * pool.length);
          const startTrack = pool[randomIndex];
          playTrack(startTrack, shuffledQueueStartingWith(startTrack, favTracks));
        } else {
          playTrack(pool[0], favTracks);
        }
      } else {
        playTrack(pool[0], favTracks);
      }
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    toggleShuffle();

    const favTracks = allTracks.map((t) => ({ ...t, playlist_id: 'favorites' }));
    if (nextShuffle) {
      if (isCurrentPlayingInFav && currentTrack) {
        setQueue(shuffledQueueStartingWith({ ...currentTrack, playlist_id: 'favorites' }, favTracks));
        setQueueIndex(0);
      } else if (!isPlaying && favTracks.length > 0) {
        const shuffled = shuffleArray(favTracks);
        playTrack(shuffled[0], shuffled);
      }
    } else {
      if (isCurrentPlayingInFav && currentTrack) {
        const currIdx = favTracks.findIndex((t) => t.id === currentTrack.id);
        setQueue(favTracks);
        setQueueIndex(currIdx !== -1 ? currIdx : 0);
      }
    }
  };

  const handlePlaySelected = () => {
    const selectedList = tracks
      .filter((t) => selectedTrackIds.has(t.id))
      .map((t) => ({ ...t, playlist_id: 'favorites' }));
    if (selectedList.length === 0) return;
    if (isShuffle) {
      const shuffled = shuffleArray(selectedList);
      playTrack(shuffled[0], shuffled);
    } else {
      playTrack(selectedList[0], selectedList);
    }
  };

  // Unliking & bulk remove
  const handleHeartClick = async (e, trackId) => {
    e.stopPropagation();
    await toggleFavorite(trackId);
    setRawTracks((prev) => prev.filter((t) => t.id !== trackId));
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
    if (showToast) showToast('💔 Removed from Liked Songs');
  };

  const handleBulkRemoveSelected = async () => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    if (removeFavoritesBulk) {
      await removeFavoritesBulk(ids);
    } else {
      await Promise.all(ids.map((id) => toggleFavorite(id)));
    }
    setRawTracks((prev) => prev.filter((t) => !selectedTrackIds.has(t.id)));
    setSelectedTrackIds(new Set());
    setLastSelectedTrackIdx(null);
    if (showToast) {
      showToast(`💔 Removed ${ids.length} song${ids.length > 1 ? 's' : ''} from Liked Songs`);
    }
  };

  // Keyboard navigation & selection
  const handleFilterKeyDown = (e) => {
    if (tracks.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedTrackIdx((prev) => {
        const nextIdx = prev < 0 ? 0 : Math.min(tracks.length - 1, prev + 1);
        const nextTrack = tracks[nextIdx];
        if (nextTrack) {
          const nextSet = new Set([nextTrack.id]);
          setSelectedTrackIds(nextSet);
          selectedTrackIdsRef.current = nextSet;
          setLastSelectedTrackIdx(nextIdx);
          lastSelectedTrackIdxRef.current = nextIdx;
        }
        return nextIdx;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedTrackIdx((prev) => {
        if (prev <= 0) {
          setSelectedTrackIds(new Set());
          selectedTrackIdsRef.current = new Set();
          setLastSelectedTrackIdx(null);
          lastSelectedTrackIdxRef.current = null;
          return -1;
        }
        const prevIdx = prev - 1;
        const prevTrack = tracks[prevIdx];
        if (prevTrack) {
          const nextSet = new Set([prevTrack.id]);
          setSelectedTrackIds(nextSet);
          selectedTrackIdsRef.current = nextSet;
          setLastSelectedTrackIdx(prevIdx);
          lastSelectedTrackIdxRef.current = prevIdx;
        }
        return prevIdx;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIdx = focusedTrackIdx >= 0 ? focusedTrackIdx : 0;
      const targetTrack = tracks[targetIdx];
      if (targetTrack) {
        handleTrackPlay(targetTrack);
        if (filterInputRef.current) {
          filterInputRef.current.blur();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (focusedTrackIdx >= 0) {
        setFocusedTrackIdx(-1);
        setSelectedTrackIds(new Set());
        selectedTrackIdsRef.current = new Set();
        setLastSelectedTrackIdx(null);
        lastSelectedTrackIdxRef.current = null;
      }
      if (searchQuery) {
        setSearchQuery('');
      } else if (filterInputRef.current) {
        filterInputRef.current.blur();
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const currentSelectedIds = selectedTrackIdsRef.current;
      const currentTracks = tracksRef.current;
      const currentLastIdx = lastSelectedTrackIdxRef.current;

      // 1. Enter to play selected track(s)
      if (e.key === 'Enter' && currentSelectedIds.size >= 1 && currentTracks.length > 0) {
        e.preventDefault();
        if (currentSelectedIds.size === 1) {
          const [singleId] = Array.from(currentSelectedIds);
          const found = currentTracks.find((t) => t.id === singleId);
          if (found) {
            handleTrackPlay(found);
          }
        } else {
          handlePlaySelected();
        }
        return;
      }

      // 2. Escape to clear selection
      if (e.key === 'Escape' && currentSelectedIds.size > 0) {
        setSelectedTrackIds(new Set());
        selectedTrackIdsRef.current = new Set();
        setLastSelectedTrackIdx(null);
        lastSelectedTrackIdxRef.current = null;
        return;
      }

      // 3. ArrowUp / ArrowDown navigation
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
            const nextSet = e.shiftKey
              ? new Set([...currentSelectedIds, nextTrack.id])
              : new Set([nextTrack.id]);
            setSelectedTrackIds(nextSet);
            selectedTrackIdsRef.current = nextSet;
            setLastSelectedTrackIdx(nextIdx);
            lastSelectedTrackIdxRef.current = nextIdx;

            const el = document.querySelector(`[data-fav-track-id="${nextTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        } else if (e.code === 'ArrowUp') {
          let prevIdx = currentTracks.length - 1;
          if (currentLastIdx !== null && currentLastIdx >= 0 && currentLastIdx < currentTracks.length) {
            prevIdx = Math.max(0, currentLastIdx - 1);
          } else if (currentSelectedIds.size > 0) {
            const minIdx = currentTracks.reduce(
              (acc, t, idx) => (currentSelectedIds.has(t.id) ? (acc === -1 ? idx : Math.min(acc, idx)) : acc),
              -1
            );
            prevIdx = minIdx !== -1 ? Math.max(0, minIdx - 1) : 0;
          }

          const prevTrack = currentTracks[prevIdx];
          if (prevTrack) {
            const nextSet = e.shiftKey
              ? new Set([...currentSelectedIds, prevTrack.id])
              : new Set([prevTrack.id]);
            setSelectedTrackIds(nextSet);
            selectedTrackIdsRef.current = nextSet;
            setLastSelectedTrackIdx(prevIdx);
            lastSelectedTrackIdxRef.current = prevIdx;

            const el = document.querySelector(`[data-fav-track-id="${prevTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks, isShuffle, playTrack]);

  // Row click multi-selection handling (single-click play on mobile, double-click on desktop)
  const handleRowClick = (e, track, idx) => {
    // On mobile devices, single tap triggers playback directly, or toggles pause if already playing
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (currentTrack?.id === track.id) {
        togglePlay();
      } else {
        handleTrackPlay(track);
      }
      return;
    }

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-content-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500" />
      </div>
    );
  }

  const totalSeconds = rawTracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalMins = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalSeconds / 3600);
  const remainingMins = Math.floor((totalSeconds % 3600) / 60);

  return (
    <div 
      data-dev-component="FavoritesView"
      data-dev-file="src/components/FavoritesView.jsx"
      data-dev-desc="Liked Songs playlist view with in-view search filter, column sorting, shuffle, and bulk unlike"
      className="pb-12 select-none relative w-full"
    >
      {/* Mobile Sticky Floating Filter Bar */}
      <TracklistFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFocus={() => setIsFilterFocused(true)}
        onBlur={() => {
          if (!searchQuery.trim()) {
            setIsFilterFocused(false);
          }
        }}
        onClear={() => {
          setIsFilterFocused(false);
          setFocusedTrackIdx(-1);
        }}
        isFilterActive={isFilterFocused || Boolean(searchQuery.trim())}
        placeholder="Filter liked songs..."
        mode="mobile"
      />
      {/* Hero Header (Hidden on mobile when filtering) */}
      <div className={`${isFilterFocused || searchQuery.trim() ? 'hidden md:flex' : 'flex'} flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end mb-6 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-6 sm:p-8 bg-gradient-to-b from-indigo-900/80 via-indigo-950/40 to-surface-island rounded-t-lg`}>
        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-lg shadow-2xl bg-gradient-to-br from-indigo-600 via-indigo-800 to-purple-900 flex items-center justify-center shrink-0">
          <Heart size={72} className="fill-white text-white drop-shadow-md" />
        </div>
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-white/80">Playlist</span>
          <h1 className="text-3xl sm:text-5xl font-black text-white mt-1 mb-2 tracking-tight">
            Liked Songs
          </h1>
          <p className="text-xs sm:text-sm text-content-secondary font-medium">
            <span className="text-white font-semibold">{rawTracks.length} songs</span>
            {searchQuery && tracks.length !== rawTracks.length && (
              <span className="text-brand-400 font-semibold"> ({tracks.length} matching)</span>
            )}
            {' '}• {totalHours > 0 ? `${totalHours} hr ${remainingMins} min` : `${totalMins} minutes`}
          </p>
        </div>
      </div>

      {/* Action Bar (Play, Shuffle, Search Filter, Sort Dropdown - Hidden on mobile when filtering) */}
      {rawTracks.length > 0 && (
        <div className={`${isFilterFocused || searchQuery.trim() ? 'hidden md:flex' : 'flex'} items-center justify-between gap-4 mb-6 overflow-visible`}>
          {/* Left: Play/Pause button + Shuffle toggle + Options */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayAll}
              className="w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] rounded-full aspect-square bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition cursor-pointer shrink-0"
              title="Play Liked Songs"
            >
              {isCurrentPlayingInFav && isPlaying ? (
                <Pause size={24} className="fill-black" />
              ) : (
                <Play size={24} className="fill-black ml-1" />
              )}
            </button>

            <button
              onClick={handleToggleShuffle}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer shrink-0 ${
                isShuffle 
                  ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30' 
                  : 'bg-white/5 hover:bg-white/10 text-content-secondary hover:text-white'
              }`}
              title={isShuffle ? 'Shuffle is ON (Click to turn OFF)' : 'Shuffle is OFF (Click to turn ON)'}
            >
              <Shuffle size={18} className={isShuffle ? 'text-brand-500' : ''} />
            </button>

            {/* Liked Songs 3-Dots Button */}
            <button
              onClick={(e) => {
                if (onContextMenu) {
                  onContextMenu(e, 'favorites', { id: 'favorites', name: 'Liked Songs' });
                }
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-content-secondary hover:text-white hover:bg-white/10 active:scale-90 transition shrink-0"
              title="Liked Songs options"
            >
              <MoreVertical size={20} />
            </button>
          </div>

          {/* Right: In-view search + Sort dropdown */}
          <div className="flex items-center gap-2 shrink-0 md:flex-1 md:max-w-md justify-end">
            {/* Search Filter */}
            <TracklistFilterBar
              searchQuery={searchQuery}
              setSearchQuery={(val) => {
                setSearchQuery(val);
                if (!val) setFocusedTrackIdx(-1);
              }}
              placeholder="Filter liked songs..."
              onKeyDown={handleFilterKeyDown}
              inputRef={filterInputRef}
              mode="desktop"
              className="hidden md:block"
            />

            {/* Sort Menu Dropdown */}
            <div className="relative shrink-0 flex items-center gap-1 bg-surface-elevated2 hover:bg-surface-hover border border-border-subtle rounded-full px-2.5 py-1.5 transition" ref={sortMenuRef}>
              <button
                onClick={() => setIsSortMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary transition outline-none cursor-pointer"
                title={`Sorted by: ${
                  sortBy === 'added_at'
                    ? 'Date Added'
                    : sortBy === 'title'
                    ? 'Title'
                    : sortBy === 'artist'
                    ? 'Artist'
                    : sortBy === 'album'
                    ? 'Album'
                    : 'Duration'
                }`}
              >
                {sortBy === 'added_at' ? (
                  <Calendar size={14} className="text-brand-400" />
                ) : sortBy === 'title' ? (
                  <Type size={14} className="text-brand-400" />
                ) : sortBy === 'artist' ? (
                  <Mic2 size={14} className="text-brand-400" />
                ) : sortBy === 'album' ? (
                  <Disc3 size={14} className="text-brand-400" />
                ) : (
                  <Clock size={14} className="text-brand-400" />
                )}
                <ChevronDown size={11} className="text-content-muted" />
              </button>

              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="text-[11px] font-bold text-brand-500 hover:text-brand-400 pl-0.5 pr-1 transition cursor-pointer"
                title={`Sort direction: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>

              <SortDropdownMenu
                isOpen={isSortMenuOpen}
                onClose={() => setIsSortMenuOpen(false)}
                sortBy={sortBy}
                onSelectSortBy={(newSortBy) => {
                  setSortBy(newSortBy);
                }}
                options={[
                  {
                    id: 'added_at',
                    label: 'Date added',
                    icon: <Calendar size={15} />,
                  },
                  {
                    id: 'title',
                    label: 'Title',
                    icon: <Type size={15} />,
                  },
                  {
                    id: 'artist',
                    label: 'Artist',
                    icon: <Mic2 size={15} />,
                  },
                  {
                    id: 'album',
                    label: 'Album',
                    icon: <Disc3 size={15} />,
                  },
                  {
                    id: 'duration',
                    label: 'Duration',
                    icon: <Clock size={15} />,
                  },
                ]}
                desktopRef={sortMenuRef}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tracklist Table */}
      {rawTracks.length === 0 ? (
        <div className="text-center py-20 text-content-subtle border border-border-subtle rounded-xl bg-surface-panel/40">
          <Heart size={44} className="mx-auto mb-3 text-content-subtle" />
          <h3 className="text-base font-bold text-content-secondary">Songs you like will appear here</h3>
          <p className="text-xs text-content-muted mt-1">Tap the heart icon on any song to add it to Liked Songs.</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-16 text-content-subtle border border-border-subtle rounded-xl bg-surface-panel/40">
          <p className="text-xs text-content-muted">No songs match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-brand-500 font-bold hover:underline mt-2 cursor-pointer"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div ref={tracklistAnchorRef} className="scroll-mt-14">
          {/* Sticky Tracklist Column Header Row */}
          <div className="hidden md:block sticky top-0 z-20 bg-surface-island/95 backdrop-blur-md rounded-lg mb-1 border-b border-border-medium shadow-md">
            <div className="grid grid-cols-[40px_3fr_2fr_36px_60px] lg:grid-cols-[40px_4fr_3fr_2fr_36px_60px] px-3 sm:px-4 py-2.5 text-xs font-semibold uppercase text-content-secondary items-center select-none">
              {/* # Column */}
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSortBy('added_at');
                    setSortOrder('desc');
                  }}
                  className="inline-flex items-center justify-center hover:text-white transition gap-0.5 cursor-pointer py-0.5 px-1 rounded hover:bg-white/5"
                  title="Sort by Date added (newest first)"
                >
                  <span className={sortBy === 'added_at' ? 'text-brand-500 font-bold' : ''}>#</span>
                  {sortBy === 'added_at' && (
                    sortOrder === 'asc' ? <ChevronUp size={11} className="text-brand-500" /> : <ChevronDown size={11} className="text-brand-500" />
                  )}
                </button>
              </div>

              {/* Title Column */}
              <div className="flex items-center gap-3 truncate pr-3 select-none">
                <span className="w-10 shrink-0" />
                <button
                  type="button"
                  onClick={() => handleColumnHeaderSort('title')}
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:text-white transition group py-0.5 px-1 -ml-1 rounded hover:bg-white/5 text-left"
                  title="Sort by Title (A-Z / Z-A)"
                >
                  <span className={sortBy === 'title' ? 'text-brand-500 font-bold' : ''}>Title</span>
                  {sortBy === 'title' && (
                    sortOrder === 'asc' ? <ChevronUp size={12} className="text-brand-500 shrink-0" /> : <ChevronDown size={12} className="text-brand-500 shrink-0" />
                  )}
                </button>
              </div>

              {/* Album Column */}
              <div className="hidden md:flex items-center truncate pr-3 select-none">
                <button
                  type="button"
                  onClick={() => handleColumnHeaderSort('album')}
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:text-white transition group py-0.5 px-1 -ml-1 rounded hover:bg-white/5 text-left"
                  title="Sort by Album (A-Z / Z-A)"
                >
                  <span className={sortBy === 'album' ? 'text-brand-500 font-bold' : ''}>Album</span>
                  {sortBy === 'album' && (
                    sortOrder === 'asc' ? <ChevronUp size={12} className="text-brand-500 shrink-0" /> : <ChevronDown size={12} className="text-brand-500 shrink-0" />
                  )}
                </button>
              </div>

              {/* Date added Column */}
              <div className="hidden lg:flex items-center truncate pr-3 select-none">
                <button
                  type="button"
                  onClick={() => handleColumnHeaderSort('added_at')}
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:text-white transition group py-0.5 px-1 -ml-1 rounded hover:bg-white/5 text-left"
                  title="Sort by Date added"
                >
                  <span className={sortBy === 'added_at' ? 'text-brand-500 font-bold' : ''}>Date added</span>
                  {sortBy === 'added_at' && (
                    sortOrder === 'asc' ? <ChevronUp size={12} className="text-brand-500 shrink-0" /> : <ChevronDown size={12} className="text-brand-500 shrink-0" />
                  )}
                </button>
              </div>

              {/* Heart column spacer (hidden on mobile) */}
              <span className="hidden md:block" />

              {/* Duration Column */}
              <div className="text-right flex items-center justify-end select-none">
                <button
                  type="button"
                  onClick={() => handleColumnHeaderSort('duration')}
                  className="inline-flex items-center justify-end gap-1 cursor-pointer hover:text-white transition group py-0.5 px-1 -mr-1 rounded hover:bg-white/5"
                  title="Sort by Duration"
                >
                  <Clock size={14} className={sortBy === 'duration' ? 'text-brand-500' : ''} />
                  {sortBy === 'duration' && (
                    sortOrder === 'asc' ? <ChevronUp size={12} className="text-brand-500 shrink-0" /> : <ChevronDown size={12} className="text-brand-500 shrink-0" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Track Rows */}
          <div className="divide-y divide-transparent">
            {tracks.map((track, idx) => {
              const isThisTrack = currentTrack?.id === track.id;
              const isThisPlaying = isThisTrack && isPlaying;
              const isThisBuffering = isThisTrack && isBuffering;
              const isSelected = selectedTrackIds.has(track.id);
              const isFocused = focusedTrackIdx === idx;

              return (
                <div
                  key={`${track.id}-${idx}`}
                  data-fav-track-id={track.id}
                  onMouseEnter={() => searchQuery.trim() && setFocusedTrackIdx(idx)}
                  onClick={(e) => handleRowClick(e, track, idx)}
                  onDoubleClick={() => handleTrackPlay(track)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      const isAlreadySelected = selectedTrackIds.has(track.id);
                      if (!isAlreadySelected) {
                        const singleSet = new Set([track.id]);
                        setSelectedTrackIds(singleSet);
                        selectedTrackIdsRef.current = singleSet;
                        setLastSelectedTrackIdx(idx);
                        lastSelectedTrackIdxRef.current = idx;
                      }
                      const effectiveSelectedIds = isAlreadySelected ? selectedTrackIds : new Set([track.id]);
                      const isMulti = effectiveSelectedIds.size > 1;
                      const orderedTracks = isMulti
                        ? tracks.filter((t) => effectiveSelectedIds.has(t.id))
                        : [track];
                      onContextMenu(e, 'track', {
                        ...track,
                        selectedTracks: orderedTracks,
                        track_ids: orderedTracks.map((t) => t.id),
                        playlist_id: 'favorites',
                        deleteLabel: isMulti ? `Remove ${orderedTracks.length} tracks from Liked Songs` : 'Remove from Liked Songs',
                        onDelete: () => (isMulti ? handleBulkRemoveSelected() : handleHeartClick(e, track.id)),
                        onRemoveFromPlaylist: () => (isMulti ? handleBulkRemoveSelected() : handleHeartClick(e, track.id)),
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

                    const payload = {
                      id: track.id,
                      track_ids: trackIds,
                      tracks: orderedTracks.map((t) => ({
                        id: t.id,
                        title: t.title,
                        artist_name: t.artist_name,
                        album_id: t.album_id,
                        album_title: t.album_title,
                        cover_url: t.cover_url,
                      })),
                      title: track.title,
                      artist_name: track.artist_name,
                      album_id: track.album_id,
                      album_title: track.album_title,
                      cover_url: track.cover_url,
                    };

                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/track-index', String(idx));
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                    e.dataTransfer.setData('text/plain', trackIds.join(','));
                  }}
                  className={`grid grid-cols-[1fr_auto] md:grid-cols-[40px_3fr_2fr_36px_60px] lg:grid-cols-[40px_4fr_3fr_2fr_36px_60px] px-3 sm:px-4 py-2.5 rounded-lg group transition items-center cursor-default select-none ${
                    isFocused
                      ? 'bg-surface-hover ring-1 ring-brand-500/60 shadow-md text-content-primary'
                      : isSelected
                      ? 'bg-surface-hover ring-1 ring-white/20 text-content-primary'
                      : 'hover:bg-surface-elevated text-content-primary'
                  }`}
                >
                  {/* Column 1: Index / Play-Pause / Animated Equalizer / Loading Spinner (hidden on mobile) */}
                  <div className="hidden md:flex items-center justify-center w-8 h-8">
                    {isThisBuffering ? (
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
                            <div className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 pb-0.5" title="Playing">
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-1" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-2" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-3" />
                              <span className="w-[3px] bg-brand-500 rounded-full animate-eq-4" />
                            </div>
                          ) : (
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
                          className="hidden group-hover:flex items-center justify-center w-7 h-7 text-white hover:text-brand-400 transition cursor-pointer"
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

                  {/* Column 2: Cover & Title/Artist */}
                  <div className="flex items-center gap-3 truncate pr-3">
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      className="w-10 h-10 rounded object-cover bg-surface-elevated shrink-0 shadow-sm"
                    />
                    <div className="truncate min-w-0">
                      <p className={`text-base md:text-sm font-medium truncate ${
                        isThisTrack 
                          ? 'text-brand-500 font-bold' 
                          : isFocused 
                          ? 'text-brand-300 font-bold' 
                          : 'text-content-primary'
                      }`}>
                        {track.title}
                      </p>
                      <p className="text-sm md:text-xs text-content-secondary truncate mt-0.5">
                        <span
                          onClick={(e) => {
                            if (window.innerWidth < 768) return;
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

                  {/* Column 3: Album (hidden < md) */}
                  <div className="hidden md:block truncate pr-3">
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

                  {/* Column 4: Date added (hidden < lg) */}
                  <span className="hidden lg:block text-xs text-content-muted truncate pr-3">
                    {formatAddedAt(track.added_at || track.favorited_at)}
                  </span>

                  {/* Column 5: Heart button (hidden on mobile) */}
                  <div className="hidden md:flex items-center justify-center">
                    <button
                      onClick={(e) => handleHeartClick(e, track.id)}
                      className="p-1 text-brand-500 hover:scale-110 active:scale-95 transition cursor-pointer"
                      title="Remove from Liked Songs"
                    >
                      <Heart size={16} className="fill-brand-500" />
                    </button>
                  </div>

                  {/* Column 6: Duration & Mobile 3-Dots */}
                  <div className="flex items-center justify-end gap-1">
                    <span className="hidden md:inline text-right text-xs font-mono text-content-secondary">
                      {formatDuration(track.duration_seconds)}
                    </span>
                    <button
                      type="button"
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onContextMenu) {
                          onContextMenu(e, 'track', track);
                        }
                      }}
                      className="md:hidden w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition shrink-0"
                      title="Track Options"
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
