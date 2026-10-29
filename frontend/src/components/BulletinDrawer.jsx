import React, { useState, useEffect, useRef } from 'react';
import {
  Megaphone,
  X,
  Send,
  Plus,
  Pin,
  Trash2,
  Play,
  Pause,
  Music,
  MessageCircle,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { UserAvatar } from './UserAvatar';

const REACTION_EMOJIS = ['❤️', '👍', '🔥', '🎵', '🎉'];

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

/**
 * Formats message text: detects URLs (http/https), renders them as
 * secure clickable links with break-all so long links never blow out the mobile drawer.
 */
const renderFormattedContent = (text) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-brand-400 hover:text-brand-300 underline underline-offset-2 break-all font-medium transition"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export const BulletinDrawer = ({ isOpen, onClose, onUnreadCountChange, onSelectUser }) => {
  const { user, isAdmin } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();

  const [broadcasts, setBroadcasts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New post form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [attachedTrack, setAttachedTrack] = useState(null);

  // Comment input per broadcast: { [broadcastId]: string }
  const [commentInputs, setCommentInputs] = useState({});
  const [submittingCommentId, setSubmittingCommentId] = useState(null);

  // Expanded comments per broadcast on mobile: { [broadcastId]: boolean }
  const [expandedComments, setExpandedComments] = useState({});

  const drawerRef = useRef(null);
  const listScrollRef = useRef(null);

  // Touch swipe-down to dismiss gesture (Mobile bottom sheet)
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const touchStartX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleTouchStart = (e) => {
    if (window.innerWidth >= 640) return; // Touch sheet only on mobile screens
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchCurrentY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || window.innerWidth >= 640) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diffY = touchCurrentY.current - touchStartY.current;
    const diffX = Math.abs(e.touches[0].clientX - touchStartX.current);

    // If starting inside scrollable list, only drag if scrolled to top (scrollTop <= 0) and dragging downward
    if (listScrollRef.current && listScrollRef.current.scrollTop > 0) {
      return;
    }

    if (diffY > 0 && diffY > diffX) {
      setDragOffset(diffY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || window.innerWidth >= 640) return;
    setIsDragging(false);
    if (dragOffset > 90) {
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  // Fetch broadcasts
  const fetchBulletin = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/bulletin');
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts || []);
      }
    } catch (err) {
      console.error('Failed to load bulletin:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Mark all read when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    fetchBulletin();

    fetch('/api/bulletin/mark-read', { method: 'POST' })
      .then(() => onUnreadCountChange?.(0))
      .catch(() => {});
  }, [isOpen]);

  // Global Esc key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Create new broadcast
  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsPosting(true);
    try {
      const res = await fetch('/api/bulletin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          is_pinned: isPinned,
          track_id: attachedTrack?.id || null,
        }),
      });

      if (res.ok) {
        setTitle('');
        setContent('');
        setIsPinned(false);
        setAttachedTrack(null);
        setShowCreateForm(false);
        await fetchBulletin();
      }
    } catch (err) {
      console.error('Failed to create broadcast:', err);
    } finally {
      setIsPosting(false);
    }
  };

  // Delete broadcast
  const handleDeleteBroadcast = async (broadcastId) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const res = await fetch(`/api/bulletin/${broadcastId}`, { method: 'DELETE' });
      if (res.ok) {
        setBroadcasts((prev) => prev.filter((b) => b.id !== broadcastId));
      }
    } catch (err) {
      console.error('Failed to delete broadcast:', err);
    }
  };

  // Submit comment/feedback
  const handleAddComment = async (broadcastId) => {
    const text = (commentInputs[broadcastId] || '').trim();
    if (!text || submittingCommentId) return;

    setSubmittingCommentId(broadcastId);
    try {
      const res = await fetch(`/api/bulletin/${broadcastId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (res.ok) {
        const data = await res.json();
        const newComment = data.comment || data;
        setBroadcasts((prev) =>
          prev.map((b) => {
            if (b.id === broadcastId) {
              return {
                ...b,
                comments: [...(b.comments || []), newComment],
              };
            }
            return b;
          })
        );
        // Clear input and auto-expand replies
        setCommentInputs((prev) => ({ ...prev, [broadcastId]: '' }));
        setExpandedComments((prev) => ({ ...prev, [broadcastId]: true }));
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingCommentId(null);
    }
  };

  // Delete comment
  const handleDeleteComment = async (broadcastId, commentId) => {
    try {
      const res = await fetch(`/api/bulletin/${broadcastId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setBroadcasts((prev) =>
          prev.map((b) => {
            if (b.id === broadcastId) {
              return {
                ...b,
                comments: b.comments.filter((c) => c.id !== commentId),
              };
            }
            return b;
          })
        );
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  // Toggle emoji reaction
  const handleToggleReaction = async (broadcastId, emoji) => {
    // Optimistic UI update
    setBroadcasts((prev) =>
      prev.map((b) => {
        if (b.id === broadcastId) {
          const currentReactions = [...b.reactions];
          const existing = currentReactions.find((r) => r.emoji === emoji);
          if (existing) {
            if (existing.reacted) {
              existing.count -= 1;
              existing.reacted = false;
            } else {
              existing.count += 1;
              existing.reacted = true;
            }
          } else {
            currentReactions.push({ emoji, count: 1, reacted: true });
          }
          return {
            ...b,
            reactions: currentReactions.filter((r) => r.count > 0 || r.reacted),
          };
        }
        return b;
      })
    );

    try {
      await fetch(`/api/bulletin/${broadcastId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      fetchBulletin();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="w-full sm:w-[480px] max-w-full h-[90vh] sm:h-full bg-surface-elevated rounded-t-3xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-border-medium flex flex-col shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-right duration-200 text-white select-text overflow-hidden"
      >
        {/* ── Mobile Grab Handle Bar ── */}
        <div className="flex sm:hidden items-center justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 rounded-full bg-white/25" />
        </div>

        {/* ── Top Header ── */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 pt-1 sm:pt-[calc(env(safe-area-inset-top,0px)+1rem)] border-b border-border-subtle bg-surface-island/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-sm shrink-0">
              <Megaphone size={18} className="sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-white text-base sm:text-base leading-tight truncate">Bulletin</h2>
              <p className="text-[11px] text-content-secondary truncate">Announcements & Community Feedback</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateForm((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl sm:rounded-lg text-xs font-bold transition shadow-sm active:scale-95 ${
                  showCreateForm
                    ? 'bg-surface-island border border-border-medium text-white'
                    : 'bg-brand-500 hover:bg-brand-400 text-black'
                }`}
              >
                {showCreateForm ? (
                  <>
                    <ChevronUp size={14} />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} className="stroke-[2.5]" />
                    <span>Broadcast</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition shrink-0"
              title="Close"
              aria-label="Close Bulletin"
            >
              <X size={20} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>

        {/* ── Admin Post Announcement Form (Collapsible) ── */}
        {isAdmin && showCreateForm && (
          <form
            onSubmit={handleCreateBroadcast}
            className="p-4 border-b border-border-medium bg-surface-island/60 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-150 shrink-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-400 flex items-center gap-1.5">
                <Sparkles size={14} />
                <span>New Announcement</span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary cursor-pointer hover:text-white select-none py-1">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="accent-brand-500 rounded w-4 h-4"
                />
                <Pin size={13} className={isPinned ? 'text-amber-400' : ''} />
                <span>Pin to top</span>
              </label>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title (e.g. Added 10 New Albums)"
              className="w-full bg-surface-elevated border border-border-medium focus:border-brand-500 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-content-subtle outline-none transition"
              required
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write update message, release notes, or music news..."
              rows={3}
              className="w-full bg-surface-elevated border border-border-medium focus:border-brand-500 p-3.5 rounded-xl text-sm text-white placeholder:text-content-subtle outline-none resize-none transition"
              required
            />

            {/* Attached Track Pill */}
            {attachedTrack ? (
              <div className="flex items-center justify-between bg-surface-elevated border border-brand-500/30 p-2.5 rounded-xl text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <img
                    src={attachedTrack.cover_url || '/api/covers/0'}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover bg-surface-island shrink-0"
                  />
                  <div className="truncate">
                    <div className="font-semibold text-white truncate text-xs">{attachedTrack.title}</div>
                    <div className="text-content-secondary text-[11px] truncate">{attachedTrack.artist_name}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedTrack(null)}
                  className="text-content-subtle hover:text-red-400 p-2 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
                  title="Remove song attachment"
                >
                  <X size={15} />
                </button>
              </div>
            ) : currentTrack ? (
              <button
                type="button"
                onClick={() => setAttachedTrack(currentTrack)}
                className="self-start flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border-medium text-xs text-content-secondary hover:text-white transition active:scale-95"
              >
                <Music size={14} className="text-brand-400" />
                <span>Attach Now Playing: {currentTrack.title}</span>
              </button>
            ) : null}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 rounded-xl text-xs text-content-secondary hover:text-white transition active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPosting || !title.trim() || !content.trim()}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow transition active:scale-95"
              >
                {isPosting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>Post Broadcast</span>
              </button>
            </div>
          </form>
        )}

        {/* ── Broadcasts List ── */}
        <div
          ref={listScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden p-3.5 sm:p-4 space-y-4 min-w-0"
        >
          {isLoading && broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-content-secondary gap-2.5">
              <Loader2 size={26} className="animate-spin text-brand-500" />
              <p className="text-xs">Loading bulletin...</p>
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-content-secondary gap-3 px-6">
              <div className="w-14 h-14 rounded-full bg-surface-island border border-border-medium flex items-center justify-center text-content-muted">
                <Megaphone size={24} />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">No announcements yet</h4>
                <p className="text-xs text-content-secondary mt-1">
                  Updates, music news, and server announcements will appear right here.
                </p>
              </div>
            </div>
          ) : (
            broadcasts.map((b) => {
              const isAuthorOrAdmin = user?.id === b.author.id || isAdmin;
              const isThisTrackPlaying = b.track && currentTrack?.id === b.track.id && isPlaying;
              const hasMultipleComments = b.comments && b.comments.length > 2;
              const isExpanded = expandedComments[b.id];
              const visibleComments = hasMultipleComments && !isExpanded ? b.comments.slice(-2) : (b.comments || []);

              return (
                <div
                  key={b.id}
                  className={`bg-surface-island/70 border rounded-2xl p-4 sm:p-4.5 flex flex-col gap-3.5 transition shadow-sm min-w-0 max-w-full overflow-hidden ${
                    b.is_pinned ? 'border-brand-500/40 bg-brand-500/[0.03]' : 'border-border-subtle'
                  }`}
                >
                  {/* Pinned pill */}
                  {b.is_pinned && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-400 uppercase tracking-wider">
                      <Pin size={12} className="text-brand-400" />
                      <span>Pinned Announcement</span>
                    </div>
                  )}

                  {/* Author Header */}
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => {
                        if (b.author?.id) {
                          onSelectUser?.(b.author.id);
                          onClose();
                        }
                      }}
                      className="flex items-center gap-3 min-w-0 cursor-pointer group/author py-0.5"
                      title={`View ${b.author.display_name}'s profile`}
                    >
                      <UserAvatar user={b.author} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs sm:text-sm truncate group-hover/author:text-brand-400 group-hover/author:underline transition">
                            {b.author.display_name}
                          </span>
                          {b.author.role === 'admin' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/15 text-brand-400 font-bold border border-brand-500/30 shrink-0">
                              Admin
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-content-muted">
                          {formatRelativeTime(b.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Delete action for author/admin */}
                    {isAuthorOrAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="text-content-subtle hover:text-red-400 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition active:scale-95"
                        title="Delete announcement"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* Title & Body with robust word wrapping */}
                  <div className="min-w-0 max-w-full overflow-hidden">
                    <h3 className="font-bold text-white text-base sm:text-lg leading-snug break-words [overflow-wrap:anywhere]">
                      {b.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-content-secondary whitespace-pre-wrap leading-relaxed mt-2 break-words [overflow-wrap:anywhere]">
                      {renderFormattedContent(b.content)}
                    </p>
                  </div>

                  {/* Attached Playable Track Card */}
                  {b.track && (
                    <div className="flex items-center justify-between bg-surface-elevated border border-border-medium rounded-xl p-3 transition hover:border-brand-500/40 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={b.track.cover_url || '/api/covers/0'}
                          alt=""
                          className="w-11 h-11 rounded-lg object-cover bg-surface-island shrink-0 border border-border-subtle shadow"
                        />
                        <div className="min-w-0 truncate">
                          <div className="font-semibold text-white text-xs sm:text-sm truncate group-hover:text-brand-400 transition">
                            {b.track.title}
                          </div>
                          <div className="text-[11px] text-content-secondary truncate mt-0.5">
                            {b.track.artist_name} • {b.track.album_title}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (currentTrack?.id === b.track.id) {
                            togglePlay();
                          } else {
                            playTrack(b.track, [b.track], 0);
                          }
                        }}
                        className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shrink-0 shadow transition active:scale-95 ml-2"
                        title={isThisTrackPlaying ? 'Pause' : 'Play song'}
                      >
                        {isThisTrackPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-black" />}
                      </button>
                    </div>
                  )}

                  {/* Touch-Friendly Emoji Reaction Bar */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {REACTION_EMOJIS.map((emoji) => {
                      const reactionObj = b.reactions?.find((r) => r.emoji === emoji);
                      const hasReacted = Boolean(reactionObj?.reacted);
                      const count = reactionObj?.count || 0;

                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleToggleReaction(b.id, emoji)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-full text-xs sm:text-xs transition active:scale-90 border select-none ${
                            hasReacted
                              ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 font-bold'
                              : 'bg-surface-elevated hover:bg-surface-hover border-border-subtle text-content-secondary active:bg-white/10'
                          }`}
                        >
                          <span className="text-sm">{emoji}</span>
                          {count > 0 && <span className="font-mono text-[11px] font-semibold">{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Comments & Feedback Section ── */}
                  <div className="mt-2 pt-3 border-t border-border-subtle/50 flex flex-col gap-2.5">
                    {/* Collapsible comment counter if long */}
                    {hasMultipleComments && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedComments((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                        }
                        className="self-start flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold py-1 active:scale-95 transition"
                      >
                        <MessageCircle size={13} />
                        <span>
                          {isExpanded
                            ? 'Collapse replies'
                            : `View all ${b.comments.length} replies`}
                        </span>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}

                    {/* Comments List */}
                    {visibleComments.length > 0 && (
                      <div className="space-y-2">
                        {visibleComments.map((c) => {
                          if (!c || !c.user) return null;
                          const canDeleteComment = user?.id === c.user.id || isAdmin;
                          return (
                            <div
                              key={c.id}
                              className="flex items-start gap-2.5 bg-surface-elevated/60 p-2.5 rounded-xl text-xs sm:text-xs group"
                            >
                              <UserAvatar user={c.user} size="xs" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div
                                    onClick={() => {
                                      if (c.user?.id) {
                                        onSelectUser?.(c.user.id);
                                        onClose();
                                      }
                                    }}
                                    className="flex items-center gap-1.5 cursor-pointer group/commenter"
                                    title={`View ${c.user.display_name}'s profile`}
                                  >
                                    <span className="font-semibold text-white text-xs group-hover/commenter:text-brand-400 group-hover/commenter:underline transition">
                                      {c.user.display_name}
                                    </span>
                                    <span className="text-[10px] text-content-muted">
                                      {formatRelativeTime(c.created_at)}
                                    </span>
                                  </div>
                                  {canDeleteComment && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComment(b.id, c.id)}
                                      className="text-content-subtle hover:text-red-400 opacity-60 sm:opacity-0 group-hover:opacity-100 transition p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                                      title="Delete reply"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-content-secondary text-xs sm:text-xs mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                                  {renderFormattedContent(c.content)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Write Reply Input (Touch Friendly) */}
                    <div className="flex items-center gap-2 mt-1">
                      <UserAvatar user={user} size="xs" />
                      <input
                        type="text"
                        value={commentInputs[b.id] || ''}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddComment(b.id);
                          }
                        }}
                        placeholder="Write feedback or reply..."
                        className="flex-1 bg-surface-elevated border border-border-medium focus:border-brand-500 px-3.5 py-2 sm:py-1.5 rounded-full text-xs sm:text-xs text-white placeholder:text-content-subtle outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(b.id)}
                        disabled={submittingCommentId === b.id || !commentInputs[b.id]?.trim()}
                        className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-black flex items-center justify-center shrink-0 transition active:scale-95 shadow"
                        title="Send reply"
                      >
                        {submittingCommentId === b.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} className="ml-0.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 sm:py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:pb-2.5 border-t border-border-subtle bg-surface-island/40 text-[11px] text-content-muted flex items-center justify-between shrink-0">
          <span>MattLab Bulletin • Announcements</span>
          <span className="font-mono">{broadcasts.length} {broadcasts.length === 1 ? 'post' : 'posts'}</span>
        </div>
      </div>
    </div>
  );
};
