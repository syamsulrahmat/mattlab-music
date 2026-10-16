import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bug, 
  Lightbulb, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  Loader2, 
  Sparkles, 
  Send, 
  AlertCircle, 
  Clock, 
  User, 
  Layers,
  Check,
  ChevronDown,
  Monitor
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

const CATEGORIES = [
  { id: 'general', label: 'General / Other' },
  { id: 'playback', label: 'Playback & Audio' },
  { id: 'ui', label: 'UI & Visual Glitch' },
  { id: 'lyrics', label: 'Lyrics & Karaoke' },
  { id: 'playlists', label: 'Playlists & Library' },
  { id: 'spotify', label: 'Spotify Sync' },
];

const PRIORITIES = [
  { id: 'low', label: 'Low', color: 'text-content-secondary bg-white/5' },
  { id: 'medium', label: 'Medium', color: 'text-amber-400 bg-amber-400/10' },
  { id: 'high', label: 'High', color: 'text-orange-400 bg-orange-400/10' },
  { id: 'critical', label: 'Critical', color: 'text-red-400 bg-red-400/10' },
];

export const BugReportModal = ({
  isOpen,
  onClose,
  showToast,
  activeRoute = 'home',
  hasResolvedIssues = false,
  onMarkSeen,
  onIssuesChanged,
}) => {
  const { user, isAdmin } = useAuth();
  const { currentTrack, isPlaying } = usePlayer();

  const [modalTab, setModalTab] = useState('new'); // 'new' | 'list'
  
  // Form fields
  const [reportType, setReportType] = useState('bug'); // 'bug' | 'feature' | 'note'
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // List fields
  const [reports, setReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Reset or fetch on open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (hasResolvedIssues) {
        setModalTab('list');
      }
    }
  }, [isOpen, hasResolvedIssues]);

  useEffect(() => {
    if (isOpen && modalTab === 'list') {
      fetchReports();
    }
  }, [isOpen, modalTab, statusFilter]);

  // Handle ESC key
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

  const fetchReports = async () => {
    setIsLoadingReports(true);
    try {
      const url = `/api/bug-reports${statusFilter !== 'all' ? `?status_filter=${statusFilter}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a brief title or summary');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please write a brief description or note');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const clientContext = includeContext ? {
      route: activeRoute,
      track: currentTrack ? `${currentTrack.title} — ${currentTrack.artist_name} (ID: ${currentTrack.id})` : null,
      isPlaying,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      isMobile: /Mobi|Android|iPhone/i.test(navigator.userAgent),
      timestamp: new Date().toISOString(),
    } : null;

    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: reportType,
          title: title.trim(),
          category,
          priority,
          description: description.trim(),
          client_context: clientContext,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        if (showToast) {
          showToast(`✨ ${reportType === 'feature' ? 'Idea' : 'Issue'} logged & saved!`);
        }
        // Reset form
        setTitle('');
        setDescription('');
        setReportType('bug');
        setCategory('general');
        setPriority('medium');
        // Switch to list tab so user immediately sees their saved note
        setModalTab('list');
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.detail || 'Failed to submit report');
      }
    } catch (err) {
      console.error('Error submitting bug report:', err);
      setErrorMsg('Network error submitting report');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (report) => {
    const nextStatus = report.status === 'resolved' ? 'open' : 'resolved';
    try {
      const res = await fetch(`/api/bug-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
        );
        if (showToast) {
          showToast(nextStatus === 'resolved' ? '✅ Marked as resolved' : '🔄 Reopened issue');
        }
        onIssuesChanged?.();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDeleteReport = async (reportId) => {
    try {
      const res = await fetch(`/api/bug-reports/${reportId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        if (showToast) {
          showToast(isAdmin ? '🗑️ Issue permanently deleted' : '🗑️ Issue removed from your log');
        }
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-surface-panel border border-border-medium rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between shrink-0 bg-surface-island/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Bug size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-content-primary">
                Report an Issue / Note
              </h2>
              <p className="text-[11px] text-content-secondary">
                Log bugs or feature ideas directly without leaving the app
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-content-secondary hover:text-content-primary hover:bg-white/5 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 pb-1 border-b border-border-subtle flex items-center gap-2 bg-surface-panel shrink-0">
          <button
            onClick={() => setModalTab('new')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              modalTab === 'new'
                ? 'bg-brand-500 text-black shadow-sm font-bold'
                : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            }`}
          >
            New Report / Note
          </button>
          <button
            onClick={() => setModalTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              modalTab === 'list'
                ? 'bg-brand-500 text-black shadow-sm font-bold'
                : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            }`}
          >
            <span>Issue Log & Notes</span>
            {hasResolvedIssues && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-surface-panel" />
            )}
            {reports.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                modalTab === 'list' ? 'bg-black/20 text-black' : 'bg-white/10 text-content-secondary'
              }`}>
                {reports.length}
              </span>
            )}
          </button>
        </div>

        {/* Body Stage */}
        <div className="flex-1 overflow-y-auto p-5">
          {modalTab === 'new' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Type Switcher */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportType('bug')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      reportType === 'bug'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold'
                        : 'border-border-subtle bg-surface-island text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <Bug size={14} />
                    <span>Bug / Glitch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType('feature')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      reportType === 'feature'
                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-400 font-bold'
                        : 'border-border-subtle bg-surface-island text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <Lightbulb size={14} />
                    <span>Feature / Idea</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                  Title / Summary
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={reportType === 'bug' ? 'e.g. Volume slider resets when scrubbing track' : 'e.g. Add sleep timer to player bar'}
                  maxLength={120}
                  className="w-full bg-surface-island border border-border-medium focus:border-brand-500 rounded-xl px-3.5 py-2 text-xs text-content-primary outline-none transition"
                />
              </div>

              {/* Category & Priority Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-surface-island border border-border-medium focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-content-primary outline-none transition cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id} className="bg-surface-panel text-content-primary">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-surface-island border border-border-medium focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-content-primary outline-none transition cursor-pointer"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id} className="bg-surface-panel text-content-primary">
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                  Description & Details
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? Steps to reproduce, observations, or self-notes..."
                  rows={4}
                  maxLength={1000}
                  className="w-full bg-surface-island border border-border-medium focus:border-brand-500 rounded-xl p-3 text-xs text-content-primary outline-none transition resize-none"
                />
              </div>

              {/* Attach Diagnostics */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-island border border-border-subtle cursor-pointer hover:border-border-medium transition">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="mt-0.5 rounded accent-brand-500 cursor-pointer"
                />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-content-primary block">
                    Attach environment context
                  </span>
                  <span className="text-content-secondary text-[10px]">
                    Includes active page ({activeRoute}), current playing track, and browser OS to speed up diagnosis.
                  </span>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !description.trim()}
                  className="px-5 py-2 rounded-full text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Save & Notify</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Logged Issues & Notes List */
            <div className="space-y-3">
              {/* Filter pills */}
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-1.5">
                  {['all', 'open', 'resolved'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition ${
                        statusFilter === st
                          ? 'bg-white/15 text-white'
                          : 'text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {hasResolvedIssues && (
                    <button
                      type="button"
                      onClick={() => {
                        onMarkSeen?.();
                        if (showToast) {
                          showToast('✨ All notifications marked as read');
                        }
                      }}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1 cursor-pointer"
                      title="Mark all notifications as read"
                    >
                      <Check size={12} className="stroke-[2.5]" />
                      <span>Mark as read</span>
                    </button>
                  )}
                  <button
                    onClick={fetchReports}
                    disabled={isLoadingReports}
                    className="text-[11px] text-content-secondary hover:text-brand-500 transition cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {hasResolvedIssues && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                    <span className="leading-snug">
                      Your reported issue has been marked as <strong>Resolved</strong>!
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      onMarkSeen?.();
                      if (showToast) {
                        showToast('✨ Notifications marked as read');
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[11px] transition shrink-0 cursor-pointer shadow active:scale-95"
                  >
                    Mark as Read
                  </button>
                </div>
              )}

              {isLoadingReports ? (
                <div className="py-12 flex flex-col items-center justify-center text-content-secondary gap-2">
                  <Loader2 size={18} className="animate-spin text-brand-500" />
                  <span className="text-xs">Loading issue log...</span>
                </div>
              ) : reports.length === 0 ? (
                <div className="py-12 text-center text-content-secondary">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-content-subtle" />
                  <p className="text-xs font-semibold text-content-primary">No issues logged yet</p>
                  <p className="text-[11px] text-content-subtle mt-0.5">
                    Click "New Report / Note" to write down a bug or idea.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {reports.map((report) => {
                    const isResolved = report.status === 'resolved';
                    return (
                      <div
                        key={report.id}
                        className={`p-3.5 rounded-xl border transition ${
                          isResolved
                            ? 'bg-surface-island/40 border-border-subtle opacity-75'
                            : 'bg-surface-island border-border-subtle hover:border-border-medium'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            {isAdmin ? (
                              <button
                                onClick={() => handleToggleStatus(report)}
                                className={`mt-0.5 shrink-0 transition ${
                                  isResolved ? 'text-emerald-400 hover:text-emerald-300' : 'text-content-subtle hover:text-brand-500'
                                } cursor-pointer`}
                                title={isResolved ? 'Mark as Open' : 'Mark as Resolved'}
                              >
                                {isResolved ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                              </button>
                            ) : (
                              <div
                                className={`mt-0.5 shrink-0 ${
                                  isResolved ? 'text-emerald-400' : 'text-content-subtle'
                                }`}
                                title={isResolved ? 'Status: Resolved' : 'Status: Open'}
                              >
                                {isResolved ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold ${isResolved ? 'line-through text-content-secondary' : 'text-content-primary'}`}>
                                  {report.title}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  report.type === 'feature'
                                    ? 'bg-brand-500/10 text-brand-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}>
                                  {report.type === 'feature' ? 'Idea' : 'Bug'}
                                </span>
                                {isResolved && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                    Resolved
                                  </span>
                                )}
                                {isAdmin && Boolean(report.user_deleted) && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-content-subtle" title="User cleared this from their personal log">
                                    Archived by user
                                  </span>
                                )}
                              </div>

                              <p className="text-[11px] text-content-secondary mt-1 whitespace-pre-wrap leading-relaxed">
                                {report.description}
                              </p>

                              {/* Footer details */}
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-content-subtle flex-wrap">
                                <span>{new Date(report.created_at).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className="capitalize">{report.category}</span>
                                {isAdmin && report.username && (
                                  <>
                                    <span>•</span>
                                    <span>@{report.username}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {(isAdmin || (user && report.user_id === user.id)) && (
                            <button
                              onClick={() => handleDeleteReport(report.id)}
                              className="p-1 text-content-subtle hover:text-red-400 hover:bg-white/5 rounded transition shrink-0 cursor-pointer"
                              title="Delete this issue"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
