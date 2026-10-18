import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Home, Search, X, RefreshCw, HardDrive, DownloadCloud, Users, LogOut, Settings, User, Bug } from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { SearchFloatingModal } from './SearchFloatingModal';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

export const TopBar = ({ 
  searchQuery, 
  setSearchQuery, 
  onClearSearch,
  onFocusSearch, 
  onGoHome, 
  stats, 
  onRefreshScan,
  onRequestMusic,
  onSelectAlbum,
  onSelectArtist,
  onContextMenu,
  onOpenUserManagement,
  onOpenSettings,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  hasNotifications = false,
}) => {
    const { user, isAdmin, logout } = useAuth();
  const { currentTrack, playTrack, togglePlay } = usePlayer();
  const [isScanning, setIsScanning] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isFloatingSearchOpen, setIsFloatingSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState({ tracks: [], albums: [], artists: [], correctedQuery: null });
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  const handleScanClick = async () => {
    setIsScanning(true);
    await onRefreshScan();
    setTimeout(() => setIsScanning(false), 2000);
  };

  // Live search debounced for floating search modal
  useEffect(() => {
    const q = searchQuery?.trim() || '';
    if (!q) {
      setSearchResults({ tracks: [], albums: [], artists: [], correctedQuery: null });
      setIsSearching(false);
      setSelectedIndex(0);
      setIsFloatingSearchOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults({
            tracks: Array.isArray(data.tracks) ? data.tracks.slice(0, 6) : [],
            albums: Array.isArray(data.albums) ? data.albums.slice(0, 4) : [],
            artists: Array.isArray(data.artists) ? data.artists.slice(0, 4) : [],
            primary_artist: data.primary_artist || null,
            match_type: data.match_type || 'general',
            correctedQuery: data.corrected_query || null,
          });
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('TopBar floating search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Linear list of navigable items for Up/Down arrow selection
  const navigableItems = useMemo(() => {
    const items = [];
    if (searchResults.primary_artist) {
      items.push({ type: 'artist', data: searchResults.primary_artist });
    }
    searchResults.tracks?.forEach((t) => items.push({ type: 'track', data: t }));
    searchResults.albums?.forEach((a) => items.push({ type: 'album', data: a }));
    searchResults.artists?.forEach((ar) => {
      if (!searchResults.primary_artist || ar.id !== searchResults.primary_artist.id) {
        items.push({ type: 'artist', data: ar });
      }
    });
    if (searchQuery?.trim()) {
      items.push({
        type: 'request',
        query: searchResults.correctedQuery || searchQuery.trim(),
      });
    }
    return items;
  }, [searchResults, searchQuery]);

  const executeSelectedItem = (item) => {
    if (!item) return;
    if (item.type === 'track') {
      if (currentTrack?.id === item.data.id) {
        togglePlay();
      } else {
        playTrack(item.data, searchResults.tracks);
      }
      // Keep search modal open so user can preview/play music until explicitly dismissed
    } else if (item.type === 'album') {
      onSelectAlbum?.(item.data.id);
      setIsFloatingSearchOpen(false);
    } else if (item.type === 'artist') {
      onSelectArtist?.(item.data.id);
      setIsFloatingSearchOpen(false);
    } else if (item.type === 'request') {
      onRequestMusic?.(item.query);
      setIsFloatingSearchOpen(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsFloatingSearchOpen(false);
      searchInputRef.current?.blur();
      return;
    }

    if (!isFloatingSearchOpen || navigableItems.length === 0) {
      if (e.key === 'ArrowDown' && searchQuery?.trim()) {
        e.preventDefault();
        setIsFloatingSearchOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < navigableItems.length) {
        executeSelectedItem(navigableItems[selectedIndex]);
      }
    }
  };

  return (
    <header className="h-16 bg-surface-base px-4 md:px-5 flex items-center justify-between gap-4 z-40 select-none shrink-0 border-b border-border-subtle">
      {/* Left: MattLab Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div 
          onClick={onGoHome}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
        >
          <MattLabLogo
            variant="badge"
            bgColor="var(--brand-primary)"
            color="var(--surface-base)"
            className="w-9 h-9 rounded-full shadow-md group-hover:scale-105 transition"
          />
          <span className="font-extrabold text-lg tracking-tight text-content-primary group-hover:text-brand-400 transition hidden sm:inline">
            MattLab Music
          </span>
        </div>
      </div>

      {/* Center: Circular Home Button + Capsule Search Input */}
      <div className="flex-1 max-w-xl mx-auto flex items-center gap-2.5 justify-center">
        {/* Circular Home button */}
        <button
          onClick={onGoHome}
          className="w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-hover text-content-primary flex items-center justify-center transition hover:scale-105 active:scale-95 shrink-0"
          title="Home"
        >
          <Home size={20} />
        </button>

        {/* Pill/Capsule Search Input: matching floating search dropdown width */}
        <div className="relative flex-1 flex items-center">
          <div className="absolute left-3.5 pointer-events-none text-content-secondary flex items-center">
            <Search size={18} />
          </div>
          <input
            id="global-search-input"
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) {
                setIsFloatingSearchOpen(true);
              } else {
                setIsFloatingSearchOpen(false);
              }
            }}
            onFocus={() => {
              if (searchQuery?.trim()) {
                setIsFloatingSearchOpen(true);
              }
              onFocusSearch?.();
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="What do you want to play?"
            className="w-full bg-surface-elevated hover:bg-surface-elevated2 focus:bg-surface-elevated2 text-content-primary pl-10 pr-9 py-2.5 rounded-full text-xs sm:text-sm font-medium outline-none border border-transparent focus:border-border-strong transition placeholder-content-secondary"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsFloatingSearchOpen(false);
                if (onClearSearch) {
                  onClearSearch();
                }
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 text-content-secondary hover:text-content-primary p-0.5 rounded-full"
              title="Clear Search"
            >
              <X size={16} />
            </button>
          )}

          {/* Self-Contained Floating Search Results Dropdown */}
          <SearchFloatingModal
            isOpen={isFloatingSearchOpen && Boolean(searchQuery?.trim())}
            onClose={() => setIsFloatingSearchOpen(false)}
            query={searchQuery}
            results={searchResults}
            isLoading={isSearching}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            onSelectTrack={(track) => {
              if (currentTrack?.id === track.id) {
                togglePlay();
              } else {
                playTrack(track, searchResults.tracks);
              }
              // Do not dismiss search modal yet; wait until user dismisses
            }}
            onSelectAlbum={(albumId) => {
              onSelectAlbum?.(albumId);
              setIsFloatingSearchOpen(false);
            }}
            onSelectArtist={(artistId) => {
              onSelectArtist?.(artistId);
              setIsFloatingSearchOpen(false);
            }}
            onRequestMusic={(q) => {
              onRequestMusic?.(q);
              setIsFloatingSearchOpen(false);
            }}
            onContextMenu={onContextMenu}
          />
        </div>
      </div>

      {/* Right: Unraid Sync Status + Rescan Button + User Profile Avatar */}
      <div className="flex items-center gap-3 shrink-0">
        {stats && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-content-secondary font-medium px-2 py-1 bg-surface-island rounded-full border border-border-subtle">
            <HardDrive size={13} className="text-brand-500" />
            <span>{stats.tracks.toLocaleString()} tracks</span>
            <span className="text-content-subtle">•</span>
            <span>{stats.total_duration_hours} hrs</span>
          </div>
        )}

        {/* Admin only: Request Music button */}
        {isAdmin && (
          <button
            onClick={onRequestMusic}
            className="bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 shadow-md shrink-0"
            title="Request Music via Torrent (Lidarr)"
          >
            <DownloadCloud size={14} className="stroke-[2.5]" />
            <span className="hidden sm:inline">Request</span>
          </button>
        )}

        {/* Admin only: Rescan library button */}
        {isAdmin && (
          <button
            onClick={handleScanClick}
            disabled={isScanning}
            className="bg-surface-elevated hover:bg-surface-hover text-content-primary text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
            title="Rescan Unraid Music Library"
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin text-brand-500' : 'text-content-secondary'} />
            <span className="hidden sm:inline">{isScanning ? 'Syncing...' : 'Rescan'}</span>
          </button>
        )}

        {/* User Profile Avatar & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="relative rounded-full hover:scale-105 active:scale-95 transition cursor-pointer"
            title={user ? `${user.display_name || user.username} (${user.role})` : 'Account'}
          >
            <UserAvatar user={user} size="md" />
            {hasNotifications && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-surface-base animate-pulse" />
            )}
          </button>

          {isUserMenuOpen && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsUserMenuOpen(false)} 
              />
              <div className="absolute right-0 mt-2 w-60 bg-surface-panel border border-border-medium rounded-xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3.5 py-2.5 border-b border-border-medium flex items-center gap-3">
                  <UserAvatar user={user} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-content-primary text-sm truncate">
                      {user?.display_name || user?.username}
                    </div>
                    <div className="text-content-secondary text-[11px] flex items-center justify-between mt-0.5">
                      <span className="truncate">@{user?.username}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
                        isAdmin ? 'bg-brand-500/20 text-brand-500' : 'bg-white/10 text-content-secondary'
                      }`}>
                        {isAdmin ? 'Admin' : 'User'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSettings?.('account');
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center gap-2.5 transition"
                >
                  <User size={15} className="text-brand-500" />
                  <span>Profile & Account</span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSettings?.('issues');
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Bug size={15} className="text-amber-400" />
                    <span>Issues & Notes</span>
                  </div>
                  {hasNotifications && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Update
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSettings?.('shortcuts');
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center gap-2.5 transition"
                >
                  <Settings size={15} className="text-content-secondary" />
                  <span>Settings</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenUserManagement?.();
                    }}
                    className="w-full text-left px-3 py-2.5 text-white hover:bg-white/10 flex items-center gap-2.5 transition"
                  >
                    <Users size={15} className="text-brand-500" />
                    <span>User Management</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2.5 text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition"
                >
                  <LogOut size={15} />
                  <span>Log Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
