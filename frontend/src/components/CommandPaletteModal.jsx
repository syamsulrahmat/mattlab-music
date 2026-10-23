import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  User,
  Home,
  Heart,
  Disc3,
  Mic2,
  Megaphone,
  Settings,
  Users,
  RefreshCw,
  DownloadCloud,
  Bug,
  FlaskConical,
  Sparkles,
  PictureInPicture2,
  LogOut,
  Radio,
  Music,
  X,
  ChevronRight,
  Sliders,
  Tv,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useDevFlags } from '../context/FlagsContext';
import { usePlayer } from '../context/PlayerContext';

export const CommandPaletteModal = ({
  isOpen,
  onClose,
  onSelectUser,
  onSelectTab,
  onOpenBulletin,
  onOpenSettings,
  onOpenUserManagement,
  onOpenBugReport,
  onOpenFlags,
  onRequestMusic,
  onRefreshScan,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const { isDevUnlocked, flags, toggleComponentInspector } = useDevFlags();
  const { togglePiP, toggleKaraoke, isKaraokeMode } = usePlayer();

  const [query, setQuery] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Fetch users list when palette opens
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => setUsersList(data.users || []))
      .catch((err) => console.error('Failed to load users for command palette:', err));

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [isOpen]);

  // Master system commands list
  const systemCommands = useMemo(() => {
    const list = [
      // Navigation
      {
        id: 'nav_home',
        type: 'command',
        category: 'Navigation',
        title: 'Go to Home',
        subtitle: 'Navigate to Home dashboard and recommendations',
        shortcut: 'H',
        icon: Home,
        action: () => onSelectTab?.('home'),
      },
      {
        id: 'nav_music_search',
        type: 'command',
        category: 'Navigation',
        title: 'Open Music Search',
        subtitle: 'Search songs, albums, and artists in catalog',
        shortcut: 'S',
        icon: Search,
        action: () => {
          onClose();
          const searchInput = document.getElementById('global-search-input');
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        },
      },
      {
        id: 'nav_favorites',
        type: 'command',
        category: 'Navigation',
        title: 'Liked Songs',
        subtitle: 'View your library of liked songs',
        shortcut: '',
        icon: Heart,
        action: () => onSelectTab?.('favorites'),
      },
      {
        id: 'nav_albums',
        type: 'command',
        category: 'Navigation',
        title: 'Browse All Albums',
        subtitle: 'Explore full library album collection',
        shortcut: '',
        icon: Disc3,
        action: () => onSelectTab?.('albums'),
      },
      {
        id: 'nav_artists',
        type: 'command',
        category: 'Navigation',
        title: 'Browse All Artists',
        subtitle: 'Explore all artists and discographies',
        shortcut: '',
        icon: Mic2,
        action: () => onSelectTab?.('artists'),
      },

      // Audio & Interactive Tools
      {
        id: 'tool_bulletin',
        type: 'command',
        category: 'Tools & Features',
        title: 'Bulletin & Announcements',
        subtitle: 'Read system updates & leave community feedback',
        shortcut: 'Alt + B',
        icon: Megaphone,
        action: () => onOpenBulletin?.(),
      },
      {
        id: 'tool_karaoke',
        type: 'command',
        category: 'Tools & Features',
        title: `Toggle Karaoke Mode (${isKaraokeMode ? 'Turn Off' : 'Turn On'})`,
        subtitle: 'Isolate vocal or instrumental audio stems via Demucs AI',
        shortcut: 'Ctrl + Shift + L',
        icon: Mic2,
        action: () => toggleKaraoke?.(),
      },
      {
        id: 'tool_pip',
        type: 'command',
        category: 'Tools & Features',
        title: 'Picture-in-Picture Mini-Player',
        subtitle: 'Float a resizable mini-player on your desktop',
        shortcut: 'Ctrl + P',
        icon: PictureInPicture2,
        action: () => togglePiP?.(),
      },

      // Settings & Account
      {
        id: 'pref_settings',
        type: 'command',
        category: 'Settings',
        title: 'Settings & Preferences',
        subtitle: 'Audio quality, lyrics styling, themes, and shortcuts',
        shortcut: 'Ctrl + ,',
        icon: Settings,
        action: () => onOpenSettings?.('playback'),
      },
      {
        id: 'pref_account',
        type: 'command',
        category: 'Settings',
        title: 'Profile & Account Settings',
        subtitle: 'Change display name, avatar, and password',
        shortcut: '',
        icon: User,
        action: () => onOpenSettings?.('account'),
      },
      {
        id: 'pref_shortcuts',
        type: 'command',
        category: 'Settings',
        title: 'Keyboard Shortcuts Reference',
        subtitle: 'Cheat sheet of all app keyboard controls',
        shortcut: '?',
        icon: Sliders,
        action: () => onOpenSettings?.('shortcuts'),
      },
      {
        id: 'pref_bug_report',
        type: 'command',
        category: 'Support',
        title: 'Report an Issue / Bug',
        subtitle: 'Send feedback or report playback glitches to admin',
        shortcut: '',
        icon: Bug,
        action: () => onOpenBugReport?.(),
      },
    ];

    // Admin commands
    if (isAdmin) {
      list.push(
        {
          id: 'admin_users',
          type: 'command',
          category: 'Administration',
          title: 'User Management',
          subtitle: 'Create, modify, or remove user accounts',
          shortcut: '',
          icon: Users,
          action: () => onOpenUserManagement?.(),
        },
        {
          id: 'admin_rescan',
          type: 'command',
          category: 'Administration',
          title: 'Rescan Music Library',
          subtitle: 'Scan Unraid library storage for new audio files',
          shortcut: '',
          icon: RefreshCw,
          action: () => onRefreshScan?.(),
        },
        {
          id: 'admin_request',
          type: 'command',
          category: 'Administration',
          title: 'Request Music (Lidarr & Torrents)',
          subtitle: 'Search and import missing albums from Spotify / Deezer',
          shortcut: '',
          icon: DownloadCloud,
          action: () => onRequestMusic?.(''),
        }
      );
    }

    // Developer / Flags commands
    if (isDevUnlocked) {
      list.push(
        {
          id: 'dev_flags',
          type: 'command',
          category: 'Developer',
          title: 'Experimental Flags Dashboard',
          subtitle: 'Configure experimental feature toggles (mattlab://flags)',
          shortcut: 'Ctrl + Shift + D',
          icon: FlaskConical,
          action: () => onOpenFlags?.(),
        },
        {
          id: 'dev_inspector',
          type: 'command',
          category: 'Developer',
          title: 'Toggle Component Inspector',
          subtitle: `Inspect UI architecture & file paths (${(flags.component_inspector || 'off').toUpperCase()})`,
          shortcut: 'Alt + C',
          icon: Sparkles,
          action: () => toggleComponentInspector?.(),
        }
      );
    }

    // Log out
    list.push({
      id: 'auth_logout',
      type: 'command',
      category: 'Account',
      title: 'Log Out',
      subtitle: `Sign out of @${user?.username || 'user'}`,
      shortcut: '',
      icon: LogOut,
      action: () => logout?.(),
    });

    return list;
  }, [user, isAdmin, isDevUnlocked, flags, isKaraokeMode]);

  // Filtered Users
  const matchedUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usersList.slice(0, 5);
    return usersList.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.display_name && u.display_name.toLowerCase().includes(q))
    );
  }, [query, usersList]);

  // Filtered Commands
  const matchedCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return systemCommands;
    return systemCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.shortcut && c.shortcut.toLowerCase().includes(q))
    );
  }, [query, systemCommands]);

  // Flat linear navigable items list: Users first, then Commands
  const navigableItems = useMemo(() => {
    const items = [];
    matchedUsers.forEach((u) => items.push({ type: 'user', data: u }));
    matchedCommands.forEach((c) => items.push({ type: 'command', data: c }));
    return items;
  }, [matchedUsers, matchedCommands]);

  // Auto-scroll selected element into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`cp-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Reset index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeItem = (item) => {
    if (!item) return;
    onClose();
    if (item.type === 'user') {
      onSelectUser?.(item.data.id);
    } else if (item.type === 'command') {
      item.data.action?.();
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }

    if (navigableItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < navigableItems.length) {
        executeItem(navigableItems[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-elevated border border-border-medium rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-150 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search Input Bar ── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-medium bg-surface-island/60 shrink-0">
          <Search size={18} className="text-brand-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command or user (e.g. Matt, Ted, Settings, Bulletin)..."
            className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder:text-content-subtle outline-none font-medium"
            spellCheck={false}
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="text-content-muted hover:text-white p-1 rounded-full transition"
            >
              <X size={15} />
            </button>
          ) : (
            <span className="text-[11px] font-mono text-content-muted bg-surface-elevated px-2 py-0.5 rounded border border-border-subtle">
              Ctrl + K
            </span>
          )}
        </div>

        {/* ── Guidance Tip: Music Search vs Command Palette ── */}
        <div className="bg-surface-island/30 border-b border-border-subtle/50 px-4 py-1.5 flex items-center justify-between text-[11px] text-content-muted shrink-0">
          <span>Command Palette • Users, features & system actions</span>
          <span>
            Looking for songs? Press <kbd className="bg-surface-island px-1.5 py-0.2 rounded font-mono text-brand-400 font-bold border border-border-medium">S</kbd> for Music Search
          </span>
        </div>

        {/* ── Results List ── */}
        <div className="overflow-y-auto p-2 sm:p-3 space-y-4 flex-1">
          {/* User Profiles Section */}
          {matchedUsers.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-content-muted flex items-center gap-1.5">
                <User size={12} className="text-brand-400" />
                <span>Users & Profiles</span>
              </div>
              <div className="space-y-1">
                {matchedUsers.map((u, idx) => {
                  const globalIdx = idx;
                  const isSelected = selectedIndex === globalIdx;

                  return (
                    <div
                      key={u.id}
                      id={`cp-item-${globalIdx}`}
                      onClick={() => executeItem({ type: 'user', data: u })}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`px-3 py-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition shadow-sm ${
                        isSelected
                          ? 'bg-brand-500/20 border-brand-500/40 text-white'
                          : 'bg-surface-island/40 hover:bg-surface-island/70 border-border-subtle/50 text-content-primary'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <UserAvatar user={u} size="md" />
                          {u.is_listening && (
                            <span
                              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-surface-base"
                              title="Currently Listening"
                            />
                          )}
                        </div>
                        <div className="min-w-0 truncate">
                          <div className="font-bold text-xs sm:text-sm text-white truncate flex items-center gap-2">
                            <span>{u.display_name}</span>
                            <span className="text-[10px] text-content-muted font-mono font-normal">
                              @{u.username}
                            </span>
                            {u.role === 'admin' && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/15 text-brand-400 font-bold border border-brand-500/30">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-content-secondary truncate">
                            {u.is_listening ? (
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <Radio size={11} className="animate-pulse" />
                                <span>Currently listening to music</span>
                              </span>
                            ) : (
                              'View profile, listening activity, and public playlists'
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-content-muted bg-surface-elevated px-2 py-0.5 rounded font-medium border border-border-subtle hidden sm:inline">
                          View Profile
                        </span>
                        <ChevronRight size={14} className="text-content-muted" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commands & Actions Section */}
          {matchedCommands.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-content-muted flex items-center gap-1.5">
                <Sliders size={12} className="text-brand-400" />
                <span>Commands & Features</span>
              </div>
              <div className="space-y-1">
                {matchedCommands.map((cmd, idx) => {
                  const globalIdx = matchedUsers.length + idx;
                  const isSelected = selectedIndex === globalIdx;
                  const Icon = cmd.icon || Sparkles;

                  return (
                    <div
                      key={cmd.id}
                      id={`cp-item-${globalIdx}`}
                      onClick={() => executeItem({ type: 'command', data: cmd })}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`px-3 py-2 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-brand-500/20 border-brand-500/40 text-white'
                          : 'bg-surface-island/40 hover:bg-surface-island/70 border-border-subtle/50 text-content-primary'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                              : 'bg-surface-elevated text-content-secondary border-border-medium'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 truncate">
                          <div className="font-semibold text-xs sm:text-sm text-white truncate flex items-center gap-2">
                            <span>{cmd.title}</span>
                          </div>
                          <div className="text-[11px] text-content-secondary truncate">
                            {cmd.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {cmd.shortcut && (
                          <span className="text-[10px] font-mono text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-border-subtle">
                            {cmd.shortcut}
                          </span>
                        )}
                        <ChevronRight size={14} className="text-content-muted" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {navigableItems.length === 0 && (
            <div className="py-12 text-center text-content-muted space-y-2">
              <Search size={24} className="mx-auto text-content-subtle" />
              <p className="text-sm font-semibold text-white">No commands or users found for "{query}"</p>
              <p className="text-xs text-content-secondary max-w-sm mx-auto">
                Looking for a song, album, or artist? Press <kbd className="bg-surface-island px-1.5 py-0.5 rounded font-mono text-brand-400 font-bold">S</kbd> to search the music catalog!
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-2 border-t border-border-subtle bg-surface-island/60 flex items-center justify-between text-[11px] text-content-muted shrink-0">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-surface-elevated px-1.5 py-0.5 rounded border border-border-medium font-mono text-white">↑</kbd>{' '}
              <kbd className="bg-surface-elevated px-1.5 py-0.5 rounded border border-border-medium font-mono text-white">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="bg-surface-elevated px-1.5 py-0.5 rounded border border-border-medium font-mono text-white">↵</kbd> Select
            </span>
            <span>
              <kbd className="bg-surface-elevated px-1.5 py-0.5 rounded border border-border-medium font-mono text-white">Esc</kbd> Close
            </span>
          </div>
          <span className="font-mono text-content-subtle">
            {navigableItems.length} {navigableItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>
    </div>
  );
};
