import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Keyboard, 
  Info, 
  Search, 
  Music, 
  Volume2, 
  Compass, 
  Sliders, 
  Layers, 
  Check, 
  Sparkles, 
  HardDrive,
  Users,
  Shield,
  Disc3,
  Mic2,
  Tv,
  Zap,
  Gauge,
  Trash2,
  User,
  Key,
  Camera,
  Upload,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  PictureInPicture2,
  Play,
  Pause,
  RefreshCw,
  FileText,
  Bug,
  CheckCircle2,
  Circle,
  Plus,
  FlaskConical,
  AlertTriangle,
  RotateCcw,
  Lock,
  Download,
  DownloadCloud,
  Monitor,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useDevFlags } from '../context/FlagsContext';
import { DevRepairStudio } from './DevRepairStudio';

const SHORTCUT_CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'playback', label: 'Playback & Audio' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'playlists', label: 'Playlists & Selection' },
  { id: 'interface', label: 'Interface & Views' },
  { id: 'lyrics', label: 'Lyrics Studio Editor' },
];

const SHORTCUTS_DATA = [
  {
    category: 'playback',
    categoryLabel: 'Playback & Audio',
    items: [
      {
        title: 'Play / Pause',
        description: 'Toggles audio playback for the active track',
        combos: [['Space']],
      },
      {
        title: 'Mute / Unmute',
        description: 'Instantly toggle master audio volume without changing level',
        combos: [['M']],
      },
      {
        title: 'Seek Backward 5s',
        description: 'Rewinds playback position by 5 seconds',
        combos: [['←']],
      },
      {
        title: 'Seek Forward 5s',
        description: 'Fast-forwards playback position by 5 seconds',
        combos: [['→']],
      },
      {
        title: 'Seek Backward 10s',
        description: 'Rewinds playback position by 10 seconds',
        combos: [['Shift', '←']],
      },
      {
        title: 'Seek Forward 10s',
        description: 'Fast-forwards playback position by 10 seconds',
        combos: [['Shift', '→']],
      },
      {
        title: 'Volume Up (+5%)',
        description: 'Increases playback volume in 5% increments',
        combos: [['Ctrl', '↑'], ['⌘', '↑']],
      },
      {
        title: 'Volume Down (-5%)',
        description: 'Decreases playback volume in 5% increments',
        combos: [['Ctrl', '↓'], ['⌘', '↓']],
      },
      {
        title: 'Next Track',
        description: 'Skips to the next song in the active queue',
        combos: [['Shift', 'N'], ['Ctrl', '→']],
      },
      {
        title: 'Previous Track',
        description: 'Restarts the current song or skips to the previous track',
        combos: [['Shift', 'P'], ['Ctrl', '←']],
      },
      {
        title: 'Toggle Karaoke Mode',
        description: 'Toggles Demucs AI instrumental stem for active song',
        combos: [['Ctrl', 'Shift', 'L'], ['⌘', 'Shift', 'L'], ['K']],
      },
    ],
  },
  {
    category: 'navigation',
    categoryLabel: 'Navigation',
    items: [
      {
        title: 'Music Search (Library & Catalog)',
        description: 'Focus top bar search input to search tracks, albums, and artists in catalog',
        combos: [['S'], ['Ctrl', 'Shift', 'K'], ['⌘', 'Shift', 'K']],
      },
      {
        title: 'Command Palette (Global Switcher)',
        description: 'Open quick switcher for user profiles, navigation, audio tools, and system commands',
        combos: [['Ctrl', 'K'], ['⌘', 'K']],
      },
      {
        title: 'Navigate Home',
        description: 'Navigate to Home library dashboard (clears detail view)',
        combos: [['Home'], ['Ctrl', 'Home'], ['⌘', 'Home'], ['H']],
      },
      {
        title: 'Open Settings Menu',
        description: 'Opens preferences, account, audio quality, and system settings',
        combos: [['Ctrl', ','], ['⌘', ',']],
      },
      {
        title: 'Shortcuts Cheat Sheet',
        description: 'Opens this keyboard shortcut reference cheat-sheet',
        combos: [['?'], ['/']],
      },
      {
        title: 'History Back',
        description: 'Navigates back to the previously viewed screen',
        combos: [['Alt', '←'], ['Mouse 3']],
      },
      {
        title: 'History Forward',
        description: 'Navigates forward in page history',
        combos: [['Alt', '→'], ['Mouse 4']],
      },
      {
        title: 'Close Modal / Dialog',
        description: 'Dismisses the open dialog, search palette, or context menu',
        combos: [['Esc']],
      },
    ],
  },
  {
    category: 'playlists',
    categoryLabel: 'Playlists & Selection',
    items: [
      {
        title: 'Play Selected Track',
        description: 'Immediately begins playing the currently highlighted track',
        combos: [['Enter']],
      },
      {
        title: 'Select Next / Previous Track',
        description: 'Moves track focus up or down with smooth auto-scroll into view',
        combos: [['↑'], ['↓']],
      },
      {
        title: 'Expand Multi-Selection Range',
        description: 'Selects contiguous blocks of songs with the arrow keys',
        combos: [['Shift', '↑'], ['Shift', '↓']],
      },
      {
        title: 'Contiguous Click Range',
        description: 'Selects all songs between your active row and clicked row',
        combos: [['Shift', 'Click']],
      },
      {
        title: 'Toggle Individual Track Selection',
        description: 'Adds or removes individual tracks from your multi-selection',
        combos: [['Ctrl', 'Click'], ['⌘', 'Click']],
      },
      {
        title: 'Reorder Track Block Up',
        description: 'Moves selected songs up in playlist order (After Effects block movement)',
        combos: [['Alt', '↑']],
      },
      {
        title: 'Reorder Track Block Down',
        description: 'Moves selected songs down in playlist order preserving contiguous placement',
        combos: [['Alt', '↓']],
      },
      {
        title: 'Clear Selection',
        description: 'Deselects all currently highlighted tracks',
        combos: [['Esc']],
      },
      {
        title: 'Track Context Menu',
        description: 'Opens quick menu to add to playlist, play next, or view artist/album',
        combos: [['Right-Click']],
      },
      {
        title: 'Playlist Navbar Menu',
        description: 'Right-click playlists in the left navbar to play, add to queue, sync Spotify, rename, or delete',
        combos: [['Right-Click']],
      },
    ],
  },
  {
    category: 'interface',
    categoryLabel: 'Interface & Views',
    items: [
      {
        title: 'Picture-in-Picture Mini-Player',
        description: 'Float an always-on-top resizable mini player anywhere on screen',
        combos: [['Ctrl', 'P'], ['⌘', 'P'], ['P'], ['Click Mini-Player Icon']],
      },
      {
        title: 'Synced Lyrics Immersion',
        description: 'Full-screen karaoke synchronized lyric line tracker with glowing glow',
        combos: [['Ctrl', 'L'], ['⌘', 'L'], ['L'], ['Click Lyrics Mic Icon']],
      },
      {
        title: 'Queue Island Panel',
        description: 'Toggle the right-side play queue context drawer on and off',
        combos: [['Click Queue Icon']],
      },
      {
        title: 'Bulletin & Announcements',
        description: 'Opens or closes the Bulletin drawer for announcements and feedback',
        combos: [['Alt', 'B'], ['Click Megaphone Icon']],
      },
      {
        title: 'Component Inspector (Dev Mode)',
        description: 'Toggles visual component architecture overlay and file paths',
        combos: [['Alt', 'C']],
      },
      {
        title: 'Experimental Flags (Dev Mode)',
        description: 'Opens developer feature flags dashboard',
        combos: [['Ctrl', 'Shift', 'D'], ['⌘', 'Shift', 'D']],
      },
    ],
  },
  {
    category: 'lyrics',
    categoryLabel: 'Lyrics Studio Editor',
    items: [
      {
        title: 'Stamp Current Time',
        description: 'Records active playback timestamp to highlighted line and advances focus down',
        combos: [['Alt', 'S'], ['F8']],
      },
      {
        title: 'Tap-to-Sync Stamping',
        description: 'When Tap-to-Sync is active, tap Spacebar when the next lyric line starts singing',
        combos: [['Space']],
      },
      {
        title: 'Insert Line Below',
        description: 'Inserts a new lyric line directly below the active line',
        combos: [['Enter']],
      },
      {
        title: 'Undo Lyrics Edit',
        description: 'Reverts the last timestamp nudge, offset, or lyric text change in Studio mode',
        combos: [['Ctrl', 'Z'], ['⌘', 'Z']],
      },
      {
        title: 'Preview Line Audio',
        description: 'Seeks audio directly to line timestamp to verify synchronization',
        combos: [['Click ▶ on line']],
      },
    ],
  },
];

