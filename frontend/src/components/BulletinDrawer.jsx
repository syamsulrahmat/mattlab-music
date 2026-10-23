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
  Check,
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

  const drawerRef = useRef(null);

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
    if (!window.confirm('Delete this announcement?')) return;
    try {
      const res = await fetch(`/api/bulletin/${broadcastId}`, { method: 'DELETE' });
      if (res.ok) {
        setBroadcasts((prev) => prev.filter((b) => b.id !== broadcastId));
      }
    } catch (err) {
      console.error('Failed to delete broadcast:', err);
    }
  };

  // Add comment
  const handleAddComment = async (broadcastId) => {
    const text = commentInputs[broadcastId]?.trim();
    if (!text) return;

    setSubmittingCommentId(broadcastId);
    try {
      const res = await fetch(`/api/bulletin/${broadcastId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (res.ok) {
        const data = await res.json();
        setCommentInputs((prev) => ({ ...prev, [broadcastId]: '' }));
        setBroadcasts((prev) =>
          prev.map((b) => {
            if (b.id === broadcastId) {
              return {
                ...b,
                comments: [...b.comments, data.comment],
              };
            }
            return b;
          })
        );
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
      const res = await fetch(`/api/bulletin/comments/${commentId}`, { method: 'DELETE' });
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
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[460px] h-full bg-surface-elevated border-l border-border-medium flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 text-white select-text"
      >
        {/* ── Top Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-surface-island/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-sm">
              <Megaphone size={16} />
            </div>
            <div>
              <h2 className="font-bold text-white text-base leading-tight">Bulletin</h2>
              <p className="text-[11px] text-content-secondary">Announcements & Community Feedback</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateForm((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                  showCreateForm
                    ? 'bg-surface-island border border-border-medium text-white'
                    : 'bg-brand-500 hover:bg-brand-400 text-black active:scale-95'
                }`}
              >
                {showCreateForm ? (
                  <>
                    <ChevronUp size={13} />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Plus size={13} className="stroke-[2.5]" />
                    <span>Broadcast</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition"
              title="Close (Esc)"
            >
              <X size={18} />
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
                <Sparkles size={13} />
                <span>New Announcement</span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary cursor-pointer hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="accent-brand-500 rounded"
                />
                <Pin size={12} className={isPinned ? 'text-amber-400' : ''} />
                <span>Pin to top</span>
              </label>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title (e.g. Added 10 New Albums & Fixes)"
              className="w-full bg-surface-elevated border border-border-medium focus:border-brand-500 px-3 py-2 rounded-xl text-xs sm:text-sm text-white placeholder:text-content-subtle outline-none transition"
              required
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write update message, release notes, or music news..."
              rows={3}
              className="w-full bg-surface-elevated border border-border-medium focus:border-brand-500 p-3 rounded-xl text-xs text-white placeholder:text-content-subtle outline-none resize-none transition"
              required
            />

            {/* Attached Track Pill (if attached) */}
            {attachedTrack ? (
              <div className="flex items-center justify-between bg-surface-elevated border border-brand-500/30 p-2 rounded-xl text-xs">
                <div className="flex items-center gap-2 truncate">
                  <img
                    src={attachedTrack.cover_url || '/api/covers/0'}
                    alt=""
                    className="w-7 h-7 rounded object-cover bg-surface-island shrink-0"
                  />
                  <div className="truncate">
                    <div className="font-semibold text-white truncate text-[11px]">{attachedTrack.title}</div>
                    <div className="text-content-secondary text-[10px] truncate">{attachedTrack.artist_name}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedTrack(null)}
                  className="text-content-subtle hover:text-red-400 p-1 transition"
                  title="Remove song attachment"
                >
                  <X size={13} />
                </button>
              </div>
            ) : currentTrack ? (
              <button
                type="button"
                onClick={() => setAttachedTrack(currentTrack)}
                className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border-medium text-[11px] text-content-secondary hover:text-white transition"
              >
                <Music size={12} className="text-brand-400" />
                <span>Attach Now Playing: {currentTrack.title}</span>
              </button>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPosting || !title.trim() || !content.trim()}
                className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-black font-bold text-xs px-4 py-1.5 rounded-lg shadow transition active:scale-95"
              >
                {isPosting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                <span>Post Broadcast</span>
              </button>
            </div>
          </form>
        )}

        {/* ── Broadcasts List ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-content-secondary gap-2">
              <Loader2 size={24} className="animate-spin text-brand-500" />
              <p className="text-xs">Loading bulletin...</p>
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-content-secondary gap-3 px-6">
              <div className="w-12 h-12 rounded-full bg-surface-island border border-border-medium flex items-center justify-center text-content-muted">
                <Megaphone size={22} />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">No announcements yet</h4>
                <p className="text-xs text-content-secondary mt-1">
                  Updates, music news, and server announcements from Matt will appear right here.
                </p>
              </div>
            </div>
          ) : (
            broadcasts.map((b) => {
              const isAuthorOrAdmin = user?.id === b.author.id || isAdmin;
              const isThisTrackPlaying = b.track && currentTrack?.id === b.track.id && isPlaying;

              return (
                <div
                  key={b.id}
                  className={`bg-surface-island/70 border rounded-2xl p-4 flex flex-col gap-3 transition shadow-sm ${
                    b.is_pinned ? 'border-brand-500/40 bg-brand-500/[0.03]' : 'border-border-subtle'
                  }`}
                >
                  {/* Pinned pill */}
                  {b.is_pinned && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
                      <Pin size={11} className="text-brand-400" />
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
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer group/author"
                      title={`View ${b.author.display_name}'s profile`}
                    >
                      <UserAvatar user={b.author} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs truncate group-hover/author:text-brand-400 group-hover/author:underline transition">
                            {b.author.display_name}
                          </span>
                          {b.author.role === 'admin' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/15 text-brand-400 font-bold border border-brand-500/30">
                              Admin
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-content-muted">
                          {formatRelativeTime(b.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Delete action for author/admin */}
                    {isAuthorOrAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="text-content-subtle hover:text-red-400 p-1 rounded transition opacity-60 hover:opacity-100"
                        title="Delete announcement"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Title & Body */}
                  <div>
                    <h3 className="font-bold text-white text-sm sm:text-base leading-snug">
                      {b.title}
                    </h3>
                    <p className="text-xs text-content-secondary whitespace-pre-wrap leading-relaxed mt-1.5">
                      {b.content}
                    </p>
                  </div>

                  {/* Attached Playable Track Card */}
                  {b.track && (
                    <div className="flex items-center justify-between bg-surface-elevated border border-border-medium rounded-xl p-2.5 transition hover:border-brand-500/40 group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={b.track.cover_url || '/api/covers/0'}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-surface-island shrink-0 border border-border-subtle shadow"
                        />
                        <div className="min-w-0 truncate">
                          <div className="font-semibold text-white text-xs truncate group-hover:text-brand-400 transition">
                            {b.track.title}
                          </div>
                          <div className="text-[11px] text-content-secondary truncate">
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
                        className="w-8 h-8 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shrink-0 shadow transition active:scale-95 ml-2"
                        title={isThisTrackPlaying ? 'Pause' : 'Play song'}
                      >
                        {isThisTrackPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                      </button>
                    </div>
                  )}

                  {/* Emoji Reaction Bar */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    {REACTION_EMOJIS.map((emoji) => {
                      const reactionObj = b.reactions?.find((r) => r.emoji === emoji);
                      const hasReacted = Boolean(reactionObj?.reacted);
                      const count = reactionObj?.count || 0;

                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleToggleReaction(b.id, emoji)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition active:scale-90 border select-none ${
                            hasReacted
                              ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 font-bold'
                              : 'bg-surface-elevated/70 hover:bg-surface-hover border-border-subtle text-content-secondary'
                          }`}
                        >
                          <span>{emoji}</span>
                          {count > 0 && <span className="text-[10px] font-mono">{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Comments & Feedback Section ── */}
                  <div className="mt-2 pt-3 border-t border-border-subtle/50 flex flex-col gap-2.5">
                    {/* Existing Comments */}
                    {b.comments && b.comments.length > 0 && (
                      <div className="space-y-2">
                        {b.comments.map((c) => {
                          const canDeleteComment = user?.id === c.user.id || isAdmin;
                          return (
                            <div
                              key={c.id}
                              className="flex items-start gap-2 bg-surface-elevated/50 p-2 rounded-xl text-xs group"
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
                                    <span className="font-semibold text-white text-[11px] group-hover/commenter:text-brand-400 group-hover/commenter:underline transition">
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
                                      className="text-content-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-0.5"
                                      title="Delete reply"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-content-secondary text-xs mt-0.5 whitespace-pre-wrap">
                                  {c.content}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Write Reply Input */}
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
                        className="flex-1 bg-surface-elevated border border-border-medium focus:border-brand-500 px-3 py-1.5 rounded-full text-xs text-white placeholder:text-content-subtle outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(b.id)}
                        disabled={submittingCommentId === b.id || !commentInputs[b.id]?.trim()}
                        className="w-7 h-7 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-black flex items-center justify-center shrink-0 transition active:scale-95 shadow"
                        title="Send reply (Enter)"
                      >
                        {submittingCommentId === b.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Send size={12} className="ml-0.5" />
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
        <div className="px-5 py-2.5 border-t border-border-subtle bg-surface-island/40 text-[11px] text-content-muted flex items-center justify-between shrink-0">
          <span>MattLab Bulletin • Announcements & Feedback</span>
          <span className="font-mono">{broadcasts.length} {broadcasts.length === 1 ? 'post' : 'posts'}</span>
        </div>
      </div>
    </div>
  );
};
