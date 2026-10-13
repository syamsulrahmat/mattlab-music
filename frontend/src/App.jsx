import React, { useState, useEffect, useCallback } from 'react';
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
import { RequestMusicModal } from './components/RequestMusicModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { SetupAdminModal } from './components/SetupAdminModal';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
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

  // Layout & Context States
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false);
  const [modalTrack, setModalTrack] = useState(null);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isRequestMusicOpen, setIsRequestMusicOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [requestMusicInitialQuery, setRequestMusicInitialQuery] = useState('');
  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);

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
      const res = await fetch('/api/playlists');
      const data = await res.json();
      setPlaylists(data.items || []);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchAlbums();
      fetchPlaylists();
    }
  }, [isAuthenticated]);

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
    // Only leave current session/view once characters are actually typed
    if (val && val.trim().length > 0) {
      setIsLyricsOpen(false);
      if (activeTab !== 'search' || isLyricsOpen) {
        navigateTo({ tab: 'search', searchQuery: val, isLyricsOpen: false });
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    // When aborting search, close search view and return back to previous session
    if (activeTab === 'search') {
      if (canGoBack) {
        handleGoBack();
      } else {
        handleGoHome();
      }
    }
  };

  const handleFocusSearch = () => {
    // Stay on current session/view when clicking search bar; only switch if query exists
    if (searchQuery && searchQuery.trim().length > 0) {
      if (isLyricsOpen) setIsLyricsOpen(false);
      if (activeTab !== 'search') {
        navigateTo({ tab: 'search', searchQuery, isLyricsOpen: false });
      }
    }
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

  const handleCreatePlaylist = async (name) => {
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      await fetchPlaylists();
      handleSelectPlaylist(data.id);
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handlePlaylistDeleted = () => {
    fetchPlaylists();
    handleGoHome();
  };

  const handleLibraryUpdated = useCallback(() => {
    fetchStats();
    fetchAlbums();
    fetchPlaylists();
    setSearchRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleAddTrackToPlaylist = async (playlistId, trackId) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId }),
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
      console.error('Failed to add track to playlist:', err);
      return null;
    }
  };

  // Auth Guard Views
  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#000000] text-white select-none">
        <MattLabLogo
          variant="badge"
          bgColor="#1ed760"
          color="#000000"
          className="w-16 h-16 rounded-full shadow-2xl mb-4 animate-pulse"
        />
        <div className="text-sm font-semibold text-[#a7a7a7]">
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
    <div className="flex flex-col h-screen w-screen bg-[#000000] overflow-hidden select-none text-white font-sans">
      {/* 1. Top Global Navigation Bar (64px, bg-[#000000]) */}
      <TopBar
        searchQuery={searchQuery}
        setSearchQuery={handleSearchChange}
        onClearSearch={handleClearSearch}
        onFocusSearch={handleFocusSearch}
        onGoHome={handleGoHome}
        stats={stats}
        onRefreshScan={handleRefreshScan}
        onRequestMusic={() => handleOpenRequestMusic(searchQuery || '')}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
      />

      {/* 2. Three Floating Islands Body (grid: 280px 1fr 300px, gap: 8px, padding: 8px) */}
      <div className={`flex-1 min-h-0 grid gap-2 p-2 bg-[#000000] overflow-hidden ${
        isQueueOpen
          ? 'grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_300px]'
          : 'grid-cols-1 md:grid-cols-[280px_1fr]'
      }`}>
        {/* Island 1: Left Panel ("Your Library") */}
        <LibrarySidebar
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          playlists={playlists}
          onSelectPlaylist={handleSelectPlaylist}
          onCreatePlaylistPrompt={handleOpenCreatePlaylist}
          onAddTrackToPlaylist={handleAddTrackToPlaylist}
          onReorderPlaylists={(updated) => setPlaylists(updated)}
          stats={stats}
          isMobileOpen={isMobileLibraryOpen}
          onCloseMobile={() => setIsMobileLibraryOpen(false)}
        />

        {/* Island 2: Center Panel (Main Stage / Content Area) */}
        <main className="bg-[#121212] rounded-lg overflow-y-auto flex flex-col h-full border border-white/5 relative">
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
                      <h2 className="text-2xl font-black text-white tracking-tight">All Albums</h2>
                      <p className="text-xs text-[#b3b3b3] mt-0.5">Explore your entire deduplicated collection</p>
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
                      onBack={handleGoBack}
                      onPlaylistDeleted={handlePlaylistDeleted}
                      onPlaylistUpdated={fetchPlaylists}
                      onSelectAlbum={handleSelectAlbum}
                      onSelectArtist={handleSelectArtist}
                      onContextMenu={handleOpenContextMenu}
                    />
                  ) : (
                    <div className="p-8 text-center text-[#b3b3b3]">
                      <h3 className="text-lg font-bold text-white mb-2">No playlist selected</h3>
                      <button onClick={handleGoHome} className="text-xs text-[#1ed760] hover:underline font-bold">
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

      {/* 3. Persistent Bottom Player Bar (80px, bg-[#000000]) */}
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
        onAddToPlaylist={(track) => setModalTrack(track)}
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
        onClose={() => setIsCreatePlaylistOpen(false)}
        onCreatePlaylist={handleCreatePlaylist}
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
