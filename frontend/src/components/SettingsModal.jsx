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
  PictureInPicture2
} from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

const SHORTCUT_CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'playback', label: 'Playback & Audio' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'playlists', label: 'Playlists & Selection' },
  { id: 'interface', label: 'Interface & Views' },
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
    ],
  },
  {
    category: 'navigation',
    categoryLabel: 'Navigation',
    items: [
      {
        title: 'Quick Search & Command Palette',
        description: 'Instantly search tracks, albums, artists, or request missing music',
        combos: [['Ctrl', 'K'], ['⌘', 'K']],
      },
      {
        title: 'Open Settings & Shortcuts',
        description: 'Opens this settings modal and keyboard shortcut cheat-sheet',
        combos: [['Ctrl', ','], ['?']],
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
        combos: [['Click Mini-Player Icon']],
      },
      {
        title: 'Synced Lyrics Immersion',
        description: 'Full-screen karaoke synchronized lyric line tracker with glowing glow',
        combos: [['Click Lyrics Mic Icon']],
      },
      {
        title: 'Queue Island Panel',
        description: 'Toggle the right-side play queue context drawer on and off',
        combos: [['Click Queue Icon']],
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
}) => {
  const { 
    user, 
    isAdmin, 
    updateProfile, 
    changeOwnPassword, 
    uploadAvatar, 
    removeAvatar 
  } = useAuth();
  const { 
    preloadCount, 
    setPreloadCount, 
    preloadedTrackIds, 
    clearPreloadCache,
    pipEngine,
    setPipEngine,
    togglePiP,
    isPiPActive
  } = usePlayer();
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'account');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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
        className="w-full max-w-4xl bg-surface-island border border-border-medium rounded-2xl shadow-2xl flex flex-col h-[85vh] max-h-[760px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-medium bg-surface-panel/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center shadow-inner">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary tracking-tight flex items-center gap-2">
                <span>Settings</span>
                <span className="text-[10px] font-semibold bg-white/10 text-content-secondary px-2 py-0.5 rounded-full uppercase tracking-wider">
                  MattLab Music
                </span>
              </h2>
              <p className="text-xs text-content-secondary mt-0.5">
                Keyboard shortcuts, interface preferences, and system telemetry
              </p>
            </div>
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
          <div className="w-full md:w-56 bg-surface-panel border-b md:border-b-0 md:border-r border-border-medium p-3 flex md:flex-col gap-1.5 shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left shrink-0 md:shrink md:w-full ${
                activeTab === 'account'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <User size={16} />
              <span>Profile & Account</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left shrink-0 md:shrink md:w-full ${
                activeTab === 'shortcuts'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Keyboard size={16} />
              <span>Keyboard Shortcuts</span>
            </button>

            <button
              onClick={() => setActiveTab('playback')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left shrink-0 md:shrink md:w-full ${
                activeTab === 'playback'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Volume2 size={16} />
              <span>Audio & Playback</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left shrink-0 md:shrink md:w-full ${
                activeTab === 'about'
                  ? 'bg-brand-500 text-black shadow-md font-bold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`}
            >
              <Info size={16} />
              <span>About & System</span>
            </button>

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
                              className="flex items-center justify-between p-3 rounded-xl bg-surface-panel hover:bg-surface-elevated border border-border-subtle transition group"
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
              <div className="space-y-6">
                {/* Section Header Banner */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center shrink-0">
                      <Volume2 size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Audio & Playback</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          preloadCount === 0 
                            ? 'bg-white/10 text-content-muted' 
                            : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                        }`}>
                          {preloadCount === 0 ? 'Direct Streaming' : `${preloadCount} Song Preload`}
                        </span>
                      </h3>
                      <p className="text-xs text-content-secondary mt-0.5">
                        Configure background track caching, gapless buffering, and memory optimization
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs self-start sm:self-auto bg-surface-island px-3 py-1.5 rounded-xl border border-border-subtle">
                    <div className={`w-2 h-2 rounded-full ${
                      preloadCount > 0 ? 'bg-brand-500 animate-pulse' : 'bg-content-subtle'
                    }`} />
                    <span className="text-content-secondary font-medium">
                      {preloadedTrackIds?.size || 0} track{preloadedTrackIds?.size === 1 ? '' : 's'} in RAM
                    </span>
                  </div>
                </div>

                {/* Picture-in-Picture (PiP) Display Engine Card */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <PictureInPicture2 size={16} className="text-brand-500" />
                        <span>Picture-in-Picture (PiP) Display Engine</span>
                      </h4>
                      <p className="text-xs text-content-muted mt-0.5">
                        Select your preferred floating player window style when multitasking across desktop apps.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        pipEngine === 'interactive'
                          ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                          : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                      }`}>
                        {pipEngine === 'interactive' ? 'Document PiP (Interactive)' : 'Video PiP (16:9 Borderless)'}
                      </span>
                    </div>
                  </div>

                  {/* Dual Mode Selectable Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Option 1: Interactive Mini-Player (Main Branch Document PiP) */}
                    <button
                      type="button"
                      onClick={() => setPipEngine('interactive')}
                      className={`p-4 rounded-xl text-left border transition flex flex-col justify-between relative group ${
                        pipEngine === 'interactive'
                          ? 'bg-brand-500/10 border-brand-500 text-white shadow-sm ring-1 ring-brand-500/40'
                          : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">Interactive Mini-Player</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                              DEFAULT
                            </span>
                          </div>
                          {pipEngine === 'interactive' && (
                            <Check size={14} className="text-brand-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-content-muted leading-relaxed mb-3">
                          Ultra-compact HTML5 window with live synced lyrics, click-to-play buttons, track scrubber, volume control, and flexible micro-strip resizing (down to 185×65px).
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border-subtle text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Ultra-Compact (185×65)</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Clickable Controls</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Live Lyrics Scroll</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Frameless Titlebar</span>
                      </div>
                    </button>

                    {/* Option 2: YouTube-Style Frameless (16:9 Video Canvas PiP) */}
                    <button
                      type="button"
                      onClick={() => setPipEngine('video')}
                      className={`p-4 rounded-xl text-left border transition flex flex-col justify-between relative group ${
                        pipEngine === 'video'
                          ? 'bg-purple-500/10 border-purple-500 text-white shadow-sm ring-1 ring-purple-500/40'
                          : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">YouTube-Style Frameless</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              16:9 CINEMATIC
                            </span>
                          </div>
                          {pipEngine === 'video' && (
                            <Check size={14} className="text-purple-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-content-muted leading-relaxed mb-3">
                          100% borderless floating card with album cover art, ambient glow, 2-line live lyrics, and Chrome's native OS hover controls with draggable timeline scrubber.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border-subtle text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">16:9 Card (640×360)</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Zero Browser Titlebar</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">Album Cover Glow</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-content-secondary border border-border-subtle">OS Hover Scrubber</span>
                      </div>
                    </button>
                  </div>

                  {/* Dynamic Explanation & Quick Test Action */}
                  <div className="p-3.5 rounded-xl bg-surface-island border border-border-subtle text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Sparkles size={15} className="text-brand-500 shrink-0 mt-0.5" />
                      <p className="text-content-secondary leading-relaxed">
                        {pipEngine === 'interactive' ? (
                          <>
                            <strong className="text-white">Main Branch PiP: </strong>
                            Uses Document PiP API. Allows shrinking all the way down to a tiny micro-bar while keeping full in-window interactive control.
                          </>
                        ) : (
                          <>
                            <strong className="text-white">YouTube Style PiP: </strong>
                            Uses HTML5 Video PiP API. Composited directly by the OS with zero browser title bar, high-res cover art, and native hover scrub controls.
                          </>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={togglePiP}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-border-medium transition shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <PictureInPicture2 size={13} />
                      <span>{isPiPActive ? 'Close PiP' : 'Launch PiP Preview'}</span>
                    </button>
                  </div>
                </div>

                {/* Preload Configuration Card */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap size={16} className="text-brand-500" />
                        <span>Upcoming Songs Preload Window</span>
                      </h4>
                      <p className="text-xs text-content-muted mt-0.5">
                        Pre-buffers upcoming queue tracks in background memory to guarantee zero latency and gapless song transitions.
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-brand-400 font-mono">
                        {preloadCount === 0 ? '0' : preloadCount}
                      </span>
                      <span className="text-xs text-content-muted ml-1">
                        {preloadCount === 1 ? 'song' : 'songs'}
                      </span>
                    </div>
                  </div>

                  {/* Preset Quick-Buttons */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-content-muted mb-2.5">
                      Quick Presets
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { value: 0, label: '0 (Off)', desc: 'Data Saver' },
                        { value: 1, label: '1 Song', desc: 'Minimal RAM' },
                        { value: 3, label: '3 Songs', desc: 'Balanced / Default' },
                        { value: 5, label: '5 Songs', desc: 'High Buffer' },
                        { value: 10, label: '10 Songs', desc: 'Max Cache' },
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => setPreloadCount(preset.value)}
                          className={`p-2.5 rounded-xl text-left border transition flex flex-col ${
                            preloadCount === preset.value
                              ? 'bg-brand-500/15 border-brand-500 text-white shadow-sm ring-1 ring-brand-500/50'
                              : 'bg-surface-island border-border-subtle hover:border-border-strong text-content-secondary hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold flex items-center justify-between">
                            <span>{preset.label}</span>
                            {preloadCount === preset.value && (
                              <Check size={13} className="text-brand-500" />
                            )}
                          </div>
                          <span className="text-[10px] text-content-subtle mt-1">{preset.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Range Slider */}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-content-muted font-medium">Fine-tune buffer size</span>
                      <span className="font-mono text-white font-bold bg-surface-island px-2.5 py-0.5 rounded border border-border-medium">
                        {preloadCount === 0 ? 'Disabled (Direct Stream)' : `Preloading next ${preloadCount} song${preloadCount > 1 ? 's' : ''}`}
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={preloadCount}
                      onChange={(e) => setPreloadCount(Number(e.target.value))}
                      className="w-full h-2 bg-surface-elevated2 rounded-lg appearance-none cursor-pointer accent-brand-500 focus:outline-none"
                    />

                    <div className="flex justify-between text-[10px] font-mono text-content-subtle px-1">
                      <span>0 (Off)</span>
                      <span>1</span>
                      <span>2</span>
                      <span>3 (Default)</span>
                      <span>5</span>
                      <span>7</span>
                      <span>10 (Max)</span>
                    </div>
                  </div>

                  {/* Dynamic Recommendation & Insight */}
                  <div className="p-3.5 rounded-xl bg-surface-island border border-border-subtle text-xs flex items-start gap-3">
                    <Gauge size={16} className="text-brand-500 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      {preloadCount === 0 && (
                        <p className="text-content-secondary">
                          <strong className="text-white">Data Saver Mode: </strong>
                          Upcoming tracks are not buffered in advance. Audio streams strictly on demand. Ideal for metered network connections or devices with low available memory.
                        </p>
                      )}
                      {preloadCount >= 1 && preloadCount <= 3 && (
                        <p className="text-content-secondary">
                          <strong className="text-white">Recommended Balanced Profile: </strong>
                          Buffers the next {preloadCount} upcoming song{preloadCount > 1 ? 's' : ''} sequentially in the background. Provides instant, gapless song playback with negligible RAM usage.
                        </p>
                      )}
                      {preloadCount > 3 && (
                        <p className="text-content-secondary">
                          <strong className="text-white">High Resilience Buffer: </strong>
                          Buffers up to {preloadCount} upcoming tracks. Ideal for preventing audio pauses if MattLab Unraid mechanical hard drives spin down, or for listening with patchy network connections.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Memory & Cache Purge Tool */}
                <div className="p-5 rounded-2xl bg-surface-panel border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Trash2 size={16} className="text-content-muted" />
                      <span>Purge Preload Cache & Memory</span>
                    </h4>
                    <p className="text-xs text-content-muted mt-0.5 max-w-lg">
                      Immediately revokes Blob URLs and clears the browser CacheStorage API table to release all allocated memory.
                    </p>
                  </div>

                  <button
                    onClick={handleClearCache}
                    disabled={clearingCache}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition shrink-0 ${
                      cacheClearedSuccess
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-border-medium'
                    }`}
                  >
                    {cacheClearedSuccess ? (
                      <>
                        <Check size={14} className="text-brand-500" />
                        <span>Cache Cleared!</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        <span>{clearingCache ? 'Clearing...' : 'Clear Audio Cache'}</span>
                      </>
                    )}
                  </button>
                </div>
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
                        <span className="text-xs font-bold bg-brand-500 text-black px-2 py-0.5 rounded-full">
                          v1.0.0
                        </span>
                      </h3>
                      <p className="text-xs text-content-secondary mt-1 max-w-md">
                        Self-hosted streaming ecosystem with lossless local playback, Spotify chart synchronization, and automated media acquisition.
                      </p>
                    </div>
                  </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};
