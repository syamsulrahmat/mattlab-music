import React, { useState, useEffect, useRef } from 'react';
import { X, ListMusic } from 'lucide-react';

export const CreatePlaylistModal = ({ isOpen, onClose, onCreatePlaylist }) => {
  const [playlistName, setPlaylistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setPlaylistName('');
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playlistName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onCreatePlaylist(playlistName.trim());
    setIsSubmitting(false);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-[#1f1f1f] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-white select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#121212] flex items-center justify-center text-brand-500 border border-white/5">
              <ListMusic size={18} />
            </div>
            <h3 className="font-bold text-white text-base">Create playlist</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full hover:bg-[#282828] text-[#b3b3b3] hover:text-white flex items-center justify-center transition"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Playlist name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="e.g. Chill Vibes, Rock Classics"
              className="w-full bg-[#121212] border border-white/10 focus:border-brand-500 text-white text-sm px-3.5 py-2.5 rounded-lg outline-none transition placeholder-[#666]"
              maxLength={60}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#b3b3b3] hover:text-white rounded-full hover:bg-[#282828] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!playlistName.trim() || isSubmitting}
              className="px-5 py-2 text-xs font-bold bg-brand-500 text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition shadow"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