export const SettingsModal = ({
  isOpen,
  initialTab = 'account',
  onClose,
  stats,
  onOpenUserManagement,
  onOpenBugReport,
  hasResolvedIssues = false,
  onMarkSeen,
  onIssuesChanged,
  showToast,
}) => {
  const { 
    user, 
    isAdmin, 
    updateProfile, 
    changeOwnPassword, 
    uploadAvatar, 
    removeAvatar,
    updatePreferences
  } = useAuth();
  const { 
    preloadCount, 
    setPreloadCount, 
    preloadedTrackIds, 
    clearPreloadCache,
    audioQuality,
    setAudioQuality,
    pipEngine,
    setPipEngine,
    togglePiP,
    isPiPActive,
    miniPlayerOpacity,
    setMiniPlayerOpacity,
    miniPlayerIdleDim,
    setMiniPlayerIdleDim,
    autoplaySimilar,
    setAutoplaySimilar,
  } = usePlayer();
  const [clearingCache, setClearingCache] = useState(false);
  const { 
    isDevUnlocked, 
    unlockDevMode, 
    lockDevMode, 
    flags, 
    setFlag, 
    resetAllFlags, 
    flagSpecs 
  } = useDevFlags();
  const [flagsFilter, setFlagsFilter] = useState('');
  const versionClickCountRef = useRef(0);
  const versionClickTimerRef = useRef(null);

  const handleVersionClick = () => {
    if (isDevUnlocked) {
      setActiveTab('experiments');
      return;
    }

    if (versionClickTimerRef.current) clearTimeout(versionClickTimerRef.current);
    versionClickCountRef.current += 1;

    if (versionClickCountRef.current >= 5) {
      versionClickCountRef.current = 0;
      unlockDevMode();
      setActiveTab('experiments');
      showToast?.('🎉 Developer Mode & Experimental Flags Unlocked!', 4000);
      return;
    }

    versionClickTimerRef.current = setTimeout(() => {
      versionClickCountRef.current = 0;
    }, 3000);
  };

  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);
  const [transcodeCacheStats, setTranscodeCacheStats] = useState({ file_count: 0, size_mb: 0 });
  const [clearingTranscodeCache, setClearingTranscodeCache] = useState(false);
  const [transcodeClearedSuccess, setTranscodeClearedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'account');
  const [audioSubpage, setAudioSubpage] = useState(null); // null | 'quality' | 'preload' | 'miniplayer'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Spotify Canvas sp_dc state
  const [spotifySpDc, setSpotifySpDc] = useState(user?.preferences?.spotify_sp_dc || '');
  const [showSpDc, setShowSpDc] = useState(false);
  const [isSavingSpDc, setIsSavingSpDc] = useState(false);
  const [spDcSavedSuccess, setSpDcSavedSuccess] = useState(false);

  useEffect(() => {
    if (user?.preferences?.spotify_sp_dc !== undefined) {
      setSpotifySpDc(user.preferences.spotify_sp_dc);
    }
  }, [user?.preferences?.spotify_sp_dc]);

  const handleSaveSpotifySpDc = async (e) => {
    e?.preventDefault();
    if (!updatePreferences) return;
    try {
      setIsSavingSpDc(true);
      await updatePreferences({ spotify_sp_dc: spotifySpDc.trim() });
      setSpDcSavedSuccess(true);
      if (showToast) showToast('Spotify Canvas cookie saved!');
      setTimeout(() => setSpDcSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save Spotify sp_dc:', err);
    } finally {
      setIsSavingSpDc(false);
    }
  };

  // Issues & Notes state
  const [issues, setIssues] = useState([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issuesFilter, setIssuesFilter] = useState('all');

  const fetchIssues = async () => {
    setIsLoadingIssues(true);
    try {
      const url = `/api/bug-reports${issuesFilter !== 'all' ? `?status_filter=${issuesFilter}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setIsLoadingIssues(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'issues') {
      fetchIssues();
    }
  }, [isOpen, activeTab, issuesFilter]);

  const handleToggleIssueStatus = async (issue) => {
    const nextStatus = issue.status === 'resolved' ? 'open' : 'resolved';
    try {
      const res = await fetch(`/api/bug-reports/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setIssues((prev) =>
          prev.map((i) => (i.id === issue.id ? { ...i, status: nextStatus } : i))
        );
        showToast?.(nextStatus === 'resolved' ? '✅ Marked as resolved' : '🔄 Reopened issue');
        onIssuesChanged?.();
      }
    } catch (err) {
      console.error('Failed to update issue status:', err);
      showToast?.('⚠️ Failed to update issue status');
    }
  };

  const handleDeleteIssue = async (issueId) => {
    try {
      const res = await fetch(`/api/bug-reports/${issueId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setIssues((prev) => prev.filter((i) => i.id !== issueId));
        showToast?.(isAdmin ? '🗑️ Issue permanently deleted' : '🗑️ Issue removed from your log');
        onIssuesChanged?.();
      }
    } catch (err) {
      console.error('Failed to delete issue:', err);
      showToast?.('⚠️ Failed to delete issue');
    }
  };

  // Profile fields state
  const [usernameVal, setUsernameVal] = useState(user?.username || '');
  const [displayNameVal, setDisplayNameVal] = useState(user?.display_name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Avatar state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const fileInputRef = useRef(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Sync active tab when modal opens or initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'account');
    }
  }, [isOpen, initialTab]);

  // Sync profile values when user or modal opens
  useEffect(() => {
    if (user) {
      setUsernameVal(user.username || '');
      setDisplayNameVal(user.display_name || '');
    }
  }, [user, isOpen]);

  const handleSaveProfile = async (e) => {
    e?.preventDefault?.();
    setProfileError('');
    setProfileSuccess('');

    if (!usernameVal.trim()) {
      setProfileError('Username cannot be empty');
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfile({
        username: usernameVal.trim(),
        display_name: displayNameVal.trim() || null,
      });
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setAvatarError('');
    setAvatarSuccess('');

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (JPG, PNG, or WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Image file is too large (maximum 10MB)');
      return;
    }

    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
      setAvatarSuccess('Avatar photo updated successfully!');
      setTimeout(() => setAvatarSuccess(''), 3000);
    } catch (err) {
      setAvatarError(err.message || 'Failed to upload photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setAvatarSuccess('');
    setAvatarRemoving(true);
    try {
      await removeAvatar();
      setAvatarSuccess('Avatar photo removed');
      setTimeout(() => setAvatarSuccess(''), 3000);
    } catch (err) {
      setAvatarError(err.message || 'Failed to remove avatar');
    } finally {
      setAvatarRemoving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e?.preventDefault?.();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordUpdating(true);
    try {
      await changeOwnPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3500);
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleClearCache = async () => {
    try {
      setClearingCache(true);
      await clearPreloadCache();
      setCacheClearedSuccess(true);
      setTimeout(() => setCacheClearedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to clear preload cache:', err);
    } finally {
      setClearingCache(false);
    }
  };

  const fetchTranscodeStats = async () => {
    try {
      const res = await fetch('/api/stream/cache/stats');
      if (res.ok) {
        const data = await res.json();
        setTranscodeCacheStats(data);
      }
    } catch (_) {}
  };

  const handleClearTranscodeCache = async () => {
    try {
      setClearingTranscodeCache(true);
      const res = await fetch('/api/stream/cache/clear', { method: 'POST' });
      if (res.ok) {
        setTranscodeClearedSuccess(true);
        fetchTranscodeStats();
        setTimeout(() => setTranscodeClearedSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to clear transcode cache:', err);
    } finally {
      setClearingTranscodeCache(false);
    }
  };

  // Automatic Lyrics Search Crawler State & Handlers
  const [lyricsStatus, setLyricsStatus] = useState(null);
  const [lyricsActionLoading, setLyricsActionLoading] = useState(false);
  const [lyricsMessage, setLyricsMessage] = useState('');

  const fetchLyricsStatus = async () => {
    try {
      const res = await fetch('/api/lyrics/status');
      if (res.ok) {
        const data = await res.json();
        setLyricsStatus(data);
      }
    } catch (err) {
      console.debug('Failed to fetch lyrics status:', err);
    }
  };

  const handleLyricsControl = async (action) => {
    try {
      setLyricsActionLoading(true);
      setLyricsMessage('');
      const res = await fetch('/api/lyrics/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setLyricsMessage(data.message || 'Action executed successfully');
        await fetchLyricsStatus();
        setTimeout(() => setLyricsMessage(''), 3500);
      } else {
        const errData = await res.json();
        setLyricsMessage(errData.detail || 'Action failed');
      }
    } catch (err) {
      setLyricsMessage(err.message || 'Failed to trigger lyrics control');
    } finally {
      setLyricsActionLoading(false);
    }
  };

  // Poll lyrics crawler status when playback settings tab is open
  useEffect(() => {
    if (!isOpen || activeTab !== 'playback') return;
    fetchLyricsStatus();
    fetchTranscodeStats();
    const interval = setInterval(fetchLyricsStatus, 3000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  // Global ESC shortcut listener
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

  // Filter shortcuts
  const filteredShortcuts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return SHORTCUTS_DATA.map((cat) => {
      if (selectedCategory !== 'all' && cat.category !== selectedCategory) {
        return null;
      }

      const matchingItems = cat.items.filter((item) => {
        if (!q) return true;
        const inTitle = item.title.toLowerCase().includes(q);
        const inDesc = item.description.toLowerCase().includes(q);
        const inKeys = item.combos.some((combo) =>
          combo.some((key) => key.toLowerCase().includes(q))
        );
        const inCategory = cat.categoryLabel.toLowerCase().includes(q);
        return inTitle || inDesc || inKeys || inCategory;
      });

      if (matchingItems.length === 0) return null;
      return {
        ...cat,
        items: matchingItems,
      };
    }).filter(Boolean);
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        data-dev-component="SettingsModal"
        data-dev-file="src/components/SettingsModal.jsx"
        data-dev-desc="System settings, audio pipeline configuration, keyboard shortcuts table, and experimental flags dashboard"
        className="w-full max-w-4xl bg-surface-island border border-border-medium rounded-2xl shadow-2xl flex flex-col h-[85vh] max-h-[760px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-border-medium bg-surface-panel/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center">
              <Sliders size={18} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Settings
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-content-primary flex items-center justify-center transition"
            title="Close Settings (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left Tab Rail + Right Content Stage */}
        <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
          {/* Navigation Sidebar / Tabs */}
          <div className="w-full md:w-56 bg-surface-panel border-b md:border-b-0 md:border-r border-border-medium p-2.5 md:p-3 grid grid-cols-2 sm:grid-cols-4 md:flex md:flex-col gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                activeTab === 'account'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <User size={16} className="shrink-0" />
              <span className="truncate">Profile & Account</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`hidden md:flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                activeTab === 'shortcuts'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Keyboard size={16} className="shrink-0" />
              <span className="truncate">Keyboard Shortcuts</span>
            </button>

            <button
              onClick={() => setActiveTab('playback')}
              className={`flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                activeTab === 'playback'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Volume2 size={16} className="shrink-0" />
              <span className="truncate">Audio & Playback</span>
            </button>

            <button
              onClick={() => setActiveTab('issues')}
              className={`flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                activeTab === 'issues'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <div className="relative shrink-0">
                <Bug size={16} />
                {hasResolvedIssues && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-surface-panel" />
                )}
              </div>
              <span className="flex-1 truncate">Issues & Notes</span>
              {hasResolvedIssues && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  Update
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                activeTab === 'about'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Info size={16} className="shrink-0" />
              <span className="truncate">About & System</span>
            </button>

            {isDevUnlocked && (
              <button
                onClick={() => setActiveTab('experiments')}
                className={`flex items-center gap-2.5 md:gap-3 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                  activeTab === 'experiments'
                    ? 'bg-amber-500 text-black shadow-md font-bold'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <FlaskConical size={16} className="shrink-0" />
                <span className="truncate">Experiments</span>
              </button>
            )}

            {isAdmin && (
              <div className="hidden md:block mt-auto pt-3 border-t border-border-medium">
                <button
                  onClick={() => {
                    onClose();
                    onOpenUserManagement?.();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-white/5 transition w-full text-left"
                >
                  <Users size={14} className="text-brand-500" />
                  <span>User Management</span>
                </button>
              </div>
            )}
          </div>

          {/* Tab Content Stage */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-surface-island p-4 sm:p-6">
            {activeTab === 'account' && (
              <div className="space-y-6 max-w-2xl">
                {/* 1. Avatar Photo Section */}
                <div className="p-5 sm:p-6 rounded-2xl bg-surface-panel border border-border-subtle space-y-4">
                  <div className="flex items-center gap-2">
                    <Camera size={16} className="text-brand-500" />
                    <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                      Profile Picture
                    </h3>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pt-1">
                    <div className="relative group shrink-0">
                      <UserAvatar user={user} size="2xl" className="shadow-xl" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading || avatarRemoving}
                        className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-semibold gap-1 backdrop-blur-xs cursor-pointer"
                        title="Upload Photo"
                      >
                        <Camera size={18} />
                        <span>Change</span>
                      </button>
                    </div>

                    <div className="space-y-3 text-center sm:text-left flex-1 min-w-0">
                      <div>
                        <div className="text-sm font-bold text-white">
                          {user?.display_name || user?.username}
                        </div>
                        <p className="text-xs text-content-muted mt-1 leading-relaxed">
                          Personalize your profile with a custom photo. Supports JPG, PNG, and WebP (up to 10MB). Photos are automatically center-cropped to a square and optimized.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleAvatarFileSelected}
                        />

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={avatarUploading || avatarRemoving}
                          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                        >
                          {avatarUploading ? (
                            <>
                              <Loader2 size={14} className="animate-spin text-brand-500" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              <span>Upload Photo</span>
                            </>
                          )}
                        </button>

                        {user?.avatar_url && (
                          <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            disabled={avatarUploading || avatarRemoving}
                            className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                          >
                            {avatarRemoving ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Removing...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {avatarError && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>{avatarError}</span>
                        </div>
                      )}

                      {avatarSuccess && (
                        <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-2 rounded-lg">
                          <Check size={14} className="shrink-0 text-brand-500" />
                          <span>{avatarSuccess}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Account Details Section */}
                <form onSubmit={handleSaveProfile} className="p-5 sm:p-6 rounded-2xl bg-surface-panel border border-border-subtle space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-brand-500" />
                      <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                        Account Details
                      </h3>
                    </div>

                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isAdmin ? 'bg-brand-500/20 text-brand-500' : 'bg-white/10 text-content-secondary'
                    }`}>
                      {isAdmin ? 'System Administrator' : 'Standard User'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-content-secondary block">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayNameVal}
                        onChange={(e) => setDisplayNameVal(e.target.value)}
                        placeholder="e.g. Matt"
                        maxLength={50}
                        className="w-full bg-surface-island border border-border-medium rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-content-subtle outline-none focus:border-brand-500 transition"
                      />
                      <p className="text-[10px] text-content-muted">
                        Friendly name visible in headers and playlists
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-content-secondary block">
                        Username
                      </label>
                      <input
                        type="text"
                        value={usernameVal}
                        onChange={(e) => setUsernameVal(e.target.value)}
                        placeholder="e.g. matt"
                        autoCapitalize="none"
                        autoCorrect="off"
                        maxLength={32}
                        required
                        className="w-full bg-surface-island border border-border-medium rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-content-subtle outline-none focus:border-brand-500 transition"
                      />
                      <p className="text-[10px] text-content-muted">
                        Unique handle used to sign in
                      </p>
                    </div>
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{profileError}</span>
                    </div>
                  )}

                  {profileSuccess && (
                    <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-2 rounded-lg">
                      <Check size={14} className="shrink-0 text-brand-500" />
                      <span>{profileSuccess}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 active:scale-95 text-black text-xs font-bold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-black" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* 3. Password & Security Section */}
                <form onSubmit={handleChangePassword} className="p-5 sm:p-6 rounded-2xl bg-surface-panel border border-border-subtle space-y-4">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-brand-500" />
                    <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                      Change Password
                    </h3>
                  </div>
                  <p className="text-xs text-content-muted leading-relaxed">
                    Verify your current password to set a new password. Password must be at least 6 characters long.
                  </p>

                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-content-secondary block">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter your current password"
                          required
                          className="w-full bg-surface-island border border-border-medium rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-content-subtle outline-none focus:border-brand-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition"
                        >
                          {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-content-secondary block">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            required
                            minLength={6}
                            className="w-full bg-surface-island border border-border-medium rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-content-subtle outline-none focus:border-brand-500 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition"
                          >
                            {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-content-secondary block">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat new password"
                            required
                            minLength={6}
                            className="w-full bg-surface-island border border-border-medium rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-content-subtle outline-none focus:border-brand-500 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition"
                          >
                            {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {passwordError && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-2 rounded-lg">
                      <Check size={14} className="shrink-0 text-brand-500" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={passwordUpdating}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {passwordUpdating ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-brand-500" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <Key size={14} />
                          <span>Update Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                {/* Search & Category Filter Header */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search shortcuts (e.g. volume, seek, reorder, ctrl)..."
                      className="w-full bg-surface-elevated border border-border-medium rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-content-muted outline-none focus:border-brand-500/80 transition"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-white p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    {SHORTCUT_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                          selectedCategory === cat.id
                            ? 'bg-white text-black shadow'
                            : 'bg-surface-elevated text-content-secondary hover:text-white hover:bg-surface-hover border border-border-subtle'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shortcuts List by Group */}
                {filteredShortcuts.length === 0 ? (
                  <div className="py-16 text-center text-content-muted">
                    <Keyboard size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-semibold text-content-secondary">
                      No shortcuts matching "{searchQuery}"
                    </p>
                    <p className="text-xs text-content-muted mt-1">
                      Try searching with words like "space", "play", "seek", or "arrow"
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredShortcuts.map((category) => (
                      <div key={category.category} className="space-y-2.5">
                        <div className="flex items-center gap-2 pb-1 border-b border-border-subtle">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-400">
                            {category.categoryLabel}
                          </h3>
                          <span className="text-[10px] text-content-subtle font-mono">
                            ({category.items.length})
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          {category.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-surface-panel hover:bg-surface-elevated border border-border-subtle transition group min-w-0 max-w-full overflow-hidden"
                            >
                              <div className="pr-4 min-w-0">
                                <div className="text-xs font-semibold text-white group-hover:text-brand-300 transition">
                                  {item.title}
                                </div>
                                <div className="text-[11px] text-content-muted mt-0.5 line-clamp-1">
                                  {item.description}
                                </div>
                              </div>

                              {/* Keystroke Keycaps Badge */}
                              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                {item.combos.map((combo, comboIdx) => (
                                  <React.Fragment key={comboIdx}>
                                    {comboIdx > 0 && (
                                      <span className="text-[10px] text-content-subtle font-semibold px-0.5">
                                        or
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1 bg-surface-island p-1 rounded-lg border border-border-medium shadow-inner">
                                      {combo.map((k, kIdx) => (
                                        <React.Fragment key={kIdx}>
                                          {kIdx > 0 && (
                                            <span className="text-[10px] text-content-subtle font-bold">
                                              +
                                            </span>
                                          )}
                                          <kbd className="px-2 py-0.5 text-[11px] font-mono font-bold bg-surface-elevated2 text-white rounded border border-white/20 shadow-[0_2px_0_rgba(255,255,255,0.06)] min-w-[20px] text-center inline-block">
                                            {k}
                                          </kbd>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Helpful Pro-Tip Callout Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-brand-500/10 via-brand-500/5 to-transparent border border-brand-500/20 flex items-start gap-3 text-xs">
                  <Sparkles size={18} className="text-brand-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Pro Tip: </span>
                    <span className="text-content-secondary">
                      Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-surface-elevated border border-white/20 rounded text-white">Ctrl + K</kbd> anywhere in the application to summon the Quick Search Command Palette. Form inputs (login, track name, search) automatically bypass playback hotkeys so you can type freely!
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'playback' && (
              <div className="space-y-4">
                {/* Master / Detail Drilldown Header */}
                {audioSubpage ? (
                  <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setAudioSubpage(null)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition py-1 px-2 -ml-2 rounded-lg hover:bg-white/5 active:scale-95"
                    >
                      <ChevronLeft size={16} />
                      <span>Audio & Playback</span>
                    </button>
                    <span className="text-xs font-bold text-white capitalize">
                      {audioSubpage === 'quality' && 'Streaming Quality'}
                      {audioSubpage === 'preload' && 'Preload Buffer'}
                      {audioSubpage === 'miniplayer' && 'Miniplayer Style'}
                    </span>
                  </div>
                ) : (
                  /* Root Header */
                  <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center shrink-0">
                        <Volume2 size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white">Audio & Playback</h3>
                        <p className="text-[11px] text-content-secondary">
                          Streaming fidelity, buffer management & player style
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] bg-surface-island px-2.5 py-1 rounded-lg border border-border-subtle">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        preloadCount > 0 ? 'bg-brand-500 animate-pulse' : 'bg-content-subtle'
                      }`} />
                      <span className="text-content-secondary font-mono font-medium">
                        {preloadedTrackIds?.size || 0} in RAM
                      </span>
                    </div>
                  </div>
                )}

                {/* SUBPAGE 1: Streaming Audio Quality */}
                {audioSubpage === 'quality' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <Gauge size={15} className="text-brand-500" />
                        <span>Select Playback Fidelity</span>
                      </h4>

                      <div className="space-y-2">
                        {/* Option 1: Original */}
                        <button
                          type="button"
                          onClick={() => setAudioQuality('original')}
                          className={`w-full p-3 rounded-xl text-left border transition flex items-center justify-between ${
                            audioQuality === 'original'
                              ? 'bg-brand-500/10 border-brand-500 text-white ring-1 ring-brand-500/40'
                              : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">Original (Lossless / HQ)</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                                DEFAULT
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted mt-0.5">
                              Bit-perfect streaming up to 24-bit FLAC & 320 kbps MP3 files.
                            </p>
                          </div>
                          {audioQuality === 'original' && (
                            <Check size={16} className="text-brand-500 shrink-0" />
                          )}
                        </button>

                        {/* Option 2: Data Saver */}
                        <button
                          type="button"
                          onClick={() => setAudioQuality('data_saver')}
                          className={`w-full p-3 rounded-xl text-left border transition flex items-center justify-between ${
                            audioQuality === 'data_saver'
                              ? 'bg-amber-500/10 border-amber-500 text-white ring-1 ring-amber-500/40'
                              : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">Data Saver</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                128 KBPS
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted mt-0.5">
                              Uses ~85–90% less data. Best for mobile data plans & metered connections.
                            </p>
                          </div>
                          {audioQuality === 'data_saver' && (
                            <Check size={16} className="text-amber-400 shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Transcode Cache Info */}
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <HardDrive size={15} className="text-brand-500 shrink-0" />
                        <div>
                          <p className="font-bold text-white">Server Transcode Cache</p>
                          <p className="text-[11px] text-content-muted mt-0.5">
                            {transcodeCacheStats.size_mb > 0
                              ? `${transcodeCacheStats.size_mb} MB stored across ${transcodeCacheStats.file_count} converted tracks`
                              : 'Empty (0 MB) - generated on-demand in Data Saver'}
                          </p>
                        </div>
                      </div>

                      {transcodeCacheStats.file_count > 0 && (
                        <button
                          type="button"
                          onClick={handleClearTranscodeCache}
                          disabled={clearingTranscodeCache}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-border-medium transition shrink-0 flex items-center gap-1.5"
                        >
                          {transcodeClearedSuccess ? (
                            <>
                              <Check size={12} className="text-brand-400" />
                              <span>Purged!</span>
                            </>
                          ) : (
                            <>
                              <Trash2 size={12} />
                              <span>{clearingTranscodeCache ? 'Purging...' : 'Purge'}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* SUBPAGE 2: Upcoming Track Buffer */}
                {audioSubpage === 'preload' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white flex items-center gap-2">
                            <Zap size={15} className="text-brand-500" />
                            <span>Queue Preload Window</span>
                          </h4>
                          <p className="text-[11px] text-content-muted mt-0.5">
                            Pre-buffers upcoming queue tracks into memory for gapless playback
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                          {preloadCount === 0 ? 'Off (Direct)' : `${preloadCount} songs`}
                        </span>
                      </div>

                      {/* Preset Buttons */}
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { value: 0, label: '0 (Off)' },
                          { value: 1, label: '1 Song' },
                          { value: 3, label: '3 Songs' },
                          { value: 5, label: '5 Songs' },
                          { value: 10, label: '10 Songs' },
                        ].map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setPreloadCount(preset.value)}
                            className={`py-2 px-1 text-center rounded-lg border transition text-xs font-semibold ${
                              preloadCount === preset.value
                                ? 'bg-brand-500/20 border-brand-500 text-brand-400 ring-1 ring-brand-500/40'
                                : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {/* Slider */}
                      <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between text-[11px] text-content-muted">
                          <span>Fine-tune buffer size</span>
                          <span className="font-mono text-white font-bold">{preloadCount} tracks</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={preloadCount}
                          onChange={(e) => setPreloadCount(Number(e.target.value))}
                          className="w-full h-1.5 bg-surface-elevated2 rounded-lg appearance-none cursor-pointer accent-brand-500"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-content-subtle">
                          <span>0 (Direct)</span>
                          <span>3 (Default)</span>
                          <span>10 (Max)</span>
                        </div>
                      </div>

                      {/* Guidance note */}
                      <div className="p-3 rounded-lg bg-surface-island border border-border-subtle text-[11px] text-content-secondary leading-relaxed">
                        {preloadCount === 0 && (
                          <span><strong className="text-white">Direct Stream: </strong>Zero RAM allocated. Audio plays on demand.</span>
                        )}
                        {preloadCount > 0 && preloadCount <= 3 && (
                          <span><strong className="text-white">Balanced Profile: </strong>Seamless gapless transitions with minimal memory footprint.</span>
                        )}
                        {preloadCount > 3 && (
                          <span><strong className="text-white">High Resilience: </strong>Deep buffer to prevent spin-up delay on Unraid hard drives.</span>
                        )}
                      </div>
                    </div>

                    {/* Purge Buffer Action */}
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">Purge Allocated RAM Buffer</p>
                        <p className="text-[11px] text-content-muted mt-0.5">
                          Frees browser blob URLs and caches immediately
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearCache}
                        disabled={clearingCache}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-border-medium transition shrink-0 flex items-center gap-1.5"
                      >
                        {cacheClearedSuccess ? (
                          <>
                            <Check size={12} className="text-brand-400" />
                            <span>Purged!</span>
                          </>
                        ) : (
                          <>
                            <Trash2 size={12} />
                            <span>{clearingCache ? 'Purging...' : 'Purge RAM'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* SUBPAGE 3: Floating Miniplayer */}
                {audioSubpage === 'miniplayer' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <PictureInPicture2 size={15} className="text-brand-500" />
                          <span>Miniplayer Style</span>
                        </h4>
                        <button
                          type="button"
                          onClick={togglePiP}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white border border-border-medium transition flex items-center gap-1.5"
                        >
                          <PictureInPicture2 size={12} />
                          <span>{isPiPActive ? 'Close' : 'Preview'}</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setPipEngine('interactive')}
                          className={`w-full p-3 rounded-xl text-left border transition flex items-center justify-between ${
                            pipEngine === 'interactive'
                              ? 'bg-brand-500/10 border-brand-500 text-white ring-1 ring-brand-500/40'
                              : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">Interactive Miniplayer</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                                DEFAULT
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted mt-0.5">
                              Floating window with click-to-play buttons, volume & live synced lyrics.
                            </p>
                          </div>
                          {pipEngine === 'interactive' && (
                            <Check size={16} className="text-brand-500 shrink-0" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setPipEngine('video')}
                          className={`w-full p-3 rounded-xl text-left border transition flex items-center justify-between ${
                            pipEngine === 'video'
                              ? 'bg-purple-500/10 border-purple-500 text-white ring-1 ring-purple-500/40'
                              : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">Frameless Video Miniplayer</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                16:9
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted mt-0.5">
                              Borderless floating card with album artwork, ambient glow, and lyrics.
                            </p>
                          </div>
                          {pipEngine === 'video' && (
                            <Check size={16} className="text-purple-400 shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Transparency & Ghost Mode */}
                    <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">In-Page Transparency</span>
                        <div className="flex items-center gap-1">
                          {[
                            { val: 50, label: '50%' },
                            { val: 85, label: '85%' },
                            { val: 100, label: '100%' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() => setMiniPlayerOpacity(preset.val)}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition ${
                                (miniPlayerOpacity ?? 85) === preset.val
                                  ? 'bg-brand-500 text-black border-brand-500 font-bold'
                                  : 'bg-white/5 hover:bg-white/10 text-content-secondary hover:text-white border-border-subtle'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <input
                        type="range"
                        min="30"
                        max="100"
                        step="5"
                        value={miniPlayerOpacity ?? 85}
                        onChange={(e) => setMiniPlayerOpacity(parseInt(e.target.value, 10))}
                        className="w-full accent-brand-500 bg-surface-elevated h-1.5 rounded-lg appearance-none cursor-pointer"
                      />

                      <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-white">Idle Dimming (Ghost Mode)</p>
                          <p className="text-[11px] text-content-muted">
                            Fades player when idle; restores on mouse hover or drag
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMiniPlayerIdleDim(!miniPlayerIdleDim)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            miniPlayerIdleDim ? 'bg-brand-500' : 'bg-surface-elevated'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              miniPlayerIdleDim ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ROOT: iOS Settings Grouped List */}
                {!audioSubpage && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Section 1: Audio Quality & Ingestion */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted px-1 mb-1.5">
                        Audio Streaming & Cache
                      </p>
                      <div className="bg-surface-panel border border-border-subtle rounded-xl divide-y divide-border-subtle overflow-hidden">
                        {/* Row: Streaming Audio Quality */}
                        <button
                          type="button"
                          onClick={() => setAudioSubpage('quality')}
                          className="w-full px-3.5 py-3 hover:bg-white/5 active:bg-white/10 transition flex items-center justify-between text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                              <Gauge size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white group-hover:text-brand-400 transition">
                                Streaming Audio Quality
                              </p>
                              <p className="text-[11px] text-content-muted">
                                Playback fidelity & bandwidth profile
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-semibold text-content-secondary bg-surface-island px-2 py-0.5 rounded-md border border-border-subtle">
                              {audioQuality === 'original' ? 'Lossless (HQ)' : 'Data Saver (128k)'}
                            </span>
                            <ChevronRight size={15} className="text-content-muted group-hover:text-white transition" />
                          </div>
                        </button>

                        {/* Row: Buffer Management */}
                        <button
                          type="button"
                          onClick={() => setAudioSubpage('preload')}
                          className="w-full px-3.5 py-3 hover:bg-white/5 active:bg-white/10 transition flex items-center justify-between text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                              <Zap size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white group-hover:text-brand-400 transition">
                                Upcoming Songs Buffer
                              </p>
                              <p className="text-[11px] text-content-muted">
                                Gapless playback caching & memory window
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-semibold text-content-secondary bg-surface-island px-2 py-0.5 rounded-md border border-border-subtle">
                              {preloadCount === 0 ? 'Direct Stream' : `${preloadCount} Songs`}
                            </span>
                            <ChevronRight size={15} className="text-content-muted group-hover:text-white transition" />
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Playback & Interface */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted px-1 mb-1.5">
                        Queue & Interface
                      </p>
                      <div className="bg-surface-panel border border-border-subtle rounded-xl divide-y divide-border-subtle overflow-hidden">
                        {/* Row: Autoplay (Inline Switch) */}
                        <div className="w-full px-3.5 py-3 flex items-center justify-between text-left">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                              <Sparkles size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white">
                                Autoplay Similar Songs
                              </p>
                              <p className="text-[11px] text-content-muted">
                                Smart radio queue when tracks end
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAutoplaySimilar(!autoplaySimilar)}
                            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative shrink-0 ${
                              autoplaySimilar ? 'bg-brand-500' : 'bg-surface-island border border-white/10'
                            }`}
                            title="Toggle Autoplay Similar Songs"
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              autoplaySimilar ? 'translate-x-4.5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* Row: Miniplayer Display */}
                        <button
                          type="button"
                          onClick={() => setAudioSubpage('miniplayer')}
                          className="w-full px-3.5 py-3 hover:bg-white/5 active:bg-white/10 transition flex items-center justify-between text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                              <PictureInPicture2 size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white group-hover:text-brand-400 transition">
                                Floating Miniplayer
                              </p>
                              <p className="text-[11px] text-content-muted">
                                Style, transparency & idle ghosting
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-semibold text-content-secondary bg-surface-island px-2 py-0.5 rounded-md border border-border-subtle">
                              {pipEngine === 'interactive' ? 'Interactive' : 'Video 16:9'}
                            </span>
                            <ChevronRight size={15} className="text-content-muted group-hover:text-white transition" />
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Automatic Lyrics Search Engine Card */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileText size={16} className="text-brand-500" />
                        <span>Automatic Lyrics Search Engine</span>
                      </h4>
                      <p className="text-xs text-content-muted mt-0.5">
                        Multi-tier background crawler indexing local sidecars, embedded audio tags, and LRCLIB with anti-blocking safeguards.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {lyricsStatus?.is_circuit_broken ? (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                          <AlertCircle size={12} />
                          <span>Circuit Breaker ({lyricsStatus.circuit_cooldown_seconds}s)</span>
                        </span>
                      ) : lyricsStatus?.is_paused ? (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 flex items-center gap-1.5">
                          <Pause size={12} />
                          <span>Paused</span>
                        </span>
                      ) : lyricsStatus?.pending_count > 0 ? (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider bg-brand-500/15 text-brand-400 border border-brand-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                          <span>Indexing ({lyricsStatus.pending_count} Left)</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                          <Check size={12} />
                          <span>All Lyrics Up-to-Date</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-surface-island border border-border-subtle">
                      <div className="text-[10px] uppercase font-bold text-content-subtle tracking-wider">Synced Karaoke</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {lyricsStatus ? lyricsStatus.synced_count.toLocaleString() : '—'}
                      </div>
                      <div className="text-[10px] text-brand-400 font-medium mt-0.5">
                        {lyricsStatus && lyricsStatus.total_tracks > 0
                          ? `${((lyricsStatus.synced_count / lyricsStatus.total_tracks) * 100).toFixed(1)}% of library`
                          : ''}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-island border border-border-subtle">
                      <div className="text-[10px] uppercase font-bold text-content-subtle tracking-wider">Plain Text</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {lyricsStatus ? lyricsStatus.plain_count.toLocaleString() : '—'}
                      </div>
                      <div className="text-[10px] text-content-muted mt-0.5">
                        Static line lyrics
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-island border border-border-subtle">
                      <div className="text-[10px] uppercase font-bold text-content-subtle tracking-wider">Unmatched / Instrumental</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {lyricsStatus ? lyricsStatus.not_found_count.toLocaleString() : '—'}
                      </div>
                      <div className="text-[10px] text-content-subtle mt-0.5">
                        Negative cached
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-island border border-border-subtle">
                      <div className="text-[10px] uppercase font-bold text-content-subtle tracking-wider">Pending Crawl</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {lyricsStatus ? lyricsStatus.pending_count.toLocaleString() : '—'}
                      </div>
                      <div className="text-[10px] text-content-subtle mt-0.5">
                        {lyricsStatus ? `Queue: ${lyricsStatus.queue_size}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Colored Stacked Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-content-muted font-medium">Library Indexing Coverage</span>
                      <span className="font-mono text-white font-bold">
                        {lyricsStatus?.progress_percent ?? 0}% Processed ({lyricsStatus ? (lyricsStatus.total_tracks - lyricsStatus.pending_count).toLocaleString() : 0} / {lyricsStatus?.total_tracks?.toLocaleString() ?? 0})
                      </span>
                    </div>

                    <div className="h-2.5 w-full bg-surface-island rounded-full overflow-hidden flex border border-border-subtle">
                      {lyricsStatus && lyricsStatus.total_tracks > 0 && (
                        <>
                          <div
                            style={{ width: `${(lyricsStatus.synced_count / lyricsStatus.total_tracks) * 100}%` }}
                            className="bg-brand-500 h-full transition-all duration-500"
                            title={`Synced Lyrics: ${lyricsStatus.synced_count}`}
                          />
                          <div
                            style={{ width: `${(lyricsStatus.plain_count / lyricsStatus.total_tracks) * 100}%` }}
                            className="bg-blue-500/80 h-full transition-all duration-500"
                            title={`Plain Lyrics: ${lyricsStatus.plain_count}`}
                          />
                          <div
                            style={{ width: `${(lyricsStatus.not_found_count / lyricsStatus.total_tracks) * 100}%` }}
                            className="bg-zinc-600 h-full transition-all duration-500"
                            title={`Unmatched / Instrumental: ${lyricsStatus.not_found_count}`}
                          />
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-[10px] text-content-subtle pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-brand-500" />
                        <span>Synced Karaoke</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500/80" />
                        <span>Plain Lyrics</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-zinc-600" />
                        <span>Unmatched / Instrumental</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-surface-island border border-border-subtle" />
                        <span>Pending</span>
                      </div>
                    </div>
                  </div>

                  {/* Active Track / Status Insight */}
                  {lyricsStatus?.current_track && (
                    <div className="p-3 rounded-xl bg-surface-island border border-border-subtle flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Loader2 size={14} className="text-brand-500 animate-spin shrink-0" />
                        <span className="text-content-muted shrink-0">Currently Fetching:</span>
                        <span className="text-white font-medium truncate">{lyricsStatus.current_track}</span>
                      </div>
                      <span className="text-[10px] font-mono text-content-subtle shrink-0">2.5s Pacing</span>
                    </div>
                  )}

                  {/* Safeguards & Admin Controls */}
                  <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-[11px] text-content-muted leading-relaxed">
                      <span className="text-white font-medium">Safe Crawl Protocol: </span>
                      Strict 2.5s pacing, negative 404 cache, and circuit breaker active to prevent external rate-limiting.
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLyricsControl(lyricsStatus?.is_paused ? 'resume' : 'pause')}
                          disabled={lyricsActionLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-island hover:bg-white/10 text-white border border-border-subtle transition flex items-center gap-1.5"
                        >
                          {lyricsStatus?.is_paused ? (
                            <>
                              <Play size={13} className="text-brand-500 fill-brand-500" />
                              <span>Resume</span>
                            </>
                          ) : (
                            <>
                              <Pause size={13} className="text-yellow-400" />
                              <span>Pause</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLyricsControl('rescan_missing')}
                          disabled={lyricsActionLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-black font-bold transition flex items-center gap-1.5 shadow-sm"
                        >
                          <RefreshCw size={13} className={lyricsActionLoading ? 'animate-spin' : ''} />
                          <span>Scan Missing</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {lyricsMessage && (
                    <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-xs text-brand-400 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{lyricsMessage}</span>
                    </div>
                  )}
                </div>

                {/* Spotify Canvas & Video Visualizer Card */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20 flex items-center justify-center shrink-0">
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Spotify Canvas Visualizer</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            user?.preferences?.spotify_sp_dc
                              ? 'bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30'
                              : 'bg-white/10 text-content-muted'
                          }`}>
                            {user?.preferences?.spotify_sp_dc ? 'Connected' : 'YouTube Fallback Active'}
                          </span>
                        </h4>
                        <p className="text-xs text-content-muted mt-0.5">
                          Enables official looping 9:16 Canvas MP4s directly from Spotify's CDN. Falls back to synced YouTube videos when no Canvas exists.
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSpotifySpDc} className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-content-secondary block mb-1.5">
                        Spotify <code className="text-[#1DB954] font-mono text-[11px] bg-black/40 px-1.5 py-0.5 rounded">sp_dc</code> Cookie
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showSpDc ? 'text' : 'password'}
                          value={spotifySpDc}
                          onChange={(e) => setSpotifySpDc(e.target.value)}
                          placeholder="Paste your Spotify sp_dc cookie (starts with AQB...)"
                          className="w-full bg-surface-island border border-border-subtle focus:border-brand-500 rounded-xl px-3.5 py-2.5 text-xs text-content-primary font-mono pr-20 placeholder:text-content-subtle focus:outline-none transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSpDc(!showSpDc)}
                          className="absolute right-3 text-content-muted hover:text-white transition p-1"
                          title={showSpDc ? 'Hide cookie' : 'Show cookie'}
                        >
                          {showSpDc ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <p className="text-[11px] text-content-muted mt-1.5 leading-relaxed">
                        Found on <span className="text-white font-medium">open.spotify.com</span> via <kbd className="px-1 py-0.5 bg-surface-island rounded border border-border-subtle text-[10px] font-mono">F12</kbd> → <strong>Application</strong> → <strong>Cookies</strong> → <code className="text-[#1DB954] font-mono text-[10px]">sp_dc</code>.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-content-subtle">
                        {user?.preferences?.spotify_sp_dc ? '✓ High-definition looping video enabled' : 'ℹ YouTube official video visualizer is currently active'}
                      </span>
                      <button
                        type="submit"
                        disabled={isSavingSpDc}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                          spDcSavedSuccess
                            ? 'bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30'
                            : 'bg-brand-500 hover:bg-brand-400 text-black font-bold'
                        }`}
                      >
                        {spDcSavedSuccess ? (
                          <>
                            <Check size={14} className="text-[#1DB954]" />
                            <span>Saved!</span>
                          </>
                        ) : isSavingSpDc ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Save Cookie</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'issues' && (
              <div className="space-y-4 max-w-3xl">
                {/* Header & New Issue Action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface-panel border border-border-subtle">
                  <div>
                    <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
                      <Bug size={16} className="text-amber-400" />
                      <span>Issue Log & Notes</span>
                    </h3>
                    <p className="text-[11px] text-content-secondary mt-0.5">
                      Your in-app backlog of bugs, glitches, and feature notes
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {onOpenBugReport && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenBugReport();
                        }}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black flex items-center gap-1.5 transition active:scale-95"
                      >
                        <Plus size={14} />
                        <span>Log New Issue</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    {['all', 'open', 'resolved'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setIssuesFilter(st)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition ${
                          issuesFilter === st
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
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
                        onClick={() => onMarkSeen?.()}
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1 cursor-pointer"
                        title="Mark all notifications as read"
                      >
                        <Check size={12} className="stroke-[2.5]" />
                        <span>Mark as read</span>
                      </button>
                    )}
                    <button
                      onClick={fetchIssues}
                      disabled={isLoadingIssues}
                      className="text-xs text-content-secondary hover:text-brand-500 transition"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {hasResolvedIssues && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between gap-3 shadow-sm mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                      <span className="leading-snug">
                        Your reported issue has been marked as <strong>Resolved</strong>!
                      </span>
                    </div>
                    <button
                      onClick={() => onMarkSeen?.()}
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[11px] transition shrink-0 cursor-pointer shadow active:scale-95"
                    >
                      Mark as Read
                    </button>
                  </div>
                )}

                {/* Issues List */}
                {isLoadingIssues ? (
                  <div className="py-16 flex flex-col items-center justify-center text-content-secondary gap-2">
                    <Loader2 size={20} className="animate-spin text-brand-500" />
                    <span className="text-xs">Loading issues...</span>
                  </div>
                ) : issues.length === 0 ? (
                  <div className="py-16 text-center text-content-secondary p-6 rounded-2xl bg-surface-panel/40 border border-border-subtle">
                    <CheckCircle2 size={28} className="mx-auto mb-2 text-content-subtle" />
                    <p className="text-xs font-semibold text-content-primary">No issues found</p>
                    <p className="text-[11px] text-content-subtle mt-1">
                      Everything looks clear! Click "Log New Issue" to record any bugs or ideas.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {issues.map((issue) => {
                      const isResolved = issue.status === 'resolved';
                      return (
                        <div
                          key={issue.id}
                          className={`p-4 rounded-xl border transition ${
                            isResolved
                              ? 'bg-surface-panel/40 border-border-subtle opacity-70'
                              : 'bg-surface-panel border-border-subtle hover:border-border-medium'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {isAdmin ? (
                                <button
                                  onClick={() => handleToggleIssueStatus(issue)}
                                  className={`mt-0.5 shrink-0 transition ${
                                    isResolved ? 'text-emerald-400 hover:text-emerald-300' : 'text-content-subtle hover:text-brand-500'
                                  } cursor-pointer`}
                                  title={isResolved ? 'Mark as Open' : 'Mark as Resolved'}
                                >
                                  {isResolved ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </button>
                              ) : (
                                <div
                                  className={`mt-0.5 shrink-0 ${
                                    isResolved ? 'text-emerald-400' : 'text-content-subtle'
                                  }`}
                                  title={isResolved ? 'Status: Resolved' : 'Status: Open'}
                                >
                                  {isResolved ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-bold ${isResolved ? 'line-through text-content-secondary' : 'text-content-primary'}`}>
                                    {issue.title}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    issue.type === 'feature'
                                      ? 'bg-brand-500/10 text-brand-400'
                                      : 'bg-amber-500/10 text-amber-400'
                                  }`}>
                                    {issue.type === 'feature' ? 'Idea' : 'Bug'}
                                  </span>
                                  {isResolved && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                      Resolved
                                    </span>
                                  )}
                                  {isAdmin && Boolean(issue.user_deleted) && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-content-subtle" title="User cleared this from their personal log">
                                      Archived by user
                                    </span>
                                  )}
                                  <span className="text-[10px] text-content-subtle px-1.5 py-0.5 rounded bg-white/5 uppercase font-medium">
                                    {issue.priority}
                                  </span>
                                </div>

                                <p className="text-xs text-content-secondary mt-1.5 whitespace-pre-wrap leading-relaxed">
                                  {issue.description}
                                </p>

                                <div className="flex items-center gap-3 mt-2.5 text-[11px] text-content-subtle flex-wrap">
                                  <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span className="capitalize">{issue.category}</span>
                                  {isAdmin && issue.username && (
                                    <>
                                      <span>•</span>
                                      <span>@{issue.username}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {(isAdmin || (user && issue.user_id === user.id)) && (
                              <button
                                onClick={() => handleDeleteIssue(issue.id)}
                                className="p-1.5 text-content-subtle hover:text-red-400 hover:bg-white/5 rounded-lg transition shrink-0 cursor-pointer"
                                title="Delete issue"
                              >
                                <Trash2 size={15} />
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

            {activeTab === 'about' && (
              <div className="space-y-6">
                {/* Branding Hero Banner */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-surface-elevated to-surface-island border border-border-medium relative overflow-hidden">
                  <div className="absolute right-4 -bottom-6 opacity-10 pointer-events-none">
                    <MattLabLogo variant="badge" bgColor="var(--brand-primary)" color="var(--surface-base)" className="w-40 h-40" />
                  </div>
                  <div className="flex items-center gap-4 relative z-10">
                    <MattLabLogo
                      variant="badge"
                      bgColor="var(--brand-primary)"
                      color="var(--surface-base)"
                      className="w-14 h-14 rounded-2xl shadow-xl shrink-0"
                    />
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <span>MattLab Music</span>
                        <span 
                          onClick={handleVersionClick}
                          className="text-xs font-bold bg-brand-500 text-black px-2 py-0.5 rounded-full cursor-default select-none"
                        >
                          v1.0.0
                        </span>
                      </h3>
                      <p className="text-xs text-content-secondary mt-1 max-w-md">
                        Self-hosted streaming ecosystem with lossless local playback, Spotify chart synchronization, and automated media acquisition.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Desktop Native App Banner */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900/30 via-surface-island to-brand-500/10 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
                      <Monitor size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">MattLab Music Desktop App</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Windows Portable
                        </span>
                      </div>
                      <p className="text-xs text-content-secondary mt-0.5">
                        Features OS-level transparent acrylic miniplayer, persistent background listening, and global media keys.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/downloads/MattLab-Music-Windows-Portable.zip"
                    download="MattLab-Music-Windows-Portable.zip"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition shrink-0 active:scale-95"
                  >
                    <Download size={15} />
                    <span>Download App (110MB)</span>
                  </a>
                </div>

                {/* Library Statistics Grid */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-content-secondary mb-3 flex items-center gap-2">
                    <HardDrive size={14} className="text-brand-500" />
                    <span>Catalog & Media Telemetry</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle text-center">
                      <div className="text-xl font-black text-brand-400">
                        {stats?.tracks !== undefined ? stats.tracks.toLocaleString() : '—'}
                      </div>
                      <div className="text-[11px] font-semibold text-content-muted mt-1">Tracks</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle text-center">
                      <div className="text-xl font-black text-white">
                        {stats?.albums !== undefined ? stats.albums.toLocaleString() : '—'}
                      </div>
                      <div className="text-[11px] font-semibold text-content-muted mt-1">Albums</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle text-center">
                      <div className="text-xl font-black text-white">
                        {stats?.artists !== undefined ? stats.artists.toLocaleString() : '—'}
                      </div>
                      <div className="text-[11px] font-semibold text-content-muted mt-1">Artists</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle text-center">
                      <div className="text-xl font-black text-brand-400">
                        {stats?.total_duration_hours !== undefined ? `${stats.total_duration_hours}h` : '—'}
                      </div>
                      <div className="text-[11px] font-semibold text-content-muted mt-1">Total Playtime</div>
                    </div>
                  </div>
                </div>

                {/* Ecosystem Architecture Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Music size={15} className="text-brand-500" />
                      <span>Audio Playback Engine</span>
                    </div>
                    <p className="text-content-muted text-[11px] leading-relaxed">
                      Native HTML5 Audio pipeline with gapless seek buffers, real-time volume gain staging, and support for FLAC, MP3, AAC, and Opus.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Disc3 size={15} className="text-brand-500" />
                      <span>Spotify & Chart Synchronization</span>
                    </div>
                    <p className="text-content-muted text-[11px] leading-relaxed">
                      Unified Spotify sync engine fetching real-time global charts, matching local audio signatures, and keeping playlist tracks synced.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-2 sm:col-span-2">
                    <div className="font-bold text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DownloadCloud size={15} className="text-brand-400" />
                        <span>Music Acquisition & Library Engine</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20">
                        Multi-Source Pipeline
                      </span>
                    </div>
                    <p className="text-content-muted text-[11px] leading-relaxed">
                      Automated high-fidelity ingestion pipeline orchestrating Lidarr catalog indexing, private BitTorrent trackers, and high-speed multi-source direct fetchers. Requested albums and playlists are automatically matched, tagged with lossless metadata, and delivered directly to the library in FLAC lossless or 320kbps MP3 fidelity.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle space-y-2 sm:col-span-2">
                    <div className="font-bold text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={15} className="text-emerald-400" />
                        <span>Self-Healing Library & Media Integrity</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                        Active & Monitoring
                      </span>
                    </div>
                    <p className="text-content-muted text-[11px] leading-relaxed">
                      Automatically detects corrupted audio files, truncated rips, and broken cover art in the background. Damaged tracks are seamlessly re-fetched and upgraded to pristine 320k releases with zero user intervention.
                    </p>
                  </div>
                </div>

                {/* User Session Info Card */}
                <div className="p-4 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={user} size="lg" />
                    <div>
                      <div className="text-sm font-bold text-white">
                        {user?.display_name || user?.username}
                      </div>
                      <div className="text-[11px] text-content-muted flex items-center gap-2">
                        <span>@{user?.username}</span>
                        <span>•</span>
                        <span className={isAdmin ? 'text-brand-400 font-semibold' : 'text-content-muted'}>
                          {isAdmin ? 'System Administrator' : 'Standard User'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenUserManagement?.();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                    >
                      Manage Users
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'experiments' && (
              <div className="space-y-6">
                {/* Warning Banner */}
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-300 leading-relaxed">
                  <AlertTriangle size={20} className="shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold">WARNING: EXPERIMENTAL FEATURES AHEAD!</span> By enabling these feature flags, you are customizing internal typography and audio pipelines. Changes apply immediately in real-time.
                  </div>
                </div>

                {/* Search Bar & Action Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted" />
                    <input
                      type="text"
                      value={flagsFilter}
                      onChange={(e) => setFlagsFilter(e.target.value)}
                      placeholder="Search available flags..."
                      className="w-full bg-surface-panel hover:bg-surface-elevated focus:bg-surface-elevated text-white pl-10 pr-4 py-2 rounded-xl text-xs font-medium outline-none border border-border-subtle focus:border-brand-500/50 transition placeholder-content-muted"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        resetAllFlags();
                        showToast?.('✨ All flags reset to default');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-surface-panel hover:bg-surface-hover text-content-secondary hover:text-white border border-border-subtle flex items-center gap-1.5 transition active:scale-95"
                    >
                      <RotateCcw size={13} />
                      <span>Reset All</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('about');
                        lockDevMode();
                        showToast?.('🔒 Developer Mode locked');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Lock size={13} />
                      <span>Lock Dev Mode</span>
                    </button>
                  </div>
                </div>

                {/* Flags Cards Grid */}
                <div className="space-y-3">
                  {flagSpecs
                    .filter((spec) => {
                      if (!flagsFilter.trim()) return true;
                      const q = flagsFilter.toLowerCase();
                      return (
                        spec.title.toLowerCase().includes(q) ||
                        spec.description.toLowerCase().includes(q) ||
                        spec.category.toLowerCase().includes(q)
                      );
                    })
                    .map((spec) => {
                      const currentValue = flags[spec.id] !== undefined ? flags[spec.id] : spec.default;
                      const isModified = currentValue !== spec.default;

                      return (
                        <div 
                          key={spec.id}
                          className={`p-4 rounded-xl border transition ${
                            isModified 
                              ? 'bg-surface-panel/90 border-brand-500/30' 
                              : 'bg-surface-panel/40 border-border-subtle'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-1 pr-2">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white tracking-tight">
                                  {spec.title}
                                </h4>
                                {isModified && (
                                  <span className="text-[9px] font-bold bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full uppercase">
                                    Modified
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-content-secondary leading-relaxed">
                                {spec.description}
                              </p>
                              <div className="text-[10px] text-content-muted font-semibold tracking-wider uppercase pt-0.5">
                                #{spec.id} • {spec.category}
                              </div>
                            </div>

                            <div className="shrink-0 sm:w-60">
                              {spec.type === 'select' ? (
                                <select
                                  value={currentValue}
                                  onChange={(e) => {
                                    const val = isNaN(Number(e.target.value)) || e.target.value === '' 
                                      ? e.target.value 
                                      : Number(e.target.value);
                                    setFlag(spec.id, val);
                                  }}
                                  className="w-full bg-surface-elevated hover:bg-surface-hover text-white text-xs font-semibold px-3 py-2 rounded-xl border border-border-medium outline-none cursor-pointer focus:border-brand-500 transition"
                                >
                                  {spec.options.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-surface-island text-white">
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : spec.type === 'boolean' ? (
                                <select
                                  value={currentValue ? 'true' : 'false'}
                                  onChange={(e) => setFlag(spec.id, e.target.value === 'true')}
                                  className="w-full bg-surface-elevated hover:bg-surface-hover text-white text-xs font-semibold px-3 py-2 rounded-xl border border-border-medium outline-none cursor-pointer focus:border-brand-500 transition"
                                >
                                  <option value="false" className="bg-surface-island text-white">Disabled</option>
                                  <option value="true" className="bg-surface-island text-brand-400 font-bold">Enabled</option>
                                </select>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Track & Artwork Repair Studio */}
                <div className="pt-6 border-t border-border-medium">
                  <DevRepairStudio showToast={showToast} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
