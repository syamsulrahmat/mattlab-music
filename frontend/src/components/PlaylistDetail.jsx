import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Play, Pause, Trash2, Clock, Music, Shuffle, 
  Search, X, Pencil, ArrowUpDown, Calendar, 
  Square, Check, AlertTriangle, RefreshCw, ExternalLink, UserCheck, Lock,
  Type, Mic2, Disc3, ChevronDown, ChevronUp, ListOrdered, ListPlus, Layers, MoreVertical
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';
import { SpotifyIcon } from './SpotifyIcon';
import { ConfirmModal } from './ConfirmModal';
import { MergeSpotifyModal } from './MergeSpotifyModal';
import { TracklistFilterBar } from './TracklistFilterBar';
import { SortDropdownMenu } from './SortDropdownMenu';
import { shuffleArray, shuffledQueueStartingWith } from '../utils/shuffle';

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

export const PlaylistDetail = ({ 
  playlistId, 
  refreshTrigger,
  onPlaylistDeleted, 
  onPlaylistUpdated,
  onSelectAlbum, 
  onSelectArtist, 
  onContextMenu,
  onPromptTakeOwnership,
}) => {
  const [playlist, setPlaylist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Spotify Live Sync State
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  
  // Selection
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [lastSelectedTrackIdx, setLastSelectedTrackIdx] = useState(null);
  
  // Drag and drop
  const [draggedTrackIdx, setDraggedTrackIdx] = useState(null);
  const [dragOverTrackIdx, setDragOverTrackIdx] = useState(null);
  const [heldTrackId, setHeldTrackId] = useState(null);
  const holdTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // In-playlist filter & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterFocused, setIsFilterFocused] = useState(false);
  const [focusedTrackIdx, setFocusedTrackIdx] = useState(-1);
  const filterInputRef = useRef(null);
  const tracklistAnchorRef = useRef(null);
  const [sortBy, setSortBy] = useState('custom'); // 'custom', 'title', 'artist', 'album', 'added_at', 'duration'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

  const handleMobileFilterChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim() && tracklistAnchorRef.current) {
      tracklistAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleColumnHeaderSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder(columnKey === 'added_at' ? 'desc' : 'asc');
    }
  };

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

  // Inline edit modal
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Delete modal
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isTakeOwnershipOfferOpen, setIsTakeOwnershipOfferOpen] = useState(false);
  const [isTakeOwnershipConfirmOpen, setIsTakeOwnershipConfirmOpen] = useState(false);
  const [isTakingOwnership, setIsTakingOwnership] = useState(false);

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
    showToast,
  } = usePlayer();

  const fetchPlaylistSilently = async () => {
    if (!playlistId) return;
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setPlaylist((prev) => ({
        ...prev,
        ...data,
        tracks: Array.isArray(data.tracks) ? data.tracks : [],
        covers: Array.isArray(data.covers) ? data.covers : [],
      }));
    } catch (e) {
      // silent
    }
  };

  const fetchPlaylist = async () => {
    if (!playlistId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Playlist not found');
      const data = await res.json();
      setPlaylist({
        ...data,
        tracks: Array.isArray(data.tracks) ? data.tracks : [],
        covers: Array.isArray(data.covers) ? data.covers : [],
      });
      setEditName(data.name || '');
      setEditDescription(data.description || '');
    } catch (err) {
      console.error('Failed to load playlist:', err);
      setPlaylist(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSelectedTrackIds(new Set());
    setLastSelectedTrackIdx(null);
    setSearchQuery('');
    setSortBy('custom');
    setSortOrder('asc');
    setSpotifyStatus(null);
    fetchPlaylist();
  }, [playlistId, refreshTrigger]);

  // Live polling for Spotify playlists & collections with pending downloads
  useEffect(() => {
    if (!playlistId || (!playlist?.spotify_id && !playlist?.sources_count && !playlist?.is_collection)) {
      setSpotifyStatus(null);
      return;
    }

    let isMounted = true;
    let timer = null;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/spotify/status/${playlistId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        setSpotifyStatus((prev) => {
          if (prev && data.matched > prev.matched) {
            fetchPlaylistSilently();
            if (onPlaylistUpdated) onPlaylistUpdated();
          }
          return data;
        });

        // Continue fast polling if downloads are pending or active
        const hasWork = (data.downloading > 0) || (data.pending > 0);
        timer = setTimeout(pollStatus, hasWork ? 2500 : 25000);
      } catch (err) {
        if (isMounted) {
          timer = setTimeout(pollStatus, 10000);
        }
      }
    };

    pollStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [playlistId, playlist?.spotify_id, playlist?.sources_count, playlist?.is_collection]);

  const handleSyncNow = async () => {
    if (isSyncingNow || !playlistId) return;
    setIsSyncingNow(true);
    try {
      const syncRes = await fetch(`/api/spotify/sync-now/${playlistId}`, { method: 'POST', credentials: 'include' });
      const res = await fetch(`/api/spotify/status/${playlistId}`, { credentials: 'include' });
      if (res.ok) {
        setSpotifyStatus(await res.json());
      }
      fetchPlaylistSilently();
      if (onPlaylistUpdated) onPlaylistUpdated();

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const newCount = syncData.new_tracks_added ?? 0;
        if (showToast) {
          if (newCount > 0) {
            showToast(`✨ Playlist updated: ${newCount} new ${newCount === 1 ? 'song' : 'songs'} entered the chart!`);
          } else {
            showToast('✨ Playlist updated: all songs are up to date with chart.');
          }
        }
      }
    } catch (err) {
      console.error('Failed to sync now:', err);
      if (showToast) {
        showToast('⚠️ Failed to sync with Spotify');
      }
    } finally {
      setIsSyncingNow(false);
    }
  };

  const rawTracks = useMemo(() => {
    const localTracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
    
    // For single Spotify chart playlists, mirror spotifyStatus tracks strictly
    if (playlist?.spotify_id && !playlist?.is_collection && spotifyStatus?.tracks?.length) {
      const localMap = new Map();
      localTracks.forEach((t) => localMap.set(t.id, t));

      return spotifyStatus.tracks.map((st, idx) => {
        if (st.status === 'matched' && st.track_id && localMap.has(st.track_id)) {
          return {
            ...localMap.get(st.track_id),
            spotify_sync_id: st.id,
          };
        }

        return {
          id: `sync-${st.id}`,
          sync_id: st.id,
          title: st.title,
          artist_name: st.artist,
          album_title: playlist.name || 'Spotify Playlist',
          duration_seconds: Math.round((st.duration_ms || 0) / 1000),
          position: st.position !== undefined ? st.position : idx,
          isSyncPending: true,
          syncStatus: st.status, // 'pending' | 'downloading' | 'failed'
          liveProgress: st.live_progress || 0,
          errorMessage: st.error_message,
          cover_url: null,
        };
      });
    }

    // For custom collections or playlists with pending downloads:
    // Start with localTracks (custom order, preserving all manually added tracks)
    if (!spotifyStatus?.tracks?.length) {
      return localTracks;
    }

    const matchedTrackIds = new Set(localTracks.map((t) => t.id));
    const pendingTracks = [];

    for (const st of spotifyStatus.tracks) {
      if (st.status !== 'matched' || !matchedTrackIds.has(st.track_id)) {
        if (st.status !== 'matched') {
          pendingTracks.push({
            id: `sync-${st.id}`,
            sync_id: st.id,
            title: st.title,
            artist_name: st.artist,
            album_title: playlist?.name || 'Spotify Collection',
            duration_seconds: Math.round((st.duration_ms || 0) / 1000),
            position: st.position !== undefined ? st.position : localTracks.length + pendingTracks.length,
            isSyncPending: true,
            syncStatus: st.status,
            liveProgress: st.live_progress || 0,
            errorMessage: st.error_message,
            cover_url: null,
          });
        }
      }
    }

    return [...localTracks, ...pendingTracks];
  }, [playlist?.tracks, playlist?.spotify_id, playlist?.is_collection, playlist?.name, spotifyStatus]);

  // Full playlist in current sort order (unaffected by search filtering)
  const allTracks = useMemo(() => {
    if (sortBy === 'custom') {
      return sortOrder === 'asc' ? rawTracks : [...rawTracks].reverse();
    }

    const sorted = [...rawTracks].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'artist') {
        cmp = (a.artist_name || '').localeCompare(b.artist_name || '');
      } else if (sortBy === 'album') {
        cmp = (a.album_title || '').localeCompare(b.album_title || '');
      } else if (sortBy === 'added_at') {
        cmp = (parseUtcDate(a.added_at)?.getTime() || 0) - (parseUtcDate(b.added_at)?.getTime() || 0);
      } else if (sortBy === 'duration') {
        cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [rawTracks, sortBy, sortOrder]);

  // Filter & sort display list
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

  const isLockedSpotify = !!(playlist?.spotify_id && !playlist?.is_collection);
  const isDragEnabled = !isLockedSpotify && sortBy === 'custom' && !searchQuery.trim();
  const isCurrentPlayingInPlaylist =
    currentTrack && rawTracks.some((t) => t.id === currentTrack.id);

  // Synchronization refs for responsive, lag-free keyboard navigation
  const rawTracksRef = useRef(rawTracks);
  useEffect(() => { rawTracksRef.current = rawTracks; }, [rawTracks]);

  const allTracksRef = useRef(allTracks);
  useEffect(() => { allTracksRef.current = allTracks; }, [allTracks]);

  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const selectedTrackIdsRef = useRef(selectedTrackIds);
  useEffect(() => { selectedTrackIdsRef.current = selectedTrackIds; }, [selectedTrackIds]);

  const lastSelectedTrackIdxRef = useRef(lastSelectedTrackIdx);
  useEffect(() => { lastSelectedTrackIdxRef.current = lastSelectedTrackIdx; }, [lastSelectedTrackIdx]);

  // Debounced playlist reorder persistence
  const reorderTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  const saveReorder = (newTrackIds) => {
    if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/playlists/${playlistId}/reorder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ track_ids: newTrackIds }),
        });
        if (onPlaylistUpdated) onPlaylistUpdated();
      } catch (err) {
        console.error('Failed to save playlist reorder:', err);
      }
    }, 250);
  };

  // Playback handlers using unbiased Fisher-Yates shuffle
  const handleTrackPlay = (track) => {
    if (track.isSyncPending) return;
    // Playback queue always maintains the full playlist in its current sort order
    const playableTracks = allTracks
      .filter((t) => !t.isSyncPending)
      .map((t) => ({ ...t, playlist_id: playlistId }));
    if (playableTracks.length === 0) return;

    const trackWithPl = { ...track, playlist_id: playlistId };
    if (isShuffle && playableTracks.length > 1) {
      playTrack(trackWithPl, shuffledQueueStartingWith(trackWithPl, playableTracks));
    } else {
      playTrack(trackWithPl, playableTracks);
    }
  };

  const handlePlayAll = () => {
    if (isCurrentPlayingInPlaylist) {
      togglePlay();
    } else {
      const playableTracks = allTracks
        .filter((t) => !t.isSyncPending)
        .map((t) => ({ ...t, playlist_id: playlistId }));
      if (playableTracks.length === 0) return;

      // Candidate pool respects active search filter if matches exist, otherwise uses all playable tracks
      const candidateTracks = tracks
        .filter((t) => !t.isSyncPending)
        .map((t) => ({ ...t, playlist_id: playlistId }));
      const pool = candidateTracks.length > 0 ? candidateTracks : playableTracks;

      if (isShuffle) {
        if (playableTracks.length > 1) {
          const randomIndex = Math.floor(Math.random() * pool.length);
          const startTrackWithPl = pool[randomIndex];
          playTrack(startTrackWithPl, shuffledQueueStartingWith(startTrackWithPl, playableTracks));
        } else {
          playTrack(pool[0], playableTracks);
        }
      } else {
        const startTrackWithPl = pool[0];
        playTrack(startTrackWithPl, playableTracks);
      }
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    toggleShuffle();

    const playableTracks = allTracks
      .filter((t) => !t.isSyncPending)
      .map((t) => ({ ...t, playlist_id: playlistId }));
    if (nextShuffle) {
      if (isCurrentPlayingInPlaylist && currentTrack) {
        setQueue(shuffledQueueStartingWith({ ...currentTrack, playlist_id: playlistId }, playableTracks));
        setQueueIndex(0);
      } else if (!isPlaying && playableTracks.length > 0) {
        const shuffled = shuffleArray(playableTracks);
        playTrack(shuffled[0], shuffled);
      }
    } else {
      if (isCurrentPlayingInPlaylist && currentTrack) {
        const currIdx = playableTracks.findIndex((t) => t.id === currentTrack.id);
        setQueue(playableTracks);
        setQueueIndex(currIdx !== -1 ? currIdx : 0);
      }
    }
  };

  // Reset search track focus when query changes
  useEffect(() => {
    setFocusedTrackIdx(-1);
  }, [searchQuery]);

  // Auto-scroll focused track into view
  useEffect(() => {
    if (focusedTrackIdx >= 0 && tracks[focusedTrackIdx]) {
      const el = document.querySelector(`[data-track-id="${tracks[focusedTrackIdx].id}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedTrackIdx, tracks]);

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
      if (targetTrack && !targetTrack.isSyncPending) {
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

  // Keyboard navigation & reordering
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const currentSelectedIds = selectedTrackIdsRef.current;
      const currentTracks = tracksRef.current;
      const currentRawTracks = rawTracksRef.current;
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

      // 2. Escape to clear track selection
      if (e.key === 'Escape' && currentSelectedIds.size > 0) {
        setSelectedTrackIds(new Set());
        selectedTrackIdsRef.current = new Set();
        return;
      }

      // 3. Alt + ArrowUp / ArrowDown to rearrange selected track(s) using Adobe After Effects consolidated block behavior
      if (e.altKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        if (!isDragEnabled || currentSelectedIds.size === 0 || currentRawTracks.length <= 1) return;
        e.preventDefault();

        const selected = currentRawTracks.filter((t) => currentSelectedIds.has(t.id));
        const unselected = currentRawTracks.filter((t) => !currentSelectedIds.has(t.id));

        if (selected.length === 0 || unselected.length === 0) return;

        // Collect indices of selected items in current rawTracks
        const selectedIndices = [];
        currentRawTracks.forEach((t, idx) => {
          if (currentSelectedIds.has(t.id)) selectedIndices.push(idx);
        });

        const minIdx = selectedIndices[0];
        const maxIdx = selectedIndices[selectedIndices.length - 1];
        const isContiguous = (maxIdx - minIdx + 1) === selected.length;

        // How many unselected items appear before minIdx / maxIdx
        const unselectedBeforeMin = currentRawTracks.slice(0, minIdx).filter((t) => !currentSelectedIds.has(t.id)).length;
        const unselectedBeforeMax = currentRawTracks.slice(0, maxIdx).filter((t) => !currentSelectedIds.has(t.id)).length;

        let newTracks = null;

        if (e.code === 'ArrowUp') {
          // If already contiguous at top boundary, no-op
          if (isContiguous && unselectedBeforeMin === 0) return;

          // Target insertion index among unselected array (moves above the unselected track right above minIdx)
          const targetUnselectedIdx = Math.max(0, unselectedBeforeMin - 1);
          newTracks = [
            ...unselected.slice(0, targetUnselectedIdx),
            ...selected,
            ...unselected.slice(targetUnselectedIdx),
          ];

          // Scroll topmost selected track into view
          const topTrack = selected[0];
          if (topTrack) {
            const el = document.querySelector(`[data-track-id="${topTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        } else if (e.code === 'ArrowDown') {
          // If already contiguous at bottom boundary, no-op
          if (isContiguous && unselectedBeforeMax === unselected.length) return;

          // Target insertion index among unselected array (moves below the unselected track right below maxIdx)
          const targetUnselectedIdx = Math.min(unselected.length, unselectedBeforeMax + 1);
          newTracks = [
            ...unselected.slice(0, targetUnselectedIdx),
            ...selected,
            ...unselected.slice(targetUnselectedIdx),
          ];

          // Scroll bottommost selected track into view
          const bottomTrack = selected[selected.length - 1];
          if (bottomTrack) {
            const el = document.querySelector(`[data-track-id="${bottomTrack.id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }

        if (newTracks) {
          rawTracksRef.current = newTracks;
          setPlaylist((prev) => (prev ? { ...prev, tracks: newTracks } : prev));

          if (currentLastIdx !== null && currentRawTracks[currentLastIdx]) {
            const lastTrackId = currentRawTracks[currentLastIdx].id;
            const newLastIdx = newTracks.findIndex((t) => t.id === lastTrackId);
            if (newLastIdx !== -1) {
              setLastSelectedTrackIdx(newLastIdx);
              lastSelectedTrackIdxRef.current = newLastIdx;
            }
          }

          saveReorder(newTracks.map((t) => t.id));
        }
        return;
      }

      // 4. Plain ArrowUp / ArrowDown to switch selected song & scroll into view
      // Note: Ctrl/Cmd + ArrowUp/Down is reserved for volume control in App.jsx
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
              (acc, t, idx) => (currentSelectedIds.has(t.id) ? (acc === -1 ? idx : Math.min(acc, idx)) : acc),
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
  }, [isDragEnabled, playlistId, isShuffle, playTrack, onPlaylistUpdated]);

  // Track selection handling (single-click play on mobile, selectable/double-click on desktop)
  const handleRowClick = (e, track, idx) => {
    // On mobile devices, single tap triggers playback directly, or toggles pause if already playing
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (!track.isSyncPending) {
        if (currentTrack?.id === track.id) {
          togglePlay();
        } else {
          handleTrackPlay(track);
        }
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

  const handleRemoveTrack = async (e, trackId) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (playlist?.spotify_id && !playlist?.is_collection) {
      setIsTakeOwnershipOfferOpen(true);
      return;
    }
    try {
      await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE', credentials: 'include' });
      setPlaylist((prev) => (prev ? {
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      } : prev));
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
      if (onPlaylistUpdated) onPlaylistUpdated();
      if (showToast) {
        showToast('🗑️ Track removed from playlist');
      }
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  const handleBulkRemoveSelected = async () => {
    if (playlist?.spotify_id && !playlist?.is_collection) {
      setIsTakeOwnershipOfferOpen(true);
      return;
    }
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    try {
      await fetch(`/api/playlists/${playlistId}/tracks/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ track_ids: ids }),
      });
      setPlaylist((prev) => (prev ? {
        ...prev,
        tracks: prev.tracks.filter((t) => !selectedTrackIds.has(t.id)),
      } : prev));
      setSelectedTrackIds(new Set());
      if (onPlaylistUpdated) onPlaylistUpdated();
      if (showToast) {
        showToast(`🗑️ ${ids.length} track${ids.length > 1 ? 's' : ''} removed from playlist`);
      }
    } catch (err) {
      console.error('Failed to remove selected tracks:', err);
    }
  };

  const handleExecuteTakeOwnership = async () => {
    if (!playlist) return;
    setIsTakingOwnership(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/take-ownership`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setPlaylist((prev) => (prev ? { ...prev, spotify_id: null } : prev));
        if (showToast) {
          showToast(`✨ You now own “${playlist.name}”. Unlinked from Spotify.`);
        }
        if (onPlaylistUpdated) onPlaylistUpdated();
        setIsTakeOwnershipConfirmOpen(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (showToast) {
          showToast(`⚠️ ${errData.detail || 'Failed to take ownership of playlist'}`);
        }
      }
    } catch (err) {
      console.error('Failed to take ownership:', err);
      if (showToast) {
        showToast('⚠️ Failed to take ownership of playlist');
      }
    } finally {
      setIsTakingOwnership(false);
    }
  };

  const handlePlaySelected = () => {
    const selectedList = tracks
      .filter((t) => selectedTrackIds.has(t.id))
      .map((t) => ({ ...t, playlist_id: playlistId }));
    if (selectedList.length === 0) return;
    if (isShuffle) {
      const shuffled = shuffleArray(selectedList);
      playTrack(shuffled[0], shuffled);
    } else {
      playTrack(selectedList[0], selectedList);
    }
  };

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    const cleanName = editName.trim();
    if (!cleanName) return;

    setIsSavingDetails(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          description: editDescription.trim()
        }),
      });
      if (!res.ok) throw new Error('Failed to update playlist details');
      const updated = await res.json();
      setPlaylist((prev) => ({ ...prev, ...updated }));
      setIsEditingDetails(false);
      if (onPlaylistUpdated) onPlaylistUpdated();
      if (showToast) {
        showToast('✨ Playlist details updated');
      }
    } catch (err) {
      console.error('Failed to update playlist:', err);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleDeletePlaylist = async () => {
    try {
      await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE', credentials: 'include' });
      setIsConfirmDeleteOpen(false);
      if (showToast) {
        showToast(`🗑️ Deleted playlist "${playlist?.name || ''}"`);
      }
      onPlaylistDeleted(playlistId);
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    setDragOverTrackIdx(null);
    if (!isDragEnabled) return;

    const rawFrom = e.dataTransfer.getData('text/track-index');
    const fromIdx = draggedTrackIdx !== null ? draggedTrackIdx : (rawFrom ? parseInt(rawFrom, 10) : null);
    setDraggedTrackIdx(null);
    if (fromIdx === null || isNaN(fromIdx) || fromIdx === dropIdx) return;

    const fromTrack = rawTracks[fromIdx];
    const isMultiMove = fromTrack && selectedTrackIds.has(fromTrack.id) && selectedTrackIds.size > 1;

    let newTracks;
    if (isMultiMove) {
      const selectedList = rawTracks.filter((t) => selectedTrackIds.has(t.id));
      const remaining = rawTracks.filter((t) => !selectedTrackIds.has(t.id));
      const targetTrack = rawTracks[dropIdx];
      let insertIdx = remaining.findIndex((t) => t.id === targetTrack?.id);
      if (insertIdx === -1) insertIdx = remaining.length;
      newTracks = [...remaining.slice(0, insertIdx), ...selectedList, ...remaining.slice(insertIdx)];
    } else {
      newTracks = [...rawTracks];
      const [moved] = newTracks.splice(fromIdx, 1);
      newTracks.splice(dropIdx, 0, moved);
    }

    rawTracksRef.current = newTracks;
    setPlaylist((prev) => (prev ? { ...prev, tracks: newTracks } : prev));
    saveReorder(newTracks.map((t) => t.id));
  };

  const totalSeconds = rawTracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-content-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500" />
      </div>
    );
  }

  if (!playlist || !playlist.id) {
    return (
      <div className="p-8 text-center text-content-secondary">
        <h3 className="text-lg font-bold text-content-primary mb-2">Playlist not found</h3>
        <p className="text-xs text-content-muted mb-4">This playlist may have been deleted or moved.</p>
      </div>
    );
  }

  return (
    <div 
      data-dev-component="PlaylistDetail"
      data-dev-file="src/components/PlaylistDetail.jsx"
      data-dev-desc="Custom & Spotify playlist detail view with track ordering, in-view filtering, and column sorting"
      onDragOver={(e) => {
        e.preventDefault();
        if (playlist?.spotify_id) {
          e.dataTransfer.dropEffect = 'none';
        } else if (isDragEnabled) {
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (playlist?.spotify_id) {
          e.dataTransfer.dropEffect = 'none';
        } else if (isDragEnabled) {
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      className={`pb-16 select-none relative w-full ${playlist?.spotify_id && draggedTrackIdx !== null ? 'cursor-not-allowed' : ''}`}
    >
      {/* Mobile Sticky Floating Filter Bar */}
      <TracklistFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFocus={() => setIsFilterFocused(true)}
        onBlur={() => {
          // If no query typed, exit focused mode on blur
          if (!searchQuery.trim()) {
            setIsFilterFocused(false);
          }
        }}
        onClear={() => {
          setIsFilterFocused(false);
          setFocusedTrackIdx(-1);
        }}
        isFilterActive={isFilterFocused || Boolean(searchQuery.trim())}
        placeholder="Filter playlist..."
        mode="mobile"
      />

      {/* 4. Full-bleed Header Banner taking all the area without back button (Hidden on mobile when filtering) */}
      <div 
        className={`${isFilterFocused || searchQuery.trim() ? 'hidden md:block' : 'block'} bg-gradient-to-b from-emerald-950/45 via-surface-panel/75 to-surface-base md:to-surface-island px-6 sm:px-8 pt-4 sm:pt-10 pb-8 sm:pb-10 w-full border-b-0 md:border-b md:border-border-subtle`}
      >
        <div className="flex flex-col md:flex-row gap-6 md:gap-7 items-start md:items-end">
          <div 
            onClick={() => setIsEditingDetails(true)} 
            className="group relative cursor-pointer rounded-lg overflow-hidden shrink-0 shadow-2xl"
            title="Click to edit playlist details"
          >
            <PlaylistCover 
              covers={playlist.covers || []} 
              size="w-44 h-44 sm:w-52 sm:h-52 md:w-56 md:h-56" 
              iconSize={64} 
              className="rounded-lg transition duration-300 group-hover:scale-105" 
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5 text-content-primary">
              <Pencil size={24} />
              <span className="text-xs font-bold">Edit details</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-xs uppercase font-extrabold tracking-widest text-brand-500">
              Playlist
            </span>
            
            <div className="group flex items-center gap-2.5 mt-1 mb-2">
              <h1 
                onClick={() => setIsEditingDetails(true)}
                className="text-3xl sm:text-4xl md:text-5xl font-black text-content-primary tracking-tight cursor-pointer hover:underline truncate"
                title="Click to rename"
              >
                {playlist.name}
              </h1>
              <button
                onClick={() => setIsEditingDetails(true)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-content-muted hover:text-content-primary transition rounded-full hover:bg-white/10"
                title="Edit details"
              >
                <Pencil size={18} />
              </button>
            </div>

            {playlist.description ? (
              <p 
                onClick={() => setIsEditingDetails(true)}
                className="text-sm sm:text-base text-content-secondary mb-3 line-clamp-2 cursor-pointer hover:text-content-primary transition"
              >
                {playlist.description}
              </p>
            ) : (
              <p 
                onClick={() => setIsEditingDetails(true)}
                className="text-xs sm:text-sm text-content-subtle hover:text-content-secondary cursor-pointer mb-3 italic"
              >
                + Add description
              </p>
            )}

            <div className="flex items-center gap-2 text-sm sm:text-sm text-content-secondary font-medium flex-wrap">
              <span className="text-content-primary font-semibold">{rawTracks.length} songs</span>
              {totalSeconds > 0 && (
                <>
                  <span>•</span>
                  <span>
                    {totalHours > 0 ? `${totalHours} hr ${totalMins} min` : `${totalMins} min`}
                  </span>
                </>
              )}
              {(playlist.sources_count > 1 || playlist.is_collection) && (
                <>
                  <span>•</span>
                  <button
                    onClick={() => setIsMergeModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 text-xs font-semibold transition"
                    title="View merged Spotify sources"
                  >
                    <Layers size={12} />
                    <span>Collection ({playlist.sources_count || playlist.sources?.length || 2} sources)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Offscreen pre-rendered drag ghost for instantaneous frame-0 locked drag feedback */}
      <div
        id="spotify-locked-drag-ghost"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', pointerEvents: 'none', zIndex: -100 }}
        className="flex items-center gap-2 px-3.5 py-2 bg-surface-panel text-content-primary text-xs font-semibold rounded-full border border-border-strong shadow-2xl"
      >
        <Lock size={14} className="text-brand-500" />
        <span>Spotify Chart • Order Locked</span>
      </div>

      {/* 3. Action & Filter Bar (scrolls naturally with the page, all buttons horizontally aligned) */}
      <div className={`${isFilterFocused || searchQuery.trim() ? 'hidden md:flex' : 'flex'} px-4 sm:px-8 py-4 sm:py-5 items-center justify-between gap-3 overflow-visible`}>
        {/* Left: Play/Pause in green circle, shuffle, 3-dots options */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={handlePlayAll}
            disabled={isCurrentPlayingInPlaylist ? false : (tracks.length === 0 && allTracks.length === 0)}
            className="w-12 h-12 sm:w-14 sm:h-14 min-w-[3rem] min-h-[3rem] sm:min-w-[3.5rem] sm:min-h-[3.5rem] rounded-full aspect-square bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition disabled:opacity-40 shrink-0"
            title="Play Playlist"
          >
            {isCurrentPlayingInPlaylist && isPlaying ? (
              <Pause size={22} className="fill-black" />
            ) : (
              <Play size={22} className="fill-black ml-0.5 sm:ml-1" />
            )}
          </button>

          <button
            onClick={handleToggleShuffle}
            disabled={allTracks.length === 0}
            className={`relative p-2.5 sm:p-3 rounded-full hover:scale-105 active:scale-95 transition flex items-center justify-center disabled:opacity-40 shrink-0 ${
              isShuffle ? 'text-brand-500 hover:text-brand-400' : 'text-content-secondary hover:text-content-primary'
            }`}
            title={isShuffle ? 'Disable Shuffle' : 'Shuffle playlist queue'}
          >
            <Shuffle size={20} className="sm:w-[22px] sm:h-[22px]" />
            {isShuffle && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-500" />
            )}
          </button>

          {/* Playlist Options 3-Dots Button */}
          <button
            onClick={(e) => {
              if (onContextMenu) {
                onContextMenu(e, 'playlist', {
                  ...playlist,
                  onDelete: () => setIsConfirmDeleteOpen(true),
                });
              }
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-content-secondary hover:text-white hover:bg-white/10 active:scale-90 transition shrink-0"
            title="Playlist options"
          >
            <MoreVertical size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Right: In-playlist search, icon sort dropdown, merge button, sync now icon, open in spotify icon */}
        <div className="flex items-center gap-2 shrink-0">
          {/* In-playlist search (Desktop only - mobile has it at top of header banner) */}
          <TracklistFilterBar
            searchQuery={searchQuery}
            setSearchQuery={(val) => {
              setSearchQuery(val);
              if (!val) setFocusedTrackIdx(-1);
            }}
            placeholder="Filter playlist..."
            onKeyDown={handleFilterKeyDown}
            inputRef={filterInputRef}
            mode="desktop"
            className="hidden md:block"
          />

          {/* Sort dropdown with icons */}
          <div className="relative shrink-0 flex items-center gap-1 bg-surface-elevated2 hover:bg-surface-hover border border-border-subtle rounded-full px-2.5 py-1.5 transition" ref={sortMenuRef}>
            <button
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary transition outline-none"
              title={`Sorted by: ${
                sortBy === 'custom'
                  ? (playlist?.spotify_id && !playlist?.is_collection ? 'Spotify Chart Order' : 'Custom Order')
                  : sortBy === 'title'
                  ? 'Title'
                  : sortBy === 'artist'
                  ? 'Artist'
                  : sortBy === 'album'
                  ? 'Album'
                  : sortBy === 'added_at'
                  ? 'Date Added'
                  : 'Duration'
              }`}
            >
              {sortBy === 'custom' ? (
                playlist?.spotify_id && !playlist?.is_collection ? <Lock size={14} className="text-brand-500" /> : <ListOrdered size={14} className="text-content-muted" />
              ) : sortBy === 'title' ? (
                <Type size={14} className="text-brand-400" />
              ) : sortBy === 'artist' ? (
                <Mic2 size={14} className="text-brand-400" />
              ) : sortBy === 'album' ? (
                <Disc3 size={14} className="text-brand-400" />
              ) : sortBy === 'added_at' ? (
                <Calendar size={14} className="text-brand-400" />
              ) : (
                <Clock size={14} className="text-brand-400" />
              )}
              <ChevronDown size={11} className="text-content-muted" />
            </button>

            {sortBy !== 'custom' && (
              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="text-[11px] font-bold text-brand-500 hover:text-brand-400 pl-0.5 pr-1 transition"
                title={`Sort direction: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            )}

            <SortDropdownMenu
              isOpen={isSortMenuOpen}
              onClose={() => setIsSortMenuOpen(false)}
              sortBy={sortBy}
              onSelectSortBy={(newSortBy) => {
                setSortBy(newSortBy);
                if (newSortBy === 'custom') {
                  setSortOrder('asc');
                }
              }}
              options={[
                {
                  id: 'custom',
                  label: playlist?.spotify_id && !playlist?.is_collection ? 'Spotify chart order' : 'Custom order',
                  icon: playlist?.spotify_id && !playlist?.is_collection ? <Lock size={15} className="text-brand-500" /> : <ListOrdered size={15} />,
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
                  id: 'added_at',
                  label: 'Date added',
                  icon: <Calendar size={15} />,
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

          {/* Add Spotify Playlists / Merge Links button */}
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-content-secondary hover:text-brand-500 transition flex items-center justify-center shrink-0"
            title="Add Spotify Playlists / Merge Links"
          >
            <ListPlus size={16} className="text-brand-500" />
          </button>

          {/* Sync Now icon button (if playlist is synced with Spotify, desktop only) */}
          {playlist?.spotify_id && (
            <button
              onClick={handleSyncNow}
              disabled={isSyncingNow}
              className="hidden md:flex w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-content-secondary hover:text-brand-500 transition items-center justify-center disabled:opacity-50 shrink-0"
              title={isSyncingNow ? 'Syncing...' : 'Sync Now with Spotify'}
            >
              <RefreshCw size={15} className={isSyncingNow ? 'animate-spin text-brand-500' : ''} />
            </button>
          )}

          {/* Open in Spotify icon button (desktop only, hidden on mobile) */}
          {playlist?.spotify_url && (
            <a
              href={playlist.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-content-secondary hover:text-brand-500 transition items-center justify-center shrink-0"
              title="Open on Spotify"
            >
              <SpotifyIcon size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Reorder notice if sorted differently */}
      {!isLockedSpotify && !isDragEnabled && rawTracks.length > 1 && (
        <div className="px-6 sm:px-8 pb-3">
          <div className="text-[11px] text-content-muted flex items-center gap-1.5">
            <span>💡 Track reordering is active when sorted by <strong>Custom order</strong> with search cleared.</span>
          </div>
        </div>
      )}

      {/* Tracklist Table */}
      {rawTracks.length === 0 ? (
        <div className="mx-6 sm:px-8 text-center py-20 text-content-subtle border border-border-subtle rounded-xl bg-surface-panel/40">
          <Music size={40} className="mx-auto text-content-subtle mb-3" />
          <p className="text-sm font-semibold text-content-muted">This playlist is currently empty.</p>
          <p className="text-xs text-content-subtle mt-1">Add songs from albums, artists, or search to build this playlist.</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="mx-6 sm:px-8 text-center py-16 text-content-subtle border border-border-subtle rounded-xl bg-surface-panel/40">
          <p className="text-xs text-content-muted">No songs match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-brand-500 font-bold hover:underline mt-2"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div ref={tracklistAnchorRef} className="px-2 sm:px-8 scroll-mt-14">
          <div>
            {/* Sticky Tracklist Column Header Row */}
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                if (isLockedSpotify) {
                  e.dataTransfer.dropEffect = 'none';
                } else if (isDragEnabled) {
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (isLockedSpotify) {
                  e.dataTransfer.dropEffect = 'none';
                } else if (isDragEnabled) {
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              className="hidden md:block sticky top-0 z-30 bg-surface-island/95 backdrop-blur-md rounded-lg mb-1 border-b border-border-medium shadow-md"
            >
            <div className="grid grid-cols-[36px_1fr_50px] md:grid-cols-[40px_3fr_2fr_60px] lg:grid-cols-[40px_4fr_3fr_2fr_60px] px-3 sm:px-4 py-2.5 text-xs font-semibold uppercase text-content-secondary items-center select-none">
              {/* # Column */}
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (sortBy === 'custom') {
                      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortBy('custom');
                      setSortOrder('asc');
                    }
                  }}
                  className="inline-flex items-center justify-center hover:text-white transition gap-0.5 cursor-pointer py-0.5 px-1 rounded hover:bg-white/5 group"
                  title="Sort by original order"
                >
                  <span className={sortBy === 'custom' ? 'text-brand-500 font-bold' : ''}>#</span>
                  {sortBy === 'custom' && (
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

          {/* Track Rows (Seamless Canvas) */}
          <div 
            onDragOver={(e) => {
              e.preventDefault();
              if (isLockedSpotify) {
                e.dataTransfer.dropEffect = 'none';
              } else if (isDragEnabled) {
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              if (isLockedSpotify) {
                e.dataTransfer.dropEffect = 'none';
              } else if (isDragEnabled) {
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            className={`space-y-0.5 ${isLockedSpotify && draggedTrackIdx !== null ? 'cursor-not-allowed' : ''}`}
          >
              {tracks.map((track, idx) => {
                const isThisTrack = currentTrack?.id === track.id;
                const isThisPlaying = isThisTrack && isPlaying;
                const isThisBuffering = isThisTrack && isBuffering;
                const isSelected = selectedTrackIds.has(track.id);
                const isDragOver = dragOverTrackIdx === idx;
                const isBeingDragged = draggedTrackIdx === idx;
                const isFocused = focusedTrackIdx === idx;
                const isSpotify = isLockedSpotify;
                const isHeld = heldTrackId === track.id;

                return (
                  <div
                    key={`${track.id}-${idx}`}
                    data-track-id={track.id}
                    onMouseEnter={() => searchQuery.trim() && setFocusedTrackIdx(idx)}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      if (e.target.closest('button, a, [data-no-drag]')) return;
                      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                      holdTimerRef.current = setTimeout(() => {
                        setHeldTrackId(track.id);
                      }, 200);
                    }}
                    onMouseUp={() => {
                      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                      if (heldTrackId) setHeldTrackId(null);
                    }}
                    onMouseLeave={() => {
                      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                      if (heldTrackId) setHeldTrackId(null);
                    }}
                    onClick={(e) => handleRowClick(e, track, idx)}
                    onDoubleClick={() => !track.isSyncPending && handleTrackPlay(track)}
                    onContextMenu={(e) => {
                      if (onContextMenu && !track.isSyncPending) {
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
                          ? tracks.filter((t) => effectiveSelectedIds.has(t.id) && !t.isSyncPending)
                          : [track];
                        onContextMenu(e, 'track', {
                          ...track,
                          selectedTracks: orderedTracks,
                          track_ids: orderedTracks.map((t) => t.id),
                          playlist_id: playlistId,
                          deleteLabel: isMulti ? `Remove ${orderedTracks.length} tracks from this playlist` : 'Remove from this playlist',
                          onDelete: () => (isMulti ? handleBulkRemoveSelected() : handleRemoveTrack(e, track.id)),
                          onRemoveFromPlaylist: () => (isMulti ? handleBulkRemoveSelected() : handleRemoveTrack(e, track.id)),
                        });
                      }
                    }}
                    draggable={(!isLockedSpotify && isDragEnabled && !track.isSyncPending) || (isLockedSpotify && !track.isSyncPending) ? "true" : "false"}
                    onDragStart={(e) => {
                      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                      setHeldTrackId(track.id);

                      const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
                      const orderedTracks = isMulti
                        ? tracks.filter((t) => selectedTrackIds.has(t.id) && !t.isSyncPending)
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

                      if (isLockedSpotify) {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/track-index', String(idx));
                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                        e.dataTransfer.setData('text/plain', trackIds.join(','));
                        const ghost = document.getElementById('spotify-locked-drag-ghost');
                        if (ghost) {
                          e.dataTransfer.setDragImage(ghost, 20, 16);
                        }
                        setDraggedTrackIdx(idx);
                        return;
                      }
                      if (!isDragEnabled || track.isSyncPending) return;
                      e.dataTransfer.setData('text/track-index', String(idx));
                      e.dataTransfer.setData('application/json', JSON.stringify(payload));
                      e.dataTransfer.setData('text/plain', trackIds.join(','));
                      e.dataTransfer.effectAllowed = 'copyMove';
                      setDraggedTrackIdx(idx);
                    }}
                    onDragEnd={() => {
                      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                      setHeldTrackId(null);
                      setDraggedTrackIdx(null);
                      setDragOverTrackIdx(null);
                    }}
                    onDragEnter={(e) => {
                      if (isLockedSpotify) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'none';
                        return;
                      }
                      if (!isDragEnabled || track.isSyncPending) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDragOver={(e) => {
                      if (isLockedSpotify) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'none';
                        return;
                      }
                      if (!isDragEnabled || track.isSyncPending) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverTrackIdx !== idx) setDragOverTrackIdx(idx);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget)) return;
                      if (dragOverTrackIdx === idx) setDragOverTrackIdx(null);
                    }}
                    onDrop={(e) => {
                      if (isLockedSpotify) {
                        e.preventDefault();
                        return;
                      }
                      handleDrop(e, idx);
                    }}
                    className={`grid grid-cols-[1fr_auto] md:grid-cols-[40px_3fr_2fr_60px] lg:grid-cols-[40px_4fr_3fr_2fr_60px] px-3 sm:px-4 py-2.5 rounded-lg group transition items-center select-none border-t-2 ${
                      draggedTrackIdx !== null ? '[&_*]:pointer-events-none' : ''
                    } ${
                      isSpotify
                        ? (draggedTrackIdx !== null || isHeld ? 'cursor-not-allowed' : 'cursor-default')
                        : (isDragEnabled && !track.isSyncPending)
                        ? (isHeld ? 'cursor-grabbing' : 'cursor-default')
                        : 'cursor-default'
                    } ${
                      isBeingDragged
                        ? 'opacity-40 border-dashed border-white/20'
                        : isDragOver
                        ? 'border-brand-500 bg-brand-500/10 shadow-lg'
                        : isFocused
                        ? 'border-transparent bg-surface-hover ring-1 ring-brand-500/60 shadow-md text-content-primary'
                        : isSelected
                        ? 'border-transparent bg-surface-hover ring-1 ring-white/20 text-content-primary'
                        : track.isSyncPending
                        ? 'border-transparent hover:bg-surface-island opacity-85 text-content-primary'
                        : 'border-transparent hover:bg-surface-elevated text-content-primary'
                    }`}
                  >
                    {/* Column 1: Index / Play-Pause / Live Download Spinner (hidden on mobile) */}
                    <div className="hidden md:flex items-center justify-center w-8 h-8">
                      {track.isSyncPending ? (
                        track.syncStatus === 'downloading' ? (
                          <div className="flex items-center justify-center w-7 h-7" title={`Downloading: ${Math.round(track.liveProgress || 0)}%`}>
                            <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : track.syncStatus === 'failed' ? (
                          <div className="flex items-center justify-center w-7 h-7 text-red-400" title={track.errorMessage || 'Download failed'}>
                            <AlertTriangle size={15} />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-7 h-7 text-content-subtle" title="Queued for download">
                            <Clock size={15} />
                          </div>
                        )
                      ) : isThisBuffering ? (
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
                            className="hidden group-hover:flex items-center justify-center w-7 h-7 text-content-primary hover:text-brand-400 transition"
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
                      {track.cover_url ? (
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          className="w-10 h-10 rounded object-cover bg-surface-elevated shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-surface-panel border border-border-subtle flex items-center justify-center text-content-subtle shrink-0 shadow-sm">
                          <Music size={18} />
                        </div>
                      )}
                      <div className="truncate min-w-0">
                        <div className="flex items-center gap-2 truncate">
                          <p className={`text-base md:text-sm font-medium truncate ${
                            track.isSyncPending 
                              ? 'text-content-primary' 
                              : isThisTrack 
                              ? 'text-brand-500 font-bold' 
                              : isFocused 
                              ? 'text-brand-300 font-bold' 
                              : 'text-content-primary'
                          }`}>
                            {track.title}
                          </p>
                          {track.syncStatus === 'downloading' && (
                            <span className="shrink-0 text-[10px] font-bold text-brand-500 bg-brand-500/15 border border-brand-500/25 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-ping" />
                              Downloading {Math.round(track.liveProgress || 0)}%
                            </span>
                          )}
                          {track.syncStatus === 'pending' && (
                            <span className="shrink-0 text-[10px] font-medium text-content-muted bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                              Queued
                            </span>
                          )}
                          {track.syncStatus === 'failed' && (
                            <span className="shrink-0 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded" title={track.errorMessage}>
                              Failed
                            </span>
                          )}
                        </div>

                        {track.syncStatus === 'downloading' && (
                          <div className="h-1 w-28 bg-white/10 rounded-full overflow-hidden mt-1">
                            <div 
                              className="h-full bg-brand-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(6, track.liveProgress || 0)}%` }}
                            />
                          </div>
                        )}

                        <p className="text-sm md:text-xs text-content-secondary truncate mt-0.5">
                          {/* Desktop clickable artist link; mobile non-clickable to prevent accidental navigation */}
                          <span
                            data-no-drag="true"
                            onClick={(e) => {
                              // On mobile (< 768px), allow row selection/playback instead of jumping to artist
                              if (window.innerWidth < 768) return;
                              if (track.isSyncPending) return;
                              e.stopPropagation();
                              if (onSelectArtist) onSelectArtist(track.artist_id);
                            }}
                            className={track.isSyncPending ? '' : 'hidden md:inline md:hover:underline md:hover:text-content-primary md:cursor-pointer'}
                          >
                            {track.artist_name}
                          </span>
                          <span className="md:hidden text-content-secondary">
                            {track.artist_name}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Column 3: Album (hidden < md) */}
                    <div className="hidden md:block truncate pr-3">
                      <span 
                        data-no-drag="true"
                        onClick={(e) => {
                          if (track.isSyncPending) return;
                          e.stopPropagation();
                          if (onSelectAlbum) onSelectAlbum(track.album_id);
                        }}
                        className={`text-xs truncate inline ${track.isSyncPending ? 'text-content-muted' : 'text-content-secondary hover:text-content-primary hover:underline cursor-pointer'}`}
                      >
                        {track.album_title}
                      </span>
                    </div>

                    {/* Column 4: Date added (hidden < lg) */}
                    <span className="hidden lg:block text-xs text-content-muted truncate pr-3">
                      {track.isSyncPending ? (track.syncStatus === 'downloading' ? 'Downloading...' : 'Queued') : formatAddedAt(track.added_at)}
                    </span>

                    {/* Column 5: Duration & Mobile 3-Dots */}
                    <div className="flex items-center justify-end gap-1">
                      <span className="hidden md:inline text-right text-xs font-mono text-content-secondary">
                        {formatDuration(track.duration_seconds)}
                      </span>
                      <button
                        type="button"
                        data-no-drag="true"
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onContextMenu && !track.isSyncPending) {
                            onContextMenu(e, 'track', {
                              ...track,
                              selectedTracks: [track],
                              track_ids: [track.id],
                              playlist_id: playlistId,
                              deleteLabel: 'Remove from this playlist',
                              onDelete: () => handleRemoveTrack(e, track.id),
                              onRemoveFromPlaylist: () => handleRemoveTrack(e, track.id),
                            });
                          }
                        }}
                        className="md:hidden w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-content-secondary hover:text-white active:scale-90 transition shrink-0"
                        title="Options"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}



      {/* Edit Playlist Details Modal */}
      {isEditingDetails && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setIsEditingDetails(false)}
        >
          <div 
            className="bg-surface-elevated2 border border-border-medium rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-content-primary">Edit Playlist Details</h3>
              <button
                onClick={() => setIsEditingDetails(false)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Playlist name"
                  required
                  maxLength={100}
                  className="w-full bg-surface-panel border border-border-medium focus:border-brand-500 rounded-xl px-3.5 py-2.5 text-sm text-content-primary outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add an optional description..."
                  rows={3}
                  maxLength={300}
                  className="w-full bg-surface-panel border border-border-medium focus:border-brand-500 rounded-xl p-3 text-sm text-content-primary outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDetails || !editName.trim()}
                  className="px-5 py-2 rounded-full text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black transition active:scale-95 disabled:opacity-50"
                >
                  {isSavingDetails ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Playlist Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        title={`Delete "${playlist.name}"?`}
        message="This will delete the playlist. Your actual audio files will remain safe in your library."
        confirmText="Delete"
        onConfirm={handleDeletePlaylist}
        onClose={() => setIsConfirmDeleteOpen(false)}
      />

      {/* Step 1: Spotify Playlist Track Removal Intercept (Take Ownership Offer) */}
      <ConfirmModal
        isOpen={isTakeOwnershipOfferOpen}
        title={`Take ownership of “${playlist?.name}”?`}
        message={`"${playlist?.name}" is synced with Spotify. Tracks cannot be removed from live Spotify charts. To edit, add, or remove tracks, you can take full local ownership of this playlist.`}
        confirmText="Take Ownership"
        cancelText="Keep Synced"
        variant="primary"
        onConfirm={() => {
          setIsTakeOwnershipOfferOpen(false);
          setIsTakeOwnershipConfirmOpen(true);
        }}
        onClose={() => setIsTakeOwnershipOfferOpen(false)}
      />

      {/* Step 2: Final Take Ownership Confirmation */}
      <ConfirmModal
        isOpen={isTakeOwnershipConfirmOpen}
        title="Confirm: Unlink from Spotify?"
        message={`Are you sure you want to take ownership? This will permanently unlink "${playlist?.name}" from Spotify sync and turn it into a standard local playlist. All downloaded tracks will remain in your library.`}
        confirmText="Yes, Take Ownership"
        cancelText="Go Back"
        variant="primary"
        isLoading={isTakingOwnership}
        onConfirm={handleExecuteTakeOwnership}
        onClose={() => setIsTakeOwnershipConfirmOpen(false)}
      />

      {/* Add / Merge Spotify Playlists Modal */}
      <MergeSpotifyModal
        isOpen={isMergeModalOpen}
        playlist={playlist}
        onClose={() => setIsMergeModalOpen(false)}
        onMergeSuccess={(result) => {
          showToast(`✨ Added ${result.new_tracks_added} new tracks (${result.duplicates_skipped} duplicates skipped)!`);
          fetchPlaylistSilently();
          if (onPlaylistUpdated) onPlaylistUpdated();
        }}
      />
    </div>
  );
};
