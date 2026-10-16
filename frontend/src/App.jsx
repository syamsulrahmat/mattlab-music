import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { LibrarySidebar } from './components/LibrarySidebar';
import { QueueIsland } from './components/QueueIsland';
import { HomeShelves } from './components/HomeShelves';
import { AlbumGrid } from './components/AlbumGrid';
import { AlbumDetail } from './components/AlbumDetail';
import { ArtistsView } from './components/ArtistsView';
import { ArtistDetail } from './components/ArtistDetail';
import { SearchView } from './components/SearchView';
import { FavoritesView } from './components/FavoritesView';
import { PlaylistDetail } from './components/PlaylistDetail';
import { LyricsView } from './components/LyricsView';
import { ContextMenu } from './components/ContextMenu';
import { PlayerBar } from './components/PlayerBar';
import { FloatingMiniPlayer } from './components/FloatingMiniPlayer';
import { MobileNav } from './components/MobileNav';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { CreatePlaylistModal } from './components/CreatePlaylistModal';
import { ImportSpotifyModal } from './components/ImportSpotifyModal';
import { RequestMusicModal } from './components/RequestMusicModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { SetupAdminModal } from './components/SetupAdminModal';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmModal } from './components/ConfirmModal';
import { PromptModal } from './components/PromptModal';
import { MattLabLogo } from './components/MattLabLogo';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { AuthProvider, useAuth } from './context/AuthContext';

