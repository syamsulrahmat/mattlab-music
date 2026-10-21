import React, { useState, useEffect } from 'react';
import { X, Plus, Check, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const AddToPlaylistModal = ({ track, isOpen, onClose, onPlaylistUpdated }) => {
  const { showToast } = usePlayer();
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(new Set());
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/playlists', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          // Only show custom playlists & collections, excluding live single Spotify chart playlists and the playlist where the song already resides
          const currentOriginId = track?.playlist_id;
          const customOnly = (data.items || []).filter(
            (p) => (!p.spotify_id || p.is_collection) && (!currentOriginId || String(p.id) !== String(currentOriginId))
          );
          setPlaylists(customOnly);
        })
        .catch((err) => console.error('Failed to load playlists:', err));

      setSelectedPlaylistIds(new Set());
      setNewPlaylistName('');
      setIsCreating(false);
      setIsSubmitting(false);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose, track?.playlist_id]);

  if (!isOpen || !track) return null;

  const togglePlaylist = (id) => {
    setSelectedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newPlaylistName.trim() }),
      });
      const data = await res.json();
      setNewPlaylistName('');
      setIsCreating(false);

      // Auto-check the newly created playlist
      setSelectedPlaylistIds((prev) => new Set(prev).add(data.id));

      // Reload custom playlists
      const currentOriginId = track?.playlist_id;
      const listRes = await fetch('/api/playlists', { credentials: 'include' });
      const listData = await listRes.json();
      setPlaylists((listData.items || []).filter(
        (p) => (!p.spotify_id || p.is_collection) && (!currentOriginId || String(p.id) !== String(currentOriginId))
      ));
      if (onPlaylistUpdated) onPlaylistUpdated();
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handleConfirmAdd = async () => {
    if (selectedPlaylistIds.size === 0 || isSubmitting) return;
    setIsSubmitting(true);

    const targetPlaylistIds = Array.from(selectedPlaylistIds);
    const trackIds = Array.isArray(track.track_ids) && track.track_ids.length > 0
      ? track.track_ids
      : (track.id ? [track.id] : []);

    let addedToPlaylists = [];
    let alreadyExistedPlaylists = [];

    try {
      for (const plId of targetPlaylistIds) {
        const payload = trackIds.length > 1 ? { track_ids: trackIds } : { track_id: trackIds[0] };
        const res = await fetch(`/api/playlists/${plId}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        const pl = playlists.find((p) => p.id === plId);
        const plName = pl?.name || 'playlist';

        if (data?.already_exists) {
          alreadyExistedPlaylists.push(plName);
        } else {
          addedToPlaylists.push(plName);
        }
      }

      if (showToast) {
        if (addedToPlaylists.length > 0) {
          if (trackIds.length > 1) {
            const msg = addedToPlaylists.length === 1
              ? `Added ${trackIds.length} tracks to ${addedToPlaylists[0]}`
              : `Added ${trackIds.length} tracks to ${addedToPlaylists.length} playlists`;
            showToast(msg);
          } else {
            const msg = addedToPlaylists.length === 1
              ? `Added “${track.title}” to ${addedToPlaylists[0]}`
              : `Added “${track.title}” to ${addedToPlaylists.length} playlists`;
            showToast(msg);
          }
        } else if (alreadyExistedPlaylists.length > 0) {
          const msg = trackIds.length > 1
            ? `⚠️ Tracks are already in ${alreadyExistedPlaylists.join(', ')}`
            : `⚠️ “${track.title}” is already in ${alreadyExistedPlaylists.join(', ')}`;
          showToast(msg);
        }
      }

      if (onPlaylistUpdated) onPlaylistUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to add tracks to playlists:', err);
      if (showToast) showToast('⚠️ Failed to add to playlists');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMultiTrack = Array.isArray(track.track_ids) && track.track_ids.length > 1;

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="bg-surface-elevated2 border border-border-medium rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-150 cursor-default flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-bold text-content-primary text-base">Add to playlist</h3>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary transition p-1">
            <X size={20} />
          </button>
        </div>

        {/* Selected Track(s) Info */}
        <div className="flex items-center gap-3 p-2 bg-surface-panel rounded-lg mb-4 shrink-0 border border-border-subtle">
          {track.cover_url ? (
            <img src={track.cover_url} alt="" className="w-10 h-10 rounded object-cover bg-surface-elevated shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded bg-surface-island flex items-center justify-center shrink-0">
              <Music size={18} className="text-brand-500" />
            </div>
          )}
          <div className="truncate">
            <p className="text-xs font-semibold text-content-primary truncate">
              {isMultiTrack ? `${track.track_ids.length} tracks selected` : track.title}
            </p>
            <p className="text-[11px] text-content-muted truncate">
              {isMultiTrack ? 'Adding to playlists' : track.artist_name}
            </p>
          </div>
        </div>

        {/* Playlist Checklist List */}
        <div className="flex-1 overflow-y-auto space-y-1 mb-4 pr-1 min-h-[120px] max-h-60">
          {playlists.map((pl) => {
            const isSelected = selectedPlaylistIds.has(pl.id);
            return (
              <div
                key={pl.id}
                onClick={() => togglePlaylist(pl.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition cursor-pointer select-none text-xs font-medium ${
                  isSelected
                    ? 'bg-surface-active text-content-primary ring-1 ring-brand-500/30'
                    : 'hover:bg-surface-active/60 text-content-primary'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-7 h-7 rounded bg-surface-island border border-border-subtle flex items-center justify-center shrink-0">
                    <Music size={13} className={isSelected ? 'text-brand-500' : 'text-content-muted'} />
                  </div>
                  <div className="truncate">
                    <span className="truncate block font-semibold">{pl.name}</span>
                    <span className="text-[10px] text-content-muted">
                      {pl.track_count || 0} {pl.track_count === 1 ? 'song' : 'songs'}
                    </span>
                  </div>
                </div>

                {/* Spotify-style Checkbox */}
                <div className={`w-5 h-5 rounded flex items-center justify-center transition shrink-0 ${
                  isSelected
                    ? 'bg-brand-500 border border-brand-500 text-black shadow-sm'
                    : 'border border-border-strong bg-surface-panel hover:border-content-secondary'
                }`}>
                  {isSelected && <Check size={13} className="stroke-[3]" />}
                </div>
              </div>
            );
          })}

          {playlists.length === 0 && !isCreating && (
            <div className="text-center py-6">
              <p className="text-xs text-content-muted">No custom playlists yet</p>
            </div>
          )}
        </div>

        {/* Create new playlist toggle/input */}
        <div className="shrink-0 mb-4">
          {isCreating ? (
            <form onSubmit={handleCreatePlaylist} className="space-y-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name..."
                autoFocus
                className="w-full bg-surface-panel border border-border-medium text-content-primary text-xs px-3 py-2 rounded-lg outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs text-content-muted hover:text-content-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="px-3 py-1.5 text-xs bg-brand-500 text-black font-bold rounded-lg hover:bg-brand-400 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2 bg-surface-active hover:bg-surface-hover text-content-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              <Plus size={14} /> New Playlist
            </button>
          )}
        </div>

        {/* Footer Confirmation Bar */}
        <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-content-muted hover:text-content-primary transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmAdd}
            disabled={selectedPlaylistIds.size === 0 || isSubmitting}
            className="flex-1 py-2 px-4 rounded-full bg-brand-500 hover:bg-brand-400 active:scale-95 text-black text-xs font-bold transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : selectedPlaylistIds.size === 0 ? (
              'Select a playlist'
            ) : !isMultiTrack ? (
              selectedPlaylistIds.size === 1
                ? 'Add to playlist'
                : `Add to ${selectedPlaylistIds.size} playlists`
            ) : (
              selectedPlaylistIds.size === 1
                ? `Add ${track.track_ids.length} tracks to playlist`
                : `Add ${track.track_ids.length} tracks to ${selectedPlaylistIds.size} playlists`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
