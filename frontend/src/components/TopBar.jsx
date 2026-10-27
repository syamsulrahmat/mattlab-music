import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Home, Search, X, RefreshCw, HardDrive, DownloadCloud, Users, LogOut, Settings, User, Bug, Megaphone, Minus, Square, Copy } from 'lucide-react';
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
  onOpenBulletin,
  bulletinUnreadCount = 0,
  onSelectUser,
}) => {
    const { user, isAdmin, logout } = useAuth();
  const { currentTrack, playTrack, togglePlay } = usePlayer();
  const [isScanning, setIsScanning] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isFloatingSearchOpen, setIsFloatingSearchOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(true);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI?.isMaximized?.().then((max) => {
      setIsMaximized(Boolean(max));
    }).catch(() => {});

    const unsub = window.electronAPI?.onMaximizeStatus?.((max) => {
      setIsMaximized(Boolean(max));
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [isElectron]);

  // Touch swipe-down to dismiss gesture for mobile avatar user menu sheet
  const userMenuTouchStartY = useRef(0);
  const userMenuTouchStartX = useRef(0);
  const userMenuTouchCurrentY = useRef(0);
  const userMenuHasDragged = useRef(false);
  const userMenuListRef = useRef(null);
  const [userMenuDragOffset, setUserMenuDragOffset] = useState(0);
  const [isUserMenuDragging, setIsUserMenuDragging] = useState(false);

  useEffect(() => {
    if (!isUserMenuOpen) {
      setUserMenuDragOffset(0);
      setIsUserMenuDragging(false);
      userMenuHasDragged.current = false;
    }
  }, [isUserMenuOpen]);

  const handleUserMenuTouchStart = (e) => {
    userMenuTouchStartY.current = e.touches[0].clientY;
    userMenuTouchStartX.current = e.touches[0].clientX;
    userMenuTouchCurrentY.current = e.touches[0].clientY;
    userMenuHasDragged.current = false;
    setIsUserMenuDragging(true);
  };

  const handleUserMenuTouchMove = (e) => {
    if (!isUserMenuDragging) return;
    userMenuTouchCurrentY.current = e.touches[0].clientY;
    const diffY = userMenuTouchCurrentY.current - userMenuTouchStartY.current;
    const diffX = Math.abs(e.touches[0].clientX - userMenuTouchStartX.current);

    if (userMenuListRef.current && userMenuListRef.current.scrollTop > 0) {
      return;
    }

    if (diffY > 8 && diffY > diffX) {
      userMenuHasDragged.current = true;
      setUserMenuDragOffset(diffY);
    }
  };

  const handleUserMenuTouchEnd = () => {
    if (!isUserMenuDragging) return;
    setIsUserMenuDragging(false);
    if (userMenuDragOffset > 80) {
      setIsUserMenuOpen(false);
    } else {
      setUserMenuDragOffset(0);
    }
    setTimeout(() => {
      userMenuHasDragged.current = false;
    }, 150);
  };
  const [searchResults, setSearchResults] = useState({
    tracks: [],
    albums: [],
    artists: [],
    trending_tracks: [],
    top_result: null,
    primary_artist: null,
    correctedQuery: null,
  });
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
      setSearchResults({
        tracks: [],
        albums: [],
        artists: [],
        trending_tracks: [],
        top_result: null,
        primary_artist: null,
        correctedQuery: null,
      });
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
            top_result: data.top_result || null,
            trending_tracks: Array.isArray(data.trending_tracks) ? data.trending_tracks : [],
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
    const topResult =
      searchResults.top_result ||
      (searchResults.primary_artist ? { type: 'artist', ...searchResults.primary_artist } : null);

    if (topResult) {
      if (topResult.type === 'track') {
        items.push({ type: 'top_track', data: topResult });
      } else if (topResult.type === 'artist') {
        items.push({ type: 'artist', data: topResult });
      }
    }

    const filteredTracks = (searchResults.tracks || []).filter(
      (t) => !(topResult?.type === 'track' && topResult.id === t.id)
    );
    filteredTracks.forEach((t) => items.push({ type: 'track', data: t }));

    const filteredTrending = (searchResults.trending_tracks || [])
      .slice(0, 4)
      .filter(
        (t) =>
          !(
            topResult?.type === 'track' &&
            (topResult.spotify_id === t.spotify_id || (topResult.id && topResult.id === t.id))
          )
      );
    filteredTrending.forEach((t) => items.push({ type: 'trending_track', data: t }));

    searchResults.albums?.forEach((a) => items.push({ type: 'album', data: a }));

    const topArtistId =
      topResult?.type === 'artist' ? topResult.id : searchResults.primary_artist?.id;
    searchResults.artists?.forEach((ar) => {
      if (ar.id !== topArtistId) {
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
    if (item.type === 'top_track' || item.type === 'track' || item.type === 'trending_track') {
      const track = item.data;
      if (track.in_library || track.id) {
        if (currentTrack?.id === track.id) {
          togglePlay();
        } else {
          playTrack(track, searchResults.tracks, { isSearchPlay: true });
        }
      } else {
        onRequestMusic?.(`${track.artist_name} - ${track.title}`);
        setIsFloatingSearchOpen(false);
      }
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
    <header 
      data-dev-component="TopBar"
      data-dev-file="src/components/TopBar.jsx"
      data-dev-desc="Header bar with branding, search input, library statistics, and profile menu"
      className="bg-black md:bg-surface-base shrink-0 z-40 select-none border-b-0 md:border-b md:border-border-subtle safe-top-pt"
      style={{ 
        paddingTop: 'env(safe-area-inset-top, 0px)',
        WebkitAppRegion: isElectron ? 'drag' : undefined,
      }}
    >
      {/* Notch & Status Bar Safe Area Spacer (crisp solid background without overlay blur) */}
      <div 
        className="w-full bg-black shrink-0 safe-top-spacer md:hidden" 
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />

      {/* Main TopBar Content Bar (Fixed 56px on mobile, 64px on desktop) */}
      <div className="h-14 md:h-16 px-4 md:px-5 flex items-center justify-between gap-4">
        {/* Left: MattLab Brand */}
        <div 
          className="flex items-center gap-3 shrink-0"
          style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined }}
        >
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
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-content-primary group-hover:text-brand-400 transition">
              MattLab Music
            </span>
          </div>
        </div>

        {/* Center: Circular Home Button + Capsule Search Input (Desktop/Tablet) */}
        <div 
          className="hidden sm:flex flex-1 max-w-xl mx-auto items-center gap-2.5 justify-center"
          style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined }}
        >
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
                playTrack(track, searchResults.tracks, { isSearchPlay: true });
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

      {/* Right: Bulletin & Announcements + User Profile Avatar + Electron Window Controls */}
      <div 
        className="flex items-center gap-2.5 sm:gap-3 shrink-0"
        style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined }}
      >
        {/* Bulletin Button */}
        <button
          onClick={onOpenBulletin}
          className="relative bg-surface-elevated hover:bg-surface-hover text-content-primary p-2 sm:px-3 sm:py-2 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 shadow-sm"
          title="Bulletin & Announcements"
        >
          <Megaphone size={14} className={bulletinUnreadCount > 0 ? "text-brand-400" : "text-content-secondary"} />
          <span className="hidden sm:inline text-xs font-semibold">Bulletin</span>
          {bulletinUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-brand-500 text-black text-[10px] font-extrabold shadow-md ring-2 ring-surface-base animate-pulse">
              {bulletinUnreadCount}
            </span>
          )}
        </button>

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
              {/* Mobile Bottom Sheet (< md) rendered in portal to escape all container stacking contexts */}
              {createPortal(
                <div className="md:hidden">
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" 
                    onClick={() => setIsUserMenuOpen(false)} 
                  />
                  {/* Bottom Sheet */}
                  <div 
                    style={{
                      transform: `translateY(${userMenuDragOffset}px)`,
                    }}
                    className="fixed inset-x-0 bottom-0 z-[101] bg-surface-base backdrop-blur-2xl rounded-t-3xl border-t border-border-subtle shadow-2xl max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] transition-transform duration-150 ease-out animate-in slide-in-from-bottom-full duration-300"
                  >
                    {/* Grab Handle & Header Area (Swipe Down Anchor) */}
                    <div 
                      onTouchStart={handleUserMenuTouchStart}
                      onTouchMove={handleUserMenuTouchMove}
                      onTouchEnd={handleUserMenuTouchEnd}
                      className="cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="w-full flex justify-center pt-3 pb-1">
                        <div className="w-12 h-1.5 bg-neutral-600/60 rounded-full" />
                      </div>

                      {/* Profile Header */}
                      <div
                        onClick={() => {
                          if (userMenuHasDragged.current) return;
                          if (user?.id) {
                            setIsUserMenuOpen(false);
                            onSelectUser?.(user.id);
                          }
                        }}
                        className="px-5 py-3 border-b border-border-subtle flex items-center justify-between cursor-pointer active:bg-white/5 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar user={user} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-content-primary text-base truncate">
                              {user?.display_name || user?.username}
                            </div>
                            <div className="text-content-secondary text-xs flex items-center gap-2 mt-0.5">
                              <span className="truncate">@{user?.username}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                isAdmin ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-surface-elevated text-content-secondary'
                              }`}>
                                {isAdmin ? 'Admin' : 'User'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div 
                      ref={userMenuListRef}
                      onTouchStart={handleUserMenuTouchStart}
                      onTouchMove={handleUserMenuTouchMove}
                      onTouchEnd={handleUserMenuTouchEnd}
                      onClickCapture={(e) => {
                        if (userMenuHasDragged.current || userMenuDragOffset > 5) {
                          e.stopPropagation();
                          e.preventDefault();
                        }
                      }}
                      className="p-3 space-y-1"
                    >
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          if (user?.id) onSelectUser?.(user.id);
                        }}
                        className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center gap-3 transition text-sm font-medium"
                      >
                        <User size={18} className="text-brand-500" />
                        <span>My Public Profile</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenBulletin?.();
                        }}
                        className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center justify-between transition text-sm font-medium"
                      >
                        <div className="flex items-center gap-3">
                          <Megaphone size={18} className="text-brand-500" />
                          <span>Bulletin & Announcements</span>
                        </div>
                        {bulletinUnreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500 text-black">
                            {bulletinUnreadCount}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onRequestMusic?.();
                        }}
                        className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center justify-between transition text-sm font-medium"
                      >
                        <div className="flex items-center gap-3">
                          <DownloadCloud size={18} className="text-brand-500" />
                          <span>Request & Download Music</span>
                        </div>
                        <span className="text-[10px] font-semibold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                          Torrent + HQ
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenSettings?.('account');
                        }}
                        className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center gap-3 transition text-sm font-medium"
                      >
                        <Settings size={18} className="text-neutral-400" />
                        <span>Account Settings</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenSettings?.('issues');
                        }}
                        className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center justify-between transition text-sm font-medium"
                      >
                        <div className="flex items-center gap-3">
                          <Bug size={18} className="text-amber-400" />
                          <span>Issues & Notes</span>
                        </div>
                        {hasNotifications && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Update
                          </span>
                        )}
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenUserManagement?.();
                          }}
                          className="w-full text-left px-4 py-3 text-white rounded-xl active:bg-white/10 flex items-center gap-3 transition text-sm font-medium"
                        >
                          <Users size={18} className="text-brand-500" />
                          <span>User Management</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-3 text-red-400 rounded-xl active:bg-red-500/10 flex items-center gap-3 transition text-sm font-medium"
                      >
                        <LogOut size={18} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

              {/* Desktop Floating Dropdown (>= md) */}
              <div className="hidden md:block absolute right-0 mt-2 w-60 bg-surface-panel border border-border-medium rounded-xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div
                  onClick={() => {
                    if (user?.id) {
                      setIsUserMenuOpen(false);
                      onSelectUser?.(user.id);
                    }
                  }}
                  className="px-3.5 py-2.5 border-b border-border-medium flex items-center gap-3 cursor-pointer hover:bg-white/5 transition group/header"
                  title="View your public profile"
                >
                  <UserAvatar user={user} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-content-primary text-sm truncate group-hover/header:text-brand-400 transition">
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
                    if (user?.id) onSelectUser?.(user.id);
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center gap-2.5 transition"
                >
                  <User size={15} className="text-brand-500" />
                  <span>My Public Profile</span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenBulletin?.();
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Megaphone size={15} className="text-brand-500" />
                    <span>Bulletin & Announcements</span>
                  </div>
                  {bulletinUnreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-brand-500 text-black">
                      {bulletinUnreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onRequestMusic?.();
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2.5">
                    <DownloadCloud size={15} className="text-brand-500" />
                    <span>Request Music</span>
                  </div>
                  <span className="text-[9px] font-semibold text-brand-500 bg-brand-500/10 px-1.5 py-0.2 rounded-full border border-brand-500/20">
                    HQ
                  </span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSettings?.('account');
                  }}
                  className="w-full text-left px-3 py-2 text-content-primary hover:bg-white/10 flex items-center gap-2.5 transition"
                >
                  <Settings size={15} className="text-content-secondary" />
                  <span>Account Settings</span>
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

        {/* Spotify-Style Frameless Window Controls (Only visible inside Electron) */}
        {isElectron && (
          <div className="hidden sm:flex items-center ml-2 border-l border-white/10 pl-2">
            {/* Minimize */}
            <button
              onClick={() => window.electronAPI?.minimizeWindow?.()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-content-secondary hover:text-white hover:bg-white/10 transition active:scale-95"
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            {/* Maximize / Restore */}
            <button
              onClick={() => window.electronAPI?.toggleMaximizeWindow?.()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-content-secondary hover:text-white hover:bg-white/10 transition active:scale-95"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
            </button>
            {/* Close (Hide to Tray) */}
            <button
              onClick={() => window.electronAPI?.closeWindow?.()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-content-secondary hover:text-white hover:bg-red-600 transition active:scale-95"
              title="Close to Tray"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
};