const MainAppContent = () => {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState('home');
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');

  // Layout & Context States
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false);
  const [modalTrack, setModalTrack] = useState(null);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isImportSpotifyOpen, setIsImportSpotifyOpen] = useState(false);
  const [isRequestMusicOpen, setIsRequestMusicOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [requestMusicInitialQuery, setRequestMusicInitialQuery] = useState('');
  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('account');

  const handleOpenSettings = (tab = 'account') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // In-app Modal Confirm & Prompt States
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [isDeletingPlaylist, setIsDeletingPlaylist] = useState(false);
  const [playlistToRename, setPlaylistToRename] = useState(null);
  const [isRenamingPlaylist, setIsRenamingPlaylist] = useState(false);
  const [playlistToTakeOwnership, setPlaylistToTakeOwnership] = useState(null);
  const [isTakingOwnership, setIsTakingOwnership] = useState(false);
  const [playlistRefreshTrigger, setPlaylistRefreshTrigger] = useState(0);

  // Authentication Context
  const { user, isAdmin, isAuthenticated, setupRequired, isLoading: isAuthLoading } = useAuth();

  const handleOpenRequestMusic = (initialQuery = '') => {
    setRequestMusicInitialQuery(initialQuery);
    setIsRequestMusicOpen(true);
  };

  // History stack for Back/Forward navigation
  const [history, setHistory] = useState([
    { tab: 'home', albumId: null, artistId: null, playlistId: null, searchQuery: '', isLyricsOpen: false }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'track',
    data: null,
  });

  const {
    currentTrack,
    isPlaying,
    togglePlay,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    isMiniPlayerOpen,
    setIsMiniPlayerOpen,
    toastMessage,
    showToast,
  } = usePlayer();

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const fetchAlbums = async () => {
    setIsLoadingAlbums(true);
    try {
      const res = await fetch('/api/albums?limit=200');
      const data = await res.json();
      setAlbums(data.items || []);
    } catch (err) {
      console.error('Failed to load albums:', err);
    } finally {
      setIsLoadingAlbums(false);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      const data = await res.json();
      setPlaylists(data.items || []);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    }
  };

  const previousUserIdRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      if (previousUserIdRef.current !== user.id) {
        previousUserIdRef.current = user.id;
        setSelectedPlaylistId(null);
        if (activeTab === 'playlist') {
          setActiveTab('home');
        }
      }
      fetchStats();
      fetchAlbums();
      fetchPlaylists();
    } else if (!isAuthenticated) {
      previousUserIdRef.current = null;
      setPlaylists([]);
      setSelectedPlaylistId(null);
      if (activeTab === 'playlist') {
        setActiveTab('home');
      }
    }
  }, [isAuthenticated, user?.id, activeTab]);

  // Centralized Navigation Dispatcher
  const navigateTo = useCallback((nextState) => {
    const fullState = {
      tab: nextState.tab || 'home',
      albumId: nextState.albumId !== undefined ? nextState.albumId : null,
      artistId: nextState.artistId !== undefined ? nextState.artistId : null,
      playlistId: nextState.playlistId !== undefined ? nextState.playlistId : null,
      searchQuery: nextState.searchQuery !== undefined ? nextState.searchQuery : '',
      isLyricsOpen: Boolean(nextState.isLyricsOpen),
    };

    setHistory((prev) => {
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, fullState];
    });
    setHistoryIndex((prev) => prev + 1);

    setActiveTab(fullState.tab);
    setSelectedAlbumId(fullState.albumId);
    setSelectedArtistId(fullState.artistId);
    setSelectedPlaylistId(fullState.playlistId);
    setSearchQuery(fullState.searchQuery);
    setIsLyricsOpen(fullState.isLyricsOpen);
  }, [historyIndex]);

  const applyHistoryState = useCallback((stateObj) => {
    setActiveTab(stateObj.tab);
    setSelectedAlbumId(stateObj.albumId);
    setSelectedArtistId(stateObj.artistId);
    setSelectedPlaylistId(stateObj.playlistId);
    setSearchQuery(stateObj.searchQuery);
    setIsLyricsOpen(stateObj.isLyricsOpen);
  }, []);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleGoBack = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      applyHistoryState(history[nextIdx]);
    }
  }, [historyIndex, history, applyHistoryState]);

  const handleGoForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      applyHistoryState(history[nextIdx]);
    }
  }, [historyIndex, history, applyHistoryState]);

  // Global Keyboard & Mouse Button Event Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global Command Palette / Quick Search Modal: Ctrl + K or Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Do NOT intercept typing when the user is focused on any form input or editable field
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
        e.target.isContentEditable ||
        e.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      // Settings & Keyboard Shortcuts: Ctrl + , or ?
      if (((e.ctrlKey || e.metaKey) && e.key === ',') || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?')) {
        e.preventDefault();
        setSettingsInitialTab('shortcuts');
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // History Navigation: Alt + Left / Right Arrow
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleGoBack();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleGoForward();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowUp' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      } else if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowDown' || e.key === 'ArrowDown')) {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      } else if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowLeft' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        prevTrack();
      } else if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowRight' || e.key === 'ArrowRight')) {
        e.preventDefault();
        nextTrack();
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.shiftKey && (e.code === 'ArrowLeft' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        seek(Math.max(0, currentTime - 10));
      } else if (e.shiftKey && (e.code === 'ArrowRight' || e.key === 'ArrowRight')) {
        e.preventDefault();
        seek(Math.min(duration || 100, currentTime + 10));
      } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(Math.max(0, currentTime - 5));
      } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        seek(Math.min(duration || 100, currentTime + 5));
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault();
        nextTrack();
      } else if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        prevTrack();
      }
    };

    // Mouse back & forward buttons: button 3 is back, button 4 is forward
    const handleMouseUp = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        handleGoBack();
      } else if (e.button === 4) {
        e.preventDefault();
        handleGoForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleGoBack, handleGoForward, togglePlay, seek, currentTime, duration, volume, setVolume, toggleMute, nextTrack, prevTrack]);

  // Global Context Menu Interceptor (replaces browser right-click)
  useEffect(() => {
    const handleGlobalContextMenu = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      // If clicked inside an interactive element that handled context menu, prevent default
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, []);

  // Resolve Entity Detail Title for dynamic browser tab title
  useEffect(() => {
    let isCancelled = false;

    if (activeTab === 'album-detail' && selectedAlbumId) {
      const found = albums.find((a) => a.id === selectedAlbumId);
      if (found?.title) {
        setDetailTitle(found.title);
      } else {
        fetch(`/api/albums/${selectedAlbumId}`)
          .then((res) => res.json())
          .then((data) => {
            if (!isCancelled && data?.title) {
              setDetailTitle(data.title);
            }
          })
          .catch(() => {});
      }
    } else if (activeTab === 'artist-detail' && selectedArtistId) {
      fetch(`/api/artists/${selectedArtistId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!isCancelled && data?.name) {
            setDetailTitle(data.name);
          }
        })
        .catch(() => {});
    } else if (activeTab === 'playlist-detail' && selectedPlaylistId) {
      const found = playlists.find((p) => p.id === selectedPlaylistId);
      if (found?.name) {
        setDetailTitle(found.name);
      } else {
        fetch(`/api/playlists/${selectedPlaylistId}`, { credentials: 'include' })
          .then((res) => res.json())
          .then((data) => {
            if (!isCancelled && data?.name) {
              setDetailTitle(data.name);
            }
          })
          .catch(() => {});
      }
    } else {
      setDetailTitle('');
    }

    return () => {
      isCancelled = true;
    };
  }, [activeTab, selectedAlbumId, selectedArtistId, selectedPlaylistId, albums, playlists]);

  // Dynamic Browser Tab Document Title Synchronization
  useEffect(() => {
    if (isPlaying && currentTrack) {
      const title = currentTrack.title || 'Unknown Title';
      const artist = currentTrack.artist_name || currentTrack.artist || 'Unknown Artist';
      document.title = `${title} • ${artist} | MattLab Music`;
      return;
    }

    let pageTitle = '';
    if (isLyricsOpen) {
      pageTitle = 'Lyrics';
    } else if (isSettingsOpen) {
      pageTitle = 'Settings';
    } else if (isUserManagementOpen) {
      pageTitle = 'User Management';
    } else if (isRequestMusicOpen) {
      pageTitle = 'Request Music';
    } else if (isImportSpotifyOpen) {
      pageTitle = 'Import Spotify';
    } else {
      switch (activeTab) {
        case 'search':
          pageTitle = searchQuery.trim() ? `Search "${searchQuery.trim()}"` : 'Search';
          break;
        case 'favorites':
          pageTitle = 'Favorites';
          break;
        case 'albums':
          pageTitle = 'Albums';
          break;
        case 'artists':
          pageTitle = 'Artists';
          break;
        case 'album-detail':
          pageTitle = detailTitle || 'Album';
          break;
        case 'artist-detail':
          pageTitle = detailTitle || 'Artist';
          break;
        case 'playlist-detail':
          pageTitle = detailTitle || 'Playlist';
          break;
        case 'home':
        default:
          pageTitle = '';
          break;
      }
    }

    document.title = pageTitle ? `${pageTitle} • MattLab Music` : 'MattLab Music';
  }, [
    isPlaying,
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist_name,
    currentTrack?.artist,
    activeTab,
    detailTitle,
    searchQuery,
    isLyricsOpen,
    isSettingsOpen,
    isUserManagementOpen,
    isRequestMusicOpen,
    isImportSpotifyOpen,
  ]);

  const handleOpenContextMenu = (e, type, data) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      type,
      data,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  // Nav Handlers
  const handleGoHome = () => {
    setIsLyricsOpen(false);
    navigateTo({ tab: 'home', isLyricsOpen: false });
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (activeTab === 'search') {
      if (canGoBack) {
        handleGoBack();
      } else {
        handleGoHome();
      }
    }
  };

  const handleFocusSearch = () => {
    // TopBar displays self-contained floating search without unmounting the current view
  };

  const handleSelectAlbum = (albumId) => {
    setIsLyricsOpen(false);
    navigateTo({ tab: 'album-detail', albumId, isLyricsOpen: false });
  };

  const handleSelectArtist = (artistId) => {
    setIsLyricsOpen(false);
    navigateTo({ tab: 'artist-detail', artistId, isLyricsOpen: false });
  };

  const handleSelectPlaylist = (playlistId) => {
    setIsLyricsOpen(false);
    navigateTo({ tab: 'playlist-detail', playlistId, isLyricsOpen: false });
  };

  const handleSelectTab = (tab) => {
    setIsLyricsOpen(false);
    navigateTo({ tab, isLyricsOpen: false });
  };

  const handleToggleLyrics = (open) => {
    setIsLyricsOpen(open);
  };

  const handleRefreshScan = async () => {
    try {
      await fetch('/api/scan', { method: 'POST' });
      setTimeout(() => {
        fetchStats();
        fetchAlbums();
      }, 2000);
    } catch (err) {
      console.error('Scan trigger failed:', err);
    }
  };

  const handleOpenCreatePlaylist = () => {
    setIsCreatePlaylistOpen(true);
  };

  const handleCloseCreatePlaylist = useCallback(() => {
    setIsCreatePlaylistOpen(false);
  }, []);

  const handleOpenImportSpotify = () => {
    setIsImportSpotifyOpen(true);
  };

  const handleCloseImportSpotify = useCallback(() => {
    setIsImportSpotifyOpen(false);
  }, []);

  const handleImportSpotify = async ({ url, auto_download, auto_sync }) => {
    const res = await fetch('/api/spotify/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url, auto_download, auto_sync }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to import Spotify playlist');
    }
    const data = await res.json();
    await fetchPlaylists();
    if (data.playlist_id) {
      handleSelectPlaylist(data.playlist_id);
    }
    return data;
  };

  const handleCreatePlaylist = async (name) => {
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      await fetchPlaylists();
      handleSelectPlaylist(data.id);
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handlePlaylistDeleted = (deletedId) => {
    fetchPlaylists();
    if (!deletedId || selectedPlaylistId === deletedId) {
      handleGoHome();
    }
  };

  const handleConfirmDeletePlaylist = async () => {
    if (!playlistToDelete) return;
    try {
      setIsDeletingPlaylist(true);
      const res = await fetch(`/api/playlists/${playlistToDelete.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        handlePlaylistDeleted(playlistToDelete.id);
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    } finally {
      setIsDeletingPlaylist(false);
      setPlaylistToDelete(null);
    }
  };

  const handleConfirmRenamePlaylist = async (newName) => {
    if (!playlistToRename || !newName.trim()) return;
    try {
      setIsRenamingPlaylist(true);
      const res = await fetch(`/api/playlists/${playlistToRename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        await fetchPlaylists();
      }
    } catch (err) {
      console.error('Failed to rename playlist:', err);
    } finally {
      setIsRenamingPlaylist(false);
      setPlaylistToRename(null);
    }
  };

  const handleConfirmTakeOwnership = async () => {
    if (!playlistToTakeOwnership) return;
    try {
      setIsTakingOwnership(true);
      const res = await fetch(`/api/playlists/${playlistToTakeOwnership.id}/take-ownership`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchPlaylists();
        setPlaylistRefreshTrigger((prev) => prev + 1);
        if (showToast) {
          showToast(`✨ You now own "${playlistToTakeOwnership.name}". Unlinked from Spotify.`);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (showToast) {
          showToast(`⚠️ ${errData.detail || 'Failed to take ownership of playlist'}`);
        }
      }
    } catch (err) {
      console.error('Failed to take ownership:', err);
      if (showToast) {
        showToast('⚠️ Failed to take ownership of playlist');
      }
    } finally {
      setIsTakingOwnership(false);
      setPlaylistToTakeOwnership(null);
    }
  };

  const handleLibraryUpdated = useCallback(() => {
    fetchStats();
    fetchAlbums();
    fetchPlaylists();
    setSearchRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleAddTrackToPlaylist = async (playlistId, trackIdOrIds) => {
    try {
      const isArray = Array.isArray(trackIdOrIds);
      const payload = isArray ? { track_ids: trackIdOrIds } : { track_id: trackIdOrIds };
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      // Immediate optimistic update of playlist track counter
      if (!data?.already_exists && data?.track_count !== undefined) {
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId ? { ...p, track_count: data.track_count } : p
          )
        );
      }
      
      await fetchPlaylists();
      return data;
    } catch (err) {
      console.error('Failed to add track(s) to playlist:', err);
      return null;
    }
  };

  // Auth Guard Views
  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-surface-base text-content-primary select-none">
        <MattLabLogo
          variant="badge"
          bgColor="var(--brand-primary)"
          color="var(--surface-base)"
          className="w-16 h-16 rounded-full shadow-2xl mb-4 animate-pulse"
        />
        <div className="text-sm font-semibold text-content-secondary">
          Connecting to MattLab Music...
        </div>
      </div>
    );
  }

  if (setupRequired) {
    return <SetupAdminModal />;
  }

  if (!isAuthenticated) {
    return <LoginModal />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-surface-base overflow-hidden select-none text-content-primary font-sans">
      {/* 1. Top Global Navigation Bar (64px) */}
      <TopBar
        searchQuery={searchQuery}
        setSearchQuery={handleSearchChange}
        onClearSearch={handleClearSearch}
        onFocusSearch={handleFocusSearch}
        onGoHome={handleGoHome}
        stats={stats}
        onRefreshScan={handleRefreshScan}
        onRequestMusic={() => handleOpenRequestMusic(searchQuery || '')}
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
        onContextMenu={handleOpenContextMenu}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onOpenSettings={(tab) => handleOpenSettings(tab || 'account')}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
      />

      {/* 2. Three Floating Islands Body (grid: 280px 1fr 300px, gap: 8px, padding: 8px) */}
      <div className={`flex-1 min-h-0 grid gap-2 p-2 bg-surface-base overflow-hidden ${
        isQueueOpen
          ? 'grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_300px]'
          : 'grid-cols-1 md:grid-cols-[280px_1fr]'
      }`}>
        {/* Island 1: Left Panel ("Your Library") */}
        <LibrarySidebar
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={handleSelectPlaylist}
          onCreatePlaylistPrompt={handleOpenCreatePlaylist}
          onImportSpotifyPrompt={handleOpenImportSpotify}
          onAddTrackToPlaylist={handleAddTrackToPlaylist}
          onReorderPlaylists={(updated) => setPlaylists(updated)}
          stats={stats}
          isMobileOpen={isMobileLibraryOpen}
          onCloseMobile={() => setIsMobileLibraryOpen(false)}
          onContextMenu={handleOpenContextMenu}
        />

        {/* Island 2: Center Panel (Main Stage / Content Area) */}
        <main className="bg-surface-island rounded-lg overflow-y-auto flex flex-col h-full border border-border-subtle relative">
          {/* Synchronized Lyrics Immersion Mode */}
          {isLyricsOpen ? (
            <LyricsView onClose={() => setIsLyricsOpen(false)} />
          ) : (
            <>
              {activeTab === 'home' && (
                <HomeShelves
                  onSelectAlbum={handleSelectAlbum}
                  onSelectArtist={handleSelectArtist}
                  onShowAllAlbums={() => handleSelectTab('albums')}
                  onShowAllArtists={() => handleSelectTab('artists')}
                  onContextMenu={handleOpenContextMenu}
                />
              )}

              {activeTab === 'albums' && (
                <div className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-content-primary tracking-tight">All Albums</h2>
                      <p className="text-xs text-content-secondary mt-0.5">Explore your entire deduplicated collection</p>
                    </div>
                  </div>
                  <AlbumGrid
                    albums={albums}
                    onSelectAlbum={handleSelectAlbum}
                    onSelectArtist={handleSelectArtist}
                    onContextMenu={handleOpenContextMenu}
                    isLoading={isLoadingAlbums}
                  />
                </div>
              )}

              {activeTab === 'artists' && (
                <div className="p-4 sm:p-6">
                  <h2 className="text-2xl font-black text-white mb-6 tracking-tight">All Artists</h2>
                  <ArtistsView 
                    onSelectArtist={handleSelectArtist}
                    onContextMenu={handleOpenContextMenu}
                  />
                </div>
              )}

              {activeTab === 'artist-detail' && selectedArtistId && (
                <div className="p-4 sm:p-6">
                  <ArtistDetail
                    artistId={selectedArtistId}
                    onBack={handleGoBack}
                    onSelectAlbum={handleSelectAlbum}
                    onAddToPlaylist={(track) => setModalTrack(track)}
                    onContextMenu={handleOpenContextMenu}
                  />
                </div>
              )}

              {activeTab === 'search' && (
                <div className="p-4 sm:p-6">
                  <SearchView
                    query={searchQuery}
                    setQuery={handleSearchChange}
                    onSelectAlbum={handleSelectAlbum}
                    onSelectArtist={handleSelectArtist}
                    onAddToPlaylist={(track) => setModalTrack(track)}
                    onContextMenu={handleOpenContextMenu}
                    onRequestMusic={(q) => handleOpenRequestMusic(q || searchQuery || '')}
                    refreshTrigger={searchRefreshTrigger}
                  />
                </div>
              )}

              {activeTab === 'album-detail' && selectedAlbumId && (
                <div className="p-4 sm:p-6">
                  <AlbumDetail
                    albumId={selectedAlbumId}
                    onBack={handleGoBack}
                    onAddToPlaylist={(track) => setModalTrack(track)}
                    onPlaylistCreated={fetchPlaylists}
                    onSelectArtist={handleSelectArtist}
                    onContextMenu={handleOpenContextMenu}
                  />
                </div>
              )}

              {activeTab === 'favorites' && (
                <div className="p-4 sm:p-6">
                  <FavoritesView 
                    onSelectAlbum={handleSelectAlbum}
                    onSelectArtist={handleSelectArtist}
                    onAddToPlaylist={(track) => setModalTrack(track)}
                    onContextMenu={handleOpenContextMenu}
                  />
                </div>
              )}

              {activeTab === 'playlist-detail' && (
                <div className="w-full">
                  {selectedPlaylistId ? (
                    <PlaylistDetail
                      playlistId={selectedPlaylistId}
                      refreshTrigger={playlistRefreshTrigger}
                      onBack={handleGoBack}
                      onPlaylistDeleted={handlePlaylistDeleted}
                      onPlaylistUpdated={fetchPlaylists}
                      onSelectAlbum={handleSelectAlbum}
                      onSelectArtist={handleSelectArtist}
                      onContextMenu={handleOpenContextMenu}
                      onPromptTakeOwnership={(pl) => setPlaylistToTakeOwnership(pl)}
                    />
                  ) : (
                    <div className="p-8 text-center text-content-secondary">
                      <h3 className="text-lg font-bold text-content-primary mb-2">No playlist selected</h3>
                      <button onClick={handleGoHome} className="text-xs text-brand-500 hover:underline font-bold">
                        ← Return Home
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* Island 3: Right Panel ("Play Queue" / Context Drawer) */}
        <QueueIsland
          isOpen={isQueueOpen}
          onClose={() => setIsQueueOpen(false)}
          onDiscoverMusic={handleGoHome}
          onSelectAlbum={handleSelectAlbum}
          onSelectArtist={handleSelectArtist}
          onContextMenu={handleOpenContextMenu}
        />
      </div>

      {/* 3. Persistent Bottom Player Bar (80px, bg-surface-base) */}
      <PlayerBar
        isQueueOpen={isQueueOpen}
        setIsQueueOpen={setIsQueueOpen}
        isLyricsOpen={isLyricsOpen}
        setIsLyricsOpen={handleToggleLyrics}
        isMiniPlayerOpen={isMiniPlayerOpen}
        setIsMiniPlayerOpen={setIsMiniPlayerOpen}
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
        onContextMenu={handleOpenContextMenu}
      />

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'playlists-tab') {
            setIsMobileLibraryOpen(true);
          } else {
            handleSelectTab(tab);
          }
        }}
      />

      {/* Custom Right-Click Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        type={contextMenu.type}
        data={contextMenu.data}
        onClose={handleCloseContextMenu}
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
        onSelectPlaylist={handleSelectPlaylist}
        onSelectTab={handleSelectTab}
        onAddToPlaylist={(track) => setModalTrack(track)}
        onPlaylistUpdated={fetchPlaylists}
        onPlaylistDeleted={handlePlaylistDeleted}
        onPromptDeletePlaylist={(pl) => setPlaylistToDelete(pl)}
        onPromptRenamePlaylist={(pl) => setPlaylistToRename(pl)}
        onPromptTakeOwnership={(pl) => setPlaylistToTakeOwnership(pl)}
        onCreatePlaylistPrompt={handleOpenCreatePlaylist}
        onImportSpotifyPrompt={handleOpenImportSpotify}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        track={modalTrack}
        isOpen={Boolean(modalTrack)}
        onClose={() => setModalTrack(null)}
        onPlaylistUpdated={fetchPlaylists}
      />

      {/* Create Playlist Modal (Integrated In-App UI) */}
      <CreatePlaylistModal
        isOpen={isCreatePlaylistOpen}
        onClose={handleCloseCreatePlaylist}
        onCreatePlaylist={handleCreatePlaylist}
      />

      {/* Import Spotify Playlist Modal */}
      <ImportSpotifyModal
        isOpen={isImportSpotifyOpen}
        onClose={handleCloseImportSpotify}
        onImportSpotify={handleImportSpotify}
      />

      {/* Request Music Modal (Lidarr + Torrent + Spotify Resolver) */}
      <RequestMusicModal
        isOpen={isRequestMusicOpen}
        initialQuery={requestMusicInitialQuery}
        onClose={() => {
          setIsRequestMusicOpen(false);
          setRequestMusicInitialQuery('');
          handleLibraryUpdated();
        }}
        onLibraryUpdated={handleLibraryUpdated}
        onSelectAlbum={handleSelectAlbum}
      />

      {/* Persistent & Resizable Floating Mini Player / Picture-in-Picture */}
      <FloatingMiniPlayer
        isOpen={isMiniPlayerOpen}
        onClose={() => setIsMiniPlayerOpen(false)}
      />

      {/* Global Quick Search Command Palette (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
        onRequestMusic={(q) => handleOpenRequestMusic(q || '')}
      />

      {/* Admin User Management Modal */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
      />

      {/* Settings & Keyboard Shortcuts Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setIsSettingsOpen(false)}
        stats={stats}
        onOpenUserManagement={() => {
          setIsSettingsOpen(false);
          setIsUserManagementOpen(true);
        }}
      />

      {/* In-App Delete Playlist Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(playlistToDelete)}
        title={`Delete "${playlistToDelete?.name}"?`}
        message="This will delete the playlist. Your actual audio files will remain safe in your library."
        confirmText="Delete"
        onConfirm={handleConfirmDeletePlaylist}
        onClose={() => setPlaylistToDelete(null)}
        isLoading={isDeletingPlaylist}
      />

      {/* In-App Rename Playlist Prompt Modal */}
      <PromptModal
        isOpen={Boolean(playlistToRename)}
        title="Rename Playlist"
        message={`Enter a new name for "${playlistToRename?.name}":`}
        initialValue={playlistToRename?.name || ''}
        placeholder="Playlist name"
        confirmText="Save"
        onConfirm={handleConfirmRenamePlaylist}
        onClose={() => setPlaylistToRename(null)}
        isLoading={isRenamingPlaylist}
      />

      {/* In-App Take Ownership Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(playlistToTakeOwnership)}
        title={`Take ownership of "${playlistToTakeOwnership?.name}"?`}
        message="This will unlink the playlist from Spotify sync and turn it into a standard local playlist. All downloaded songs will be kept, and you will be able to rename, reorder, and add or remove tracks."
        confirmText="Take Ownership"
        onConfirm={handleConfirmTakeOwnership}
        onClose={() => setPlaylistToTakeOwnership(null)}
        isLoading={isTakingOwnership}
      />

      {/* Floating In-App Toast Notification (Spotify-style bottom pill modal) */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-surface-panel/95 backdrop-blur-md border border-border-strong text-content-primary text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none select-none">
          {typeof toastMessage === 'string' && toastMessage.startsWith('⚠️') ? (
            <AlertCircle size={15} className="text-amber-400 shrink-0" />
          ) : (
            <Check size={15} className="text-brand-500 shrink-0" />
          )}
          <span>
            {typeof toastMessage === 'string' && toastMessage.startsWith('⚠️')
              ? toastMessage.replace(/^⚠️\s*/, '')
              : toastMessage}
          </span>
        </div>
      )}
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <PlayerProvider>
        <MainAppContent />
      </PlayerProvider>
    </AuthProvider>
  );
};
