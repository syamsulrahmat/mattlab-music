import React, { useState, useEffect } from 'react';
import { Play, Pause, Disc3, Mic2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { HomeGreeting } from './HomeGreeting';
import { HomeTopTables } from './HomeTopTables';

export const HomeShelves = ({
  onSelectAlbum,
  onSelectArtist,
  onShowAllAlbums,
  onShowAllArtists,
  onContextMenu,
}) => {
  const [homeData, setHomeData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  useEffect(() => {
    let isMounted = true;
    fetch('/api/home', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setHomeData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load home shelves:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleQuickPlayAlbum = async (e, album) => {
    e.stopPropagation();
    const isThisAlbum = currentTrack && currentTrack.album_id === album.id;
    if (isThisAlbum) {
      togglePlay();
      return;
    }

    try {
      const res = await fetch(`/api/albums/${album.id}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        playTrack(data.tracks[0], data.tracks);
      }
    } catch (err) {
      console.error('Failed to quick play album:', err);
    }
  };

  if (isLoading || !homeData) {
    return (
      <div className="space-y-8 animate-pulse p-4 sm:p-6">
        {[...Array(3)].map((_, idx) => (
          <div key={idx} className="space-y-4">
            <div className="h-6 bg-surface-elevated rounded w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-44 bg-surface-elevated rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { 
    recently_added = [], 
    popular_artists = [], 
    featured_albums = [],
    user_top_tracks = [],
    popular_tracks = []
  } = homeData;

  return (
    <div className="space-y-8 p-4 sm:p-6 select-none">
      {/* Dynamic Greeting & Live Clock Banner */}
      <HomeGreeting />

      {/* Top 10 Tracks Table */}
      <HomeTopTables
        userTopTracks={user_top_tracks}
        onSelectAlbum={onSelectAlbum}
        onSelectArtist={onSelectArtist}
        onContextMenu={onContextMenu}
      />

      {/* 1. Trending / Recently Added Shelf */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 
            className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight hover:underline cursor-pointer" 
            onClick={onShowAllAlbums}
          >
            Trending / Recently Added
          </h2>
          <button
            onClick={onShowAllAlbums}
            className="text-xs font-bold text-content-secondary hover:text-white transition"
          >
            Show all
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          {recently_added.map((album) => {
            const isThisAlbum = currentTrack && currentTrack.album_id === album.id;
            const isThisPlaying = isThisAlbum && isPlaying;
            return (
              <div
                key={album.id}
                onClick={() => onSelectAlbum(album.id)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'album', album);
                  }
                }}
                className="group bg-surface-elevated hover:bg-surface-hover p-3 rounded-lg transition duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div className="relative aspect-square mb-3 rounded-md overflow-hidden bg-surface-elevated2 shadow-md">
                  <img
                    src={album.cover_url}
                    alt={album.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  {/* Floating Green Play Button */}
                  <button
                    onClick={(e) => handleQuickPlayAlbum(e, album)}
                    className={`absolute bottom-2 right-2 w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition duration-200 z-10 ${
                      isThisAlbum
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                    }`}
                    title={isThisPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
                  >
                    {isThisPlaying ? (
                      <Pause size={18} className="fill-black" />
                    ) : (
                      <Play size={18} className="fill-black ml-0.5" />
                    )}
                  </button>
                </div>

                <div>
                  <h3 className={`font-semibold text-xs sm:text-sm truncate transition ${
                    isThisAlbum ? 'text-brand-500' : 'text-content-primary'
                  }`}>
                    {album.title}
                  </h3>
                  <p className="text-[11px] text-content-secondary truncate mt-0.5">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (album.artist_id && onSelectArtist) onSelectArtist(album.artist_id);
                      }}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      {album.artist_name}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Popular Artists Shelf (Dynamic Deezer Images) */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 
            className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight hover:underline cursor-pointer" 
            onClick={onShowAllArtists}
          >
            Popular Artists
          </h2>
          <button
            onClick={onShowAllArtists}
            className="text-xs font-bold text-content-secondary hover:text-white transition"
          >
            Show all
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          {popular_artists.map((artist) => (
            <div
              key={artist.id}
              onClick={() => onSelectArtist(artist.id)}
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  onContextMenu(e, 'artist', artist);
                }
              }}
              className="group bg-surface-elevated hover:bg-surface-hover p-3 rounded-lg transition duration-200 cursor-pointer text-center flex flex-col items-center justify-between"
            >
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-surface-elevated2 group-hover:scale-105 transition duration-300 flex items-center justify-center mb-3 shadow-lg border border-border-subtle">
                <img
                  src={artist.image_url || `/api/artists/${artist.id}/image`}
                  alt={artist.name}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/api/covers/0';
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-full">
                <h3 className="font-semibold text-xs sm:text-sm text-content-primary truncate group-hover:text-brand-400 transition">
                  {artist.name}
                </h3>
                <p className="text-[11px] text-content-secondary mt-0.5">
                  Artist • {artist.track_count} songs
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Your Albums Shelf */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 
            className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight hover:underline cursor-pointer" 
            onClick={onShowAllAlbums}
          >
            Your Albums
          </h2>
          <button
            onClick={onShowAllAlbums}
            className="text-xs font-bold text-content-secondary hover:text-white transition"
          >
            Show all
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {featured_albums.map((album) => {
            const isThisAlbum = currentTrack && currentTrack.album_id === album.id;
            const isThisPlaying = isThisAlbum && isPlaying;
            return (
              <div
                key={album.id}
                onClick={() => onSelectAlbum(album.id)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(e, 'album', album);
                  }
                }}
                className="group bg-surface-elevated hover:bg-surface-hover p-3 rounded-lg transition duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div className="relative aspect-square mb-3 rounded-md overflow-hidden bg-surface-elevated2 shadow-md">
                  <img
                    src={album.cover_url}
                    alt={album.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <button
                    onClick={(e) => handleQuickPlayAlbum(e, album)}
                    className={`absolute bottom-2 right-2 w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-xl transition duration-200 z-10 ${
                      isThisAlbum
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                    }`}
                    title={isThisPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
                  >
                    {isThisPlaying ? (
                      <Pause size={18} className="fill-black" />
                    ) : (
                      <Play size={18} className="fill-black ml-0.5" />
                    )}
                  </button>
                </div>

                <div>
                  <h3 className={`font-semibold text-xs sm:text-sm truncate transition ${
                    isThisAlbum ? 'text-brand-500' : 'text-content-primary'
                  }`}>
                    {album.title}
                  </h3>
                  <p className="text-[11px] text-content-secondary truncate mt-0.5">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (album.artist_id && onSelectArtist) onSelectArtist(album.artist_id);
                      }}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      {album.artist_name}
                    </span>
                    {album.year ? ` • ${album.year}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
