import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Play, Pause, Trash2, Clock, Music, Shuffle, 
  Search, X, Pencil, ArrowUpDown, GripVertical, Calendar, 
  CheckSquare, Square, Check, AlertTriangle, RefreshCw, ExternalLink, UserCheck, Lock,
  Type, Mic2, Disc3, ChevronDown, ListOrdered
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PlaylistCover } from './PlaylistCover';
import { SpotifyIcon } from './SpotifyIcon';
import { ConfirmModal } from './ConfirmModal';
import { shuffleArray, shuffledQueueStartingWith } from '../utils/shuffle';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatAddedAt = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '—';
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

  // In-playlist filter & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('custom'); // 'custom', 'title', 'artist', 'album', 'added_at', 'duration'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

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
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Delete modal
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

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

  // Live polling for Spotify playlists
  useEffect(() => {
    if (!playlistId || !playlist?.spotify_id) {
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
  }, [playlistId, playlist?.spotify_id]);

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
    if (!playlist?.spotify_id || !spotifyStatus?.tracks?.length) {
      return localTracks;
    }

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
  }, [playlist?.tracks, playlist?.spotify_id, playlist?.name, spotifyStatus]);

  // Filter & sort
  const tracks = useMemo(() => {
    let list = rawTracks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist_name && t.artist_name.toLowerCase().includes(q)) ||
        (t.album_title && t.album_title.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'custom') {
      return list;
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'artist') {
        cmp = (a.artist_name || '').localeCompare(b.artist_name || '');
      } else if (sortBy === 'album') {
        cmp = (a.album_title || '').localeCompare(b.album_title || '');
      } else if (sortBy === 'added_at') {
        cmp = new Date(a.added_at || 0) - new Date(b.added_at || 0);
      } else if (sortBy === 'duration') {
        cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [rawTracks, searchQuery, sortBy, sortOrder]);

  const isDragEnabled = !playlist?.spotify_id && sortBy === 'custom' && !searchQuery.trim();
  const isCurrentPlayingInPlaylist =
    currentTrack && rawTracks.some((t) => t.id === currentTrack.id);

  // Synchronization refs for responsive, lag-free keyboard navigation
  const rawTracksRef = useRef(rawTracks);
  useEffect(() => { rawTracksRef.current = rawTracks; }, [rawTracks]);

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
    const playableTracks = tracks
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
      const playableTracks = tracks
        .filter((t) => !t.isSyncPending)
        .map((t) => ({ ...t, playlist_id: playlistId }));
      if (playableTracks.length === 0) return;
      if (isShuffle) {
        const shuffled = shuffleArray(playableTracks);
        playTrack(shuffled[0], shuffled);
      } else {
        playTrack(playableTracks[0], playableTracks);
      }
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !isShuffle;
    toggleShuffle();

    const playableTracks = tracks
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

  // Keyboard navigation & reordering
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const currentSelectedIds = selectedTrackIdsRef.current;
      const currentTracks = tracksRef.current;
      const currentRawTracks = rawTracksRef.current;
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

  // Track selection handling (single, Ctrl/Cmd toggle, Shift range)
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

  const handleRemoveTrack = async (e, trackId) => {
    if (e) e.stopPropagation();
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
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  const handleBulkRemoveSelected = async () => {
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
    } catch (err) {
      console.error('Failed to remove selected tracks:', err);
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

    const newTracks = [...rawTracks];
    const [moved] = newTracks.splice(fromIdx, 1);
    newTracks.splice(dropIdx, 0, moved);

    rawTracksRef.current = newTracks;
    setPlaylist((prev) => (prev ? { ...prev, tracks: newTracks } : prev));
    saveReorder(newTracks.map((t) => t.id));
  };

  const totalSeconds = rawTracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#b3b3b3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500" />
      </div>
    );
  }

  if (!playlist || !playlist.id) {
    return (
      <div className="p-8 text-center text-[#b3b3b3]">
        <h3 className="text-lg font-bold text-white mb-2">Playlist not found</h3>
        <p className="text-xs text-[#777] mb-4">This playlist may have been deleted or moved.</p>
      </div>
    );
  }

  return (
    <div className="pb-16 select-none relative w-full">
      {/* 4. Full-bleed Header Banner taking all the area without back button */}
      <div 
        onContextMenu={(e) => onContextMenu?.(e, 'playlist', playlist)}
        className="bg-gradient-to-b from-emerald-950/45 via-[#181818]/75 to-[#121212] px-6 sm:px-8 pt-8 sm:pt-10 pb-8 sm:pb-10 w-full border-b border-white/5"
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
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5 text-white">
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
                className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight cursor-pointer hover:underline truncate"
                title="Click to rename"
              >
                {playlist.name}
              </h1>
              <button
                onClick={() => setIsEditingDetails(true)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-[#888] hover:text-white transition rounded-full hover:bg-white/10"
                title="Edit details"
              >
                <Pencil size={18} />
              </button>
            </div>

            {playlist.description ? (
              <p 
                onClick={() => setIsEditingDetails(true)}
                className="text-xs sm:text-sm text-[#b3b3b3] mb-3 line-clamp-2 cursor-pointer hover:text-white transition"
              >
                {playlist.description}
              </p>
            ) : (
              <p 
                onClick={() => setIsEditingDetails(true)}
                className="text-xs text-[#666] hover:text-[#999] cursor-pointer mb-3 italic"
              >
                + Add description
              </p>
            )}

            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#b3b3b3] font-medium flex-wrap">
              <span className="text-white font-semibold">{rawTracks.length} songs</span>
              {totalSeconds > 0 && (
                <>
                  <span>•</span>
                  <span>
                    {totalHours > 0 ? `${totalHours} hr ${totalMins} min` : `${totalMins} min`}
                  </span>
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
        className="flex items-center gap-2 px-3.5 py-2 bg-[#181818] text-white text-xs font-semibold rounded-full border border-white/20 shadow-2xl"
      >
        <Lock size={14} className="text-[#1DB954]" />
        <span>Spotify Chart • Order Locked</span>
      </div>

      {/* 3. Action & Filter Bar (scrolls naturally with the page) */}
      <div className="px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Play/Pause in green circle, shuffle, edit, take ownership */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition disabled:opacity-40 shrink-0"
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
              isShuffle ? 'text-brand-500 hover:text-brand-400' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title={isShuffle ? 'Disable Shuffle' : 'Shuffle playlist queue'}
          >
            <Shuffle size={22} />
            {isShuffle && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-500" />
            )}
          </button>

          <button
            onClick={() => setIsEditingDetails(true)}
            className="p-2.5 rounded-full text-[#b3b3b3] hover:text-white hover:bg-white/5 transition"
            title="Edit playlist name & description"
          >
            <Pencil size={18} />
          </button>

          {playlist?.spotify_id && (
            <button
              onClick={() => onPromptTakeOwnership?.(playlist)}
              className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#b3b3b3] hover:text-white transition flex items-center gap-1.5 border border-white/5"
              title="Unlink from Spotify and take full local ownership"
            >
              <UserCheck size={14} className="text-brand-400" />
              <span>Take Ownership</span>
            </button>
          )}
        </div>

        {/* Right: In-playlist search, icon sort dropdown, sync now icon, open in spotify icon, delete */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* In-playlist search */}
          <div className="relative flex-1 sm:w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
            <input
              type="text"
              placeholder="Filter playlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] text-white text-xs pl-8 pr-7 py-2 rounded-full border border-white/5 focus:border-white/20 outline-none transition placeholder:text-[#666]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort dropdown with icons */}
          <div className="relative shrink-0 flex items-center gap-1 bg-[#242424] hover:bg-[#2a2a2a] border border-white/5 rounded-full px-2.5 py-1.5 transition" ref={sortMenuRef}>
            <button
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs text-[#b3b3b3] hover:text-white transition outline-none"
              title={`Sorted by: ${
                sortBy === 'custom'
                  ? (playlist?.spotify_id ? 'Spotify Chart Order' : 'Custom Order')
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
                playlist?.spotify_id ? <Lock size={14} className="text-[#1DB954]" /> : <ListOrdered size={14} className="text-[#888]" />
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
              <ChevronDown size={11} className="text-[#777]" />
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

            {isSortMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#1f1f1f] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#666] tracking-wider">
                  Sort By
                </div>
                <button
                  onClick={() => {
                    setSortBy('custom');
                    setSortOrder('asc');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'custom' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {playlist?.spotify_id ? <Lock size={14} className="text-[#1DB954]" /> : <ListOrdered size={14} />}
                    <span>{playlist?.spotify_id ? 'Spotify chart order' : 'Custom order'}</span>
                  </span>
                  {sortBy === 'custom' && <Check size={13} />}
                </button>
                <button
                  onClick={() => {
                    setSortBy('title');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'title' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Type size={14} />
                    <span>Title</span>
                  </span>
                  {sortBy === 'title' && <Check size={13} />}
                </button>
                <button
                  onClick={() => {
                    setSortBy('artist');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'artist' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Mic2 size={14} />
                    <span>Artist</span>
                  </span>
                  {sortBy === 'artist' && <Check size={13} />}
                </button>
                <button
                  onClick={() => {
                    setSortBy('album');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'album' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Disc3 size={14} />
                    <span>Album</span>
                  </span>
                  {sortBy === 'album' && <Check size={13} />}
                </button>
                <button
                  onClick={() => {
                    setSortBy('added_at');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'added_at' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>Date added</span>
                  </span>
                  {sortBy === 'added_at' && <Check size={13} />}
                </button>
                <button
                  onClick={() => {
                    setSortBy('duration');
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/10 transition ${
                    sortBy === 'duration' ? 'text-brand-500 font-bold' : 'text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Clock size={14} />
                    <span>Duration</span>
                  </span>
                  {sortBy === 'duration' && <Check size={13} />}
                </button>
              </div>
            )}
          </div>

          {/* Sync Now icon button (if playlist is synced with Spotify) */}
          {playlist?.spotify_id && (
            <button
              onClick={handleSyncNow}
              disabled={isSyncingNow}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#b3b3b3] hover:text-[#1DB954] transition flex items-center justify-center disabled:opacity-50 shrink-0"
              title={isSyncingNow ? 'Syncing...' : 'Sync Now with Spotify'}
            >
              <RefreshCw size={15} className={isSyncingNow ? 'animate-spin text-[#1DB954]' : ''} />
            </button>
          )}

          {/* Open in Spotify icon button (if playlist has spotify_url) */}
          {playlist?.spotify_url && (
            <a
              href={playlist.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#b3b3b3] hover:text-[#1DB954] transition flex items-center justify-center shrink-0"
              title="Open on Spotify"
            >
              <SpotifyIcon size={16} />
            </a>
          )}

          {/* Delete playlist icon button */}
          <button
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#888] hover:text-red-400 transition flex items-center justify-center shrink-0"
            title="Delete playlist"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Reorder notice if sorted differently */}
      {!playlist?.spotify_id && !isDragEnabled && rawTracks.length > 1 && (
        <div className="px-6 sm:px-8 pb-3">
          <div className="text-[11px] text-[#777] flex items-center gap-1.5">
            <span>💡 Track reordering is active when sorted by <strong>Custom order</strong> with search cleared.</span>
          </div>
        </div>
      )}

      {/* Tracklist Table */}
      {rawTracks.length === 0 ? (
        <div className="mx-6 sm:px-8 text-center py-20 text-[#666] border border-white/5 rounded-xl bg-[#181818]/40">
          <Music size={40} className="mx-auto text-[#444] mb-3" />
          <p className="text-sm font-semibold text-[#888]">This playlist is currently empty.</p>
          <p className="text-xs text-[#555] mt-1">Add songs from albums, artists, or search to build this playlist.</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="mx-6 sm:px-8 text-center py-16 text-[#666] border border-white/5 rounded-xl bg-[#181818]/40">
          <p className="text-xs text-[#888]">No songs match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-brand-500 font-bold hover:underline mt-2"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="px-6 sm:px-8">
          {/* Sticky Tracklist Column Header Row */}
          <div className="sticky top-0 z-30 bg-[#121212]/95 backdrop-blur-md mb-2">
            <div className="grid grid-cols-[36px_1fr_56px_50px] md:grid-cols-[40px_3fr_2fr_56px_60px] lg:grid-cols-[40px_4fr_3fr_2fr_56px_60px] px-3 sm:px-4 py-2.5 text-xs font-semibold uppercase text-[#b3b3b3] border-b border-white/10 items-center">
              <span className="text-center">#</span>
              <div className="flex items-center gap-3 truncate pr-3">
                <span className="w-10 shrink-0" />
                <span>Title</span>
              </div>
              <span className="hidden md:block truncate pr-3">Album</span>
              <span className="hidden lg:block truncate pr-3">Date added</span>
              <span />
              <span className="text-right flex items-center justify-end">
                <Clock size={14} />
              </span>
            </div>
          </div>

          {/* Track Rows (Seamless Canvas) */}
          <div 
            onDragOver={(e) => {
              if (playlist?.spotify_id) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            className="space-y-0.5"
          >
              {tracks.map((track, idx) => {
                const isThisTrack = currentTrack?.id === track.id;
                const isThisPlaying = isThisTrack && isPlaying;
                const isThisBuffering = isThisTrack && isBuffering;
                const isSelected = selectedTrackIds.has(track.id);
                const isDragOver = dragOverTrackIdx === idx;
                const isBeingDragged = draggedTrackIdx === idx;

                return (
                  <div
                    key={`${track.id}-${idx}`}
                    data-track-id={track.id}
                    onClick={(e) => handleRowClick(e, track, idx)}
                    onDoubleClick={() => !track.isSyncPending && handleTrackPlay(track)}
                    onContextMenu={(e) => {
                      if (onContextMenu && !track.isSyncPending) {
                        e.preventDefault();
                        onContextMenu(e, 'track', {
                          ...track,
                          playlist_id: playlistId,
                          deleteLabel: 'Remove from this playlist',
                          onDelete: () => handleRemoveTrack(e, track.id),
                          onRemoveFromPlaylist: () => handleRemoveTrack(e, track.id),
                        });
                      }
                    }}
                    draggable={(!playlist?.spotify_id && isDragEnabled && !track.isSyncPending) || (playlist?.spotify_id && !track.isSyncPending) ? "true" : "false"}
                    onDragStart={(e) => {
                      if (playlist?.spotify_id) {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/plain', '');
                        const ghost = document.getElementById('spotify-locked-drag-ghost');
                        if (ghost) {
                          e.dataTransfer.setDragImage(ghost, 20, 16);
                        }
                        return;
                      }
                      if (!isDragEnabled || track.isSyncPending) return;
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
                    onDragEnd={() => {
                      setDraggedTrackIdx(null);
                      setDragOverTrackIdx(null);
                    }}
                    onDragOver={(e) => {
                      if (playlist?.spotify_id) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
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
                      if (playlist?.spotify_id) {
                        e.preventDefault();
                        return;
                      }
                      handleDrop(e, idx);
                    }}
                    className={`grid grid-cols-[36px_1fr_56px_50px] md:grid-cols-[40px_3fr_2fr_56px_60px] lg:grid-cols-[40px_4fr_3fr_2fr_56px_60px] px-3 sm:px-4 py-2.5 rounded-lg group transition items-center cursor-default select-none ${
                      isBeingDragged
                        ? 'opacity-40 border-dashed border-white/20'
                        : isDragOver
                        ? 'border-t-2 border-brand-500 bg-brand-500/10 shadow-lg'
                        : isSelected
                        ? 'bg-[#2a2a2a] ring-1 ring-white/20 text-white'
                        : track.isSyncPending
                        ? 'hover:bg-[#1a1a1a] opacity-85 text-white'
                        : 'hover:bg-[#1f1f1f] text-white'
                    }`}
                  >
                    {/* Column 1: Index / Play-Pause / Live Download Spinner */}
                    <div className="flex items-center justify-center w-8 h-8">
                      {track.isSyncPending ? (
                        track.syncStatus === 'downloading' ? (
                          <div className="flex items-center justify-center w-7 h-7" title={`Downloading: ${Math.round(track.liveProgress || 0)}%`}>
                            <div className="w-3.5 h-3.5 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : track.syncStatus === 'failed' ? (
                          <div className="flex items-center justify-center w-7 h-7 text-red-400" title={track.errorMessage || 'Download failed'}>
                            <AlertTriangle size={15} />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-7 h-7 text-[#666]" title="Queued for download">
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
                              <span className={`text-sm font-medium ${isThisTrack ? 'text-brand-500' : 'text-[#b3b3b3]'}`}>
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

                    {/* Column 2: Cover & Title/Artist */}
                    <div className="flex items-center gap-3 truncate pr-3">
                      {track.cover_url ? (
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          className="w-10 h-10 rounded object-cover bg-[#1f1f1f] shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[#1c1c1c] border border-white/5 flex items-center justify-center text-[#666] shrink-0 shadow-sm">
                          <Music size={18} />
                        </div>
                      )}
                      <div className="truncate min-w-0">
                        <div className="flex items-center gap-2 truncate">
                          <p className={`text-sm font-medium truncate ${track.isSyncPending ? 'text-[#e0e0e0]' : isThisTrack ? 'text-brand-500 font-bold' : 'text-white'}`}>
                            {track.title}
                          </p>
                          {track.syncStatus === 'downloading' && (
                            <span className="shrink-0 text-[10px] font-bold text-[#1DB954] bg-[#1DB954]/15 border border-[#1DB954]/25 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-ping" />
                              Downloading {Math.round(track.liveProgress || 0)}%
                            </span>
                          )}
                          {track.syncStatus === 'pending' && (
                            <span className="shrink-0 text-[10px] font-medium text-[#888] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
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
                              className="h-full bg-[#1DB954] rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(6, track.liveProgress || 0)}%` }}
                            />
                          </div>
                        )}

                        <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                          <span
                            onClick={(e) => {
                              if (track.isSyncPending) return;
                              e.stopPropagation();
                              if (onSelectArtist) onSelectArtist(track.artist_id);
                            }}
                            className={track.isSyncPending ? '' : 'hover:underline hover:text-white cursor-pointer'}
                          >
                            {track.artist_name}
                          </span>
                          <span className="md:hidden text-[#777]"> • {track.album_title}</span>
                        </p>
                      </div>
                    </div>

                    {/* Column 3: Album (hidden < md) */}
                    <div className="hidden md:block truncate pr-3">
                      <span 
                        onClick={(e) => {
                          if (track.isSyncPending) return;
                          e.stopPropagation();
                          if (onSelectAlbum) onSelectAlbum(track.album_id);
                        }}
                        className={`text-xs truncate inline ${track.isSyncPending ? 'text-[#777]' : 'text-[#b3b3b3] hover:text-white hover:underline cursor-pointer'}`}
                      >
                        {track.album_title}
                      </span>
                    </div>

                    {/* Column 4: Date added (hidden < lg) */}
                    <span className="hidden lg:block text-xs text-[#888] truncate pr-3">
                      {track.isSyncPending ? (track.syncStatus === 'downloading' ? 'Downloading...' : 'Queued') : formatAddedAt(track.added_at)}
                    </span>

                    {/* Column 5: Actions (Drag Handle & Trash) */}
                    <div className="flex items-center justify-center gap-1">
                      {isDragEnabled && !track.isSyncPending && (
                        <div
                          draggable="true"
                          onDragStart={(e) => {
                            e.stopPropagation();
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
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedTrackIdx(idx);
                          }}
                          onDragEnd={() => {
                            setDraggedTrackIdx(null);
                            setDragOverTrackIdx(null);
                          }}
                          className="p-1 cursor-grab active:cursor-grabbing text-white/20 group-hover:text-white/60 hover:!text-white transition rounded hover:bg-white/10"
                          title="Drag to rearrange track order (or use Alt+Up/Down)"
                        >
                          <GripVertical size={15} />
                        </div>
                      )}
                      {!track.isSyncPending && (
                        <button
                          onClick={(e) => handleRemoveTrack(e, track.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-red-400 transition rounded hover:bg-white/10"
                          title="Remove from playlist"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {/* Column 6: Duration */}
                    <span className="text-right text-xs font-mono text-[#b3b3b3]">
                      {formatDuration(track.duration_seconds)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Floating Multi-Select Action Banner */}
      {selectedTrackIds.size > 1 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[#242424] border border-white/20 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 text-xs font-medium text-white backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 text-brand-500 font-bold">
            <CheckSquare size={16} />
            <span>{selectedTrackIds.size} songs selected</span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <button
            onClick={handlePlaySelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition"
          >
            <Play size={13} className="fill-current" />
            <span>Play Selection</span>
          </button>

          <button
            onClick={handleBulkRemoveSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition"
          >
            <Trash2 size={13} />
            <span>Remove from Playlist</span>
          </button>

          <button
            onClick={() => setSelectedTrackIds(new Set())}
            className="p-1 text-[#888] hover:text-white transition"
            title="Deselect all (Esc)"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Edit Playlist Details Modal */}
      {isEditingDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#242424] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Edit Playlist Details</h3>
              <button
                onClick={() => setIsEditingDetails(false)}
                className="text-[#888] hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Playlist name"
                  required
                  maxLength={100}
                  className="w-full bg-[#181818] border border-white/10 focus:border-brand-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add an optional description..."
                  rows={3}
                  maxLength={300}
                  className="w-full bg-[#181818] border border-white/10 focus:border-brand-500 rounded-xl p-3 text-sm text-white outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[#b3b3b3] hover:text-white hover:bg-white/5 transition"
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
    </div>
  );
};
