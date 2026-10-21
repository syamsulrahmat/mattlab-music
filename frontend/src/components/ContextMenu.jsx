import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { 
  Play, Pause, Plus, Heart, ListPlus, Disc3, Mic2, CornerDownRight, Trash2,
  ListMusic, RefreshCw, ExternalLink, Edit2, Copy, Loader2, Mic, MicOff, UserCheck
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { SpotifyIcon } from './SpotifyIcon';

export const ContextMenu = ({
  isOpen,
  x,
  y,
  type = 'track',
  data,
  onClose,
  onSelectAlbum,
  onSelectArtist,
  onSelectPlaylist,
  onSelectTab,
  onAddToPlaylist,
  onEditLyrics,
  onPlaylistUpdated,
  onPlaylistDeleted,
  onPromptDeletePlaylist,
  onPromptRenamePlaylist,
  onPromptTakeOwnership,
  onCreatePlaylistPrompt,
  onImportSpotifyPrompt,
}) => {
  const menuRef = useRef(null);
  const { 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay, 
    addToQueue, 
    playNextInQueue, 
    isFavorite, 
    toggleFavorite,
    isKaraokeMode,
    toggleKaraoke,
    karaokeStemStatus,
    fetchKaraokeStatus,
    generateKaraokeStems,
    batchGenerateKaraoke,
  } = usePlayer();

  useEffect(() => {
    if (isOpen && type === 'track' && data?.id) {
      fetchKaraokeStatus(data.id);
    }
  }, [isOpen, type, data?.id, fetchKaraokeStatus]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleScroll = () => onClose();

    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  // Screen boundary positioning calculation (Option A: Native Upward Flip)
  const calculatePosition = (targetHeight = 420, targetWidth = 224) => {
    if (typeof window === 'undefined') return { top: y, left: x, isFlipped: false };

    // Bottom clearance: 80px fixed player bar + 10px safe margin = 90px
    const bottomPlayerBarHeight = 90;
    const topBarHeight = 64;
    const padding = 10;

    const maxUsableY = window.innerHeight - bottomPlayerBarHeight;
    const maxUsableX = window.innerWidth - padding;

    let posX = x;
    let posY = y;
    let isFlipped = false;

    // Horizontal boundary adjustment
    if (x + targetWidth > maxUsableX) {
      posX = Math.max(padding, x - targetWidth);
      if (posX + targetWidth > maxUsableX) {
        posX = Math.max(padding, maxUsableX - targetWidth);
      }
    } else {
      posX = Math.max(padding, x);
    }

    // Vertical boundary adjustment: Flip upward if running past bottom player bar clearance
    if (y + targetHeight > maxUsableY) {
      const flippedY = y - targetHeight;
      if (flippedY >= topBarHeight) {
        posY = flippedY;
        isFlipped = true;
      } else {
        // If neither above nor below fits completely, dock top above bottom bar
        posY = Math.max(topBarHeight, maxUsableY - targetHeight);
        isFlipped = posY < y;
      }
    } else {
      posY = Math.max(topBarHeight, y);
      isFlipped = false;
    }

    return { top: posY, left: posX, isFlipped };
  };

  const estimatedHeight = type === 'track' ? 440 : type === 'playlist' ? 380 : 260;
  const [coords, setCoords] = useState(() => calculatePosition(estimatedHeight));

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const actualWidth = rect.width || 224;
    const actualHeight = rect.height || estimatedHeight;
    setCoords(calculatePosition(actualHeight, actualWidth));
  }, [isOpen, x, y, type, data]);

  if (!isOpen || !data) return null;

  const isCurrentPlayingThis = data && currentTrack && currentTrack.id === data.id;
  const isFav = data && data.id ? isFavorite(data.id) : false;

  return (
    <div
      ref={menuRef}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        maxHeight: 'calc(100vh - 150px)',
      }}
      className={`fixed z-50 w-56 bg-surface-panel text-content-primary rounded-md shadow-2xl border border-border-medium py-1.5 text-xs font-medium select-none overflow-y-auto animate-in fade-in zoom-in-95 duration-100 ${
        coords.isFlipped ? 'origin-bottom-left' : 'origin-top-left'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'track' && (
        <>
          <button
            onClick={() => {
              if (isCurrentPlayingThis) {
                togglePlay();
              } else {
                playTrack(data);
              }
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            {isCurrentPlayingThis && isPlaying ? (
              <>
                <Pause size={15} className="text-brand-500" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={15} className="text-brand-500" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              addToQueue(data);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <ListPlus size={15} className="text-content-secondary" />
            <span>Add to queue</span>
          </button>

          <button
            onClick={() => {
              playNextInQueue(data);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <CornerDownRight size={15} className="text-content-secondary" />
            <span>Play next</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          <button
            onClick={() => {
              toggleFavorite(data.id);
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <Heart size={15} className={isFav ? 'fill-brand-500 text-brand-500' : 'text-content-secondary'} />
            <span>{isFav ? 'Remove from Liked Songs' : 'Save to your Liked Songs'}</span>
          </button>

          {onAddToPlaylist && (
            <button
              onClick={() => {
                onAddToPlaylist(data);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Plus size={15} className="text-content-secondary" />
              <span>Add to playlist</span>
            </button>
          )}

          {onEditLyrics && (
            <button
              onClick={() => {
                onEditLyrics(data);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Edit2 size={15} className="text-content-secondary" />
              <span>Edit / Add Lyrics</span>
            </button>
          )}

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          {/* Karaoke Toggle / Pre-cache */}
          {(() => {
            const stemInfo = data?.id ? karaokeStemStatus[data.id] : null;
            const isCurrentTrack = currentTrack?.id === data?.id;

            if (stemInfo?.exists) {
              if (isCurrentTrack) {
                return (
                  <button
                    onClick={() => {
                      toggleKaraoke();
                      onClose();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center justify-between transition text-brand-400 hover:text-brand-300"
                  >
                    <div className="flex items-center gap-2.5">
                      {isKaraokeMode ? <MicOff size={15} className="text-brand-500" /> : <Mic size={15} className="text-brand-500" />}
                      <span>{isKaraokeMode ? 'Turn off Karaoke' : 'Turn on Karaoke'}</span>
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-wider bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded">
                      {isKaraokeMode ? 'Active' : 'Ready'}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  onClick={() => {
                    playTrack(data);
                    if (!isKaraokeMode) toggleKaraoke();
                    onClose();
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center justify-between transition text-brand-400 hover:text-brand-300"
                >
                  <div className="flex items-center gap-2.5">
                    <Mic size={15} className="text-brand-500" />
                    <span>Play with Karaoke</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold tracking-wider bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded">
                    Ready
                  </span>
                </button>
              );
            }

            if (stemInfo?.status === 'processing' || stemInfo?.status === 'queued') {
              return (
                <div className="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-brand-400 cursor-default">
                  <Loader2 size={15} className="animate-spin text-brand-500" />
                  <span>Preparing Karaoke...</span>
                </div>
              );
            }

            return (
              <button
                onClick={() => {
                  generateKaraokeStems(data.id);
                  onClose();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-400 hover:text-brand-300"
              >
                <Mic size={15} className="text-brand-500" />
                <span>Pre-cache Karaoke</span>
              </button>
            );
          })()}

          {(data.album_id || data.artist_id) && (
            <div className="h-[1px] bg-white/10 my-1 mx-2" />
          )}

          {data.album_id && onSelectAlbum && (
            <button
              onClick={() => {
                onSelectAlbum(data.album_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Disc3 size={15} className="text-content-secondary" />
              <span>Go to album</span>
            </button>
          )}

          {data.artist_id && onSelectArtist && (
            <button
              onClick={() => {
                onSelectArtist(data.artist_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Mic2 size={15} className="text-content-secondary" />
              <span>Go to artist</span>
            </button>
          )}

          {(data.onDelete || data.onRemoveFromPlaylist) && (
            <>
              <div className="h-[1px] bg-white/10 my-1 mx-2" />
              <button
                onClick={() => {
                  if (data.onDelete) data.onDelete();
                  else if (data.onRemoveFromPlaylist) data.onRemoveFromPlaylist();
                  onClose();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-red-500/20 hover:text-red-400 flex items-center gap-2.5 transition text-red-400 font-semibold"
              >
                <Trash2 size={15} />
                <span>{data.deleteLabel || 'Delete from playlist'}</span>
              </button>
            </>
          )}
        </>
      )}

      {type === 'album' && (
        <>
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/albums/${data.id}`);
                const albumData = await res.json();
                if (albumData.tracks && albumData.tracks.length > 0) {
                  playTrack(albumData.tracks[0], albumData.tracks);
                }
              } catch (e) {
                console.error(e);
              }
              onClose();
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <Play size={15} className="text-brand-500" />
            <span>Play album</span>
          </button>

          {onSelectAlbum && (
            <button
              onClick={() => {
                onSelectAlbum(data.id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Disc3 size={15} className="text-content-secondary" />
              <span>Go to album</span>
            </button>
          )}

          {data.artist_id && onSelectArtist && (
            <button
              onClick={() => {
                onSelectArtist(data.artist_id);
                onClose();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Mic2 size={15} className="text-content-secondary" />
              <span>Go to artist</span>
            </button>
          )}

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch(`/api/albums/${data.id}`);
                const albumData = await res.json();
                if (albumData.tracks && albumData.tracks.length > 0) {
                  const trackIds = albumData.tracks.map((t) => t.id);
                  await batchGenerateKaraoke(trackIds);
                }
              } catch (e) {
                console.error(e);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-400 hover:text-brand-300"
          >
            <Mic size={15} className="text-brand-500" />
            <span>Pre-cache Karaoke</span>
          </button>
        </>
      )}

      {type === 'artist' && onSelectArtist && (
        <button
          onClick={() => {
            onSelectArtist(data.id);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
        >
          <Mic2 size={15} className="text-brand-500" />
          <span>Go to artist</span>
        </button>
      )}

      {type === 'playlist' && (
        <>
          {/* Play Playlist */}
          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch(`/api/playlists/${data.id}`, { credentials: 'include' });
                if (res.ok) {
                  const pData = await res.json();
                  if (Array.isArray(pData.tracks) && pData.tracks.length > 0) {
                    playTrack(pData.tracks[0], pData.tracks);
                  }
                }
              } catch (err) {
                console.error('Failed to play playlist:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <Play size={15} className="text-brand-500" />
            <span>Play playlist</span>
          </button>

          {/* Add to Queue */}
          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch(`/api/playlists/${data.id}`, { credentials: 'include' });
                if (res.ok) {
                  const pData = await res.json();
                  if (Array.isArray(pData.tracks)) {
                    pData.tracks.forEach((track) => addToQueue(track));
                  }
                }
              } catch (err) {
                console.error('Failed to add playlist to queue:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <ListPlus size={15} className="text-content-secondary" />
            <span>Add to queue</span>
          </button>

          {/* Open Playlist */}
          {onSelectPlaylist && (
            <button
              onClick={() => {
                onClose();
                onSelectPlaylist(data.id);
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <ListMusic size={15} className="text-content-secondary" />
              <span>Open playlist</span>
            </button>
          )}

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          {/* Pre-cache Playlist Karaoke */}
          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch(`/api/playlists/${data.id}`, { credentials: 'include' });
                if (res.ok) {
                  const pData = await res.json();
                  if (Array.isArray(pData.tracks) && pData.tracks.length > 0) {
                    const trackIds = pData.tracks.map((t) => t.id);
                    await batchGenerateKaraoke(trackIds);
                  }
                }
              } catch (err) {
                console.error('Failed to pre-cache playlist karaoke:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-400 hover:text-brand-300"
          >
            <Mic size={15} className="text-brand-500" />
            <span>Pre-cache Karaoke</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1 mx-2" />

          {/* Rename Playlist - Available on all playlists */}
          <button
            onClick={() => {
              onClose();
              onPromptRenamePlaylist?.(data);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <Edit2 size={15} className="text-content-secondary" />
            <span>Rename</span>
          </button>

          {/* Spotify Synced Actions (if still synced with single Spotify playlist) */}
          {data.spotify_id && !data.is_collection && (
            <>
              <div className="h-[1px] bg-white/10 my-1 mx-2" />
              <button
                onClick={async () => {
                  onClose();
                  try {
                    await fetch(`/api/spotify/sync-now/${data.id}`, { method: 'POST' });
                    onPlaylistUpdated?.();
                  } catch (err) {
                    console.error('Failed to trigger sync:', err);
                  }
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-500"
              >
                <RefreshCw size={15} />
                <span>Sync with Spotify</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  window.open(`https://open.spotify.com/playlist/${data.spotify_id}`, '_blank', 'noopener,noreferrer');
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
              >
                <ExternalLink size={15} className="text-brand-500" />
                <span>Open on Spotify</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onPromptTakeOwnership?.(data);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-400 hover:text-brand-300"
              >
                <UserCheck size={15} />
                <span>Take ownership</span>
              </button>
            </>
          )}

          {/* Delete Playlist */}
          <div className="h-[1px] bg-white/10 my-1 mx-2" />
          <button
            onClick={() => {
              onClose();
              onPromptDeletePlaylist?.(data);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-red-500/20 hover:text-red-400 flex items-center gap-2.5 transition text-red-400 font-semibold"
          >
            <Trash2 size={15} />
            <span>Delete playlist</span>
          </button>
        </>
      )}

      {type === 'favorites' && (
        <>
          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch('/api/favorites', { credentials: 'include' });
                if (res.ok) {
                  const fData = await res.json();
                  const tracks = Array.isArray(fData.items) ? fData.items : (Array.isArray(fData) ? fData : []);
                  if (tracks.length > 0) {
                    playTrack(tracks[0], tracks);
                  }
                }
              } catch (err) {
                console.error('Failed to play favorites:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <Play size={15} className="text-brand-500" />
            <span>Play Liked Songs</span>
          </button>

          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch('/api/favorites', { credentials: 'include' });
                if (res.ok) {
                  const fData = await res.json();
                  const tracks = Array.isArray(fData.items) ? fData.items : (Array.isArray(fData) ? fData : []);
                  tracks.forEach((track) => addToQueue(track));
                }
              } catch (err) {
                console.error('Failed to add favorites to queue:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
          >
            <ListPlus size={15} className="text-content-secondary" />
            <span>Add to queue</span>
          </button>

          <button
            onClick={async () => {
              onClose();
              try {
                const res = await fetch('/api/favorites', { credentials: 'include' });
                if (res.ok) {
                  const fData = await res.json();
                  const tracks = Array.isArray(fData.items) ? fData.items : (Array.isArray(fData) ? fData : []);
                  if (tracks.length > 0) {
                    const trackIds = tracks.map((t) => t.id);
                    await batchGenerateKaraoke(trackIds);
                  }
                }
              } catch (err) {
                console.error('Failed to pre-cache favorites karaoke:', err);
              }
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-400 hover:text-brand-300"
          >
            <Mic size={15} className="text-brand-500" />
            <span>Pre-cache Karaoke</span>
          </button>

          {onSelectTab && (
            <button
              onClick={() => {
                onClose();
                onSelectTab('favorites');
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Heart size={15} className="fill-brand-500 text-brand-500" />
              <span>Go to Liked Songs</span>
            </button>
          )}
        </>
      )}

      {type === 'library-blank' && (
        <>
          {onCreatePlaylistPrompt && (
            <button
              onClick={() => {
                onClose();
                onCreatePlaylistPrompt();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition"
            >
              <Plus size={15} className="text-brand-500" />
              <span>Create playlist</span>
            </button>
          )}

          {onImportSpotifyPrompt && (
            <button
              onClick={() => {
                onClose();
                onImportSpotifyPrompt();
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-surface-hover hover:text-content-primary flex items-center gap-2.5 transition text-brand-500"
            >
              <SpotifyIcon size={15} />
              <span>Import Spotify playlist</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
