import React, { useState, useEffect } from 'react';
import { X, Plus, Check, Music } from 'lucide-react';

export const AddToPlaylistModal = ({ track, isOpen, onClose, onPlaylistUpdated }) => {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [addedIds, setAddedIds] = useState(new Set());
  const [existingIds, setExistingIds] = useState(new Set());
  const [warnMessage, setWarnMessage] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/playlists')
        .then((res) => res.json())
        .then((data) => setPlaylists(data.items || []))
        .catch((err) => console.error('Failed to load playlists:', err));
      setAddedIds(new Set());
      setExistingIds(new Set());
      setWarnMessage(null);
      setNewPlaylistName('');
      setIsCreating(false);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !track) return null;

  const handleAddToPlaylist = async (playlistId) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id }),
      });
      const data = await res.json();
      if (data?.already_exists) {
        setExistingIds((prev) => new Set(prev).add(playlistId));
        setWarnMessage(`"${track.title}" is already in this playlist`);
        setTimeout(() => setWarnMessage(null), 3500);
      } else {
        setAddedIds((prev) => new Set(prev).add(playlistId));
      }
      if (onPlaylistUpdated) onPlaylistUpdated();
    } catch (err) {
      console.error('Failed to add track:', err);
    }
  };

  const handleCreateAndAdd = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim() }),
      });
      const data = await res.json();
      await handleAddToPlaylist(data.id);
      setNewPlaylistName('');
      setIsCreating(false);
      // Reload playlists
      const listRes = await fetch('/api/playlists');
      const listData = await listRes.json();
      setPlaylists(listData.items || []);
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="bg-[#242424] border border-[#333] rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-150 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white text-base">Add to playlist</h3>
          <button onClick={onClose} className="text-[#888] hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3 p-2 bg-[#181818] rounded-lg mb-4">
          <img src={track.cover_url} alt="" className="w-10 h-10 rounded object-cover bg-[#282828]" />
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate">{track.title}</p>
            <p className="text-[11px] text-[#888] truncate">{track.artist_name}</p>
          </div>
        </div>

        {warnMessage && (
          <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-lg text-center font-medium animate-in fade-in">
            {warnMessage}
          </div>
        )}

        {/* Existing Playlists */}
        <div className="max-h-52 overflow-y-auto space-y-1 mb-4 pr-1">
          {playlists.map((pl) => {
            const isAdded = addedIds.has(pl.id);
            const isExisting = existingIds.has(pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => handleAddToPlaylist(pl.id)}
                disabled={isAdded || isExisting}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[#333] transition text-left text-xs font-medium text-white disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Music size={14} className="text-[#1DB954] shrink-0" />
                  <span className="truncate">{pl.name}</span>
                </div>
                {isAdded ? (
                  <span className="flex items-center gap-1 text-[#1DB954] text-[11px] font-bold">
                    <Check size={14} /> Added
                  </span>
                ) : isExisting ? (
                  <span className="flex items-center gap-1 text-amber-400 text-[11px] font-bold">
                    ⚠️ Already exists
                  </span>
                ) : (
                  <Plus size={16} className="text-[#888]" />
                )}
              </button>
            );
          })}

          {playlists.length === 0 && !isCreating && (
            <p className="text-xs text-[#888] text-center py-4">No playlists yet</p>
          )}
        </div>

        {/* Create new playlist toggle/input */}
        {isCreating ? (
          <form onSubmit={handleCreateAndAdd} className="space-y-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name..."
              autoFocus
              className="w-full bg-[#181818] border border-[#333] text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-[#1DB954]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-[#888] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs bg-[#1DB954] text-black font-bold rounded-lg hover:bg-brand-400"
              >
                Create & Add
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full py-2 bg-[#333] hover:bg-[#3e3e3e] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Plus size={14} /> New Playlist
          </button>
        )}
      </div>
    </div>
  );
};
