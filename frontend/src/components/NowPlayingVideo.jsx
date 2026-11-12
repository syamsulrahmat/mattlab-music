import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Loader2, Music, Sparkles, Film } from 'lucide-react';
import { usePlayer, resolveCoverUrl } from '../context/PlayerContext';

// In-memory cache for track visualizer metadata across component re-renders
const videoMetadataCache = new Map();

export const NowPlayingVideo = React.memo(({
  track,
  onSelectAlbum,
  className = '',
  containerClassName = '',
  isKaraokeMode = false,
  hideExternalLinks = false,
  showVideoBadge = false,
}) => {
  const { isPlaying, audioQuality } = usePlayer();
  const [videoData, setVideoData] = useState(() => videoMetadataCache.get(track?.id) || null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(!videoMetadataCache.has(track?.id));
  const [mediaMode, setMediaMode] = useState(() => {
    return audioQuality === 'data_saver' ? 'cover' : 'video';
  });
  const [isVideoWidescreen, setIsVideoWidescreen] = useState(false);

  const videoRef = useRef(null);
  const pollTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const coverUrl = track ? (resolveCoverUrl(track) || track.cover_url) : null;

  // Fetch video/canvas metadata when track changes
  useEffect(() => {
    if (!track?.id) return;

    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (videoMetadataCache.has(track.id)) {
      const cached = videoMetadataCache.get(track.id);
      setVideoData(cached);
      setIsLoadingVideo(false);
      if (cached?.available && cached?.video_url && audioQuality !== 'data_saver') {
        setMediaMode('video');
      }
      return;
    }

    let isMounted = true;
    setIsLoadingVideo(true);

    const fetchVisualizer = (isRetry = false) => {
      fetch(`/api/tracks/${track.id}/video`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return;
          if (data) {
            setVideoData(data);
            if (data.available && data.video_url) {
              videoMetadataCache.set(track.id, data);
              setIsLoadingVideo(false);
              if (audioQuality !== 'data_saver') {
                setMediaMode('video');
              }
            } else if (data.status === 'processing') {
              // Background download in progress on backend; retry in 3.5 seconds
              pollTimerRef.current = setTimeout(() => {
                if (isMounted) fetchVisualizer(true);
              }, 3500);
            } else {
              videoMetadataCache.set(track.id, { available: false });
              setIsLoadingVideo(false);
            }
          } else {
            setVideoData({ available: false });
            setIsLoadingVideo(false);
          }
        })
        .catch((err) => {
          console.warn('[NowPlayingVideo] Failed to fetch visualizer info:', err);
          if (isMounted) {
            setVideoData({ available: false });
            setIsLoadingVideo(false);
          }
        });
    };

    fetchVisualizer();

    return () => {
      isMounted = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [track?.id, audioQuality]);

  const hasValidVideo = Boolean(videoData?.available && videoData?.video_url);

  // Sync HTML5 Video with Play / Pause state
  useEffect(() => {
    if (!videoRef.current || !hasValidVideo || mediaMode !== 'video') return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, hasValidVideo, mediaMode]);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleCardClick = (e) => {
    if (!hasValidVideo) return;
    // If the click originated from a touch drag greater than 12px, ignore to avoid conflict with swipe gestures
    if (e.clientX !== undefined && touchStartPosRef.current.x) {
      const deltaX = Math.abs(e.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - touchStartPosRef.current.y);
      if (deltaX > 12 || deltaY > 12) return;
    }
    try {
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (_) {}
    setMediaMode((prev) => (prev === 'video' ? 'cover' : 'video'));
  };

  return (
    <div 
      data-dev-component="NowPlayingVideo"
      data-dev-file="src/components/NowPlayingVideo.jsx"
      data-dev-desc="1:1 canvas toggling between album artwork and synchronized video clip"
      className={containerClassName || "flex flex-col space-y-3"}
    >
      {/* 1:1 Media Display Card - Click/tap to toggle between Video and Cover */}
      <div 
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        className={`${className || 'relative aspect-square w-full rounded-2xl overflow-hidden bg-surface-elevated shadow-lg'} group select-none ${
          hasValidVideo ? 'cursor-pointer active:scale-[0.99] transition-transform duration-150' : ''
        }`}
      >
        {/* Layer 1: Ambient Blurred Album Art Glow (Behind) */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 pointer-events-none"
          />
        )}

        {/* Layer 2: High-Resolution Static Cover Art */}
        <div 
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 pointer-events-none ${
            !hasValidVideo || mediaMode === 'cover' ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={track?.title || ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-panel text-content-subtle">
              <Music size={40} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
        </div>

        {/* Layer 2b: Karaoke Mode Indicator */}
        {isKaraokeMode && (
          <div className="absolute top-3 left-3 z-30 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-brand-500 text-black shadow-lg animate-pulse">
              <Sparkles size={11} />
              Karaoke Stem
            </span>
          </div>
        )}

        {/* Layer 3: Native HTML5 Looping Video (Canvas MP4 or YouTube Snippet MP4) */}
        {hasValidVideo && (
          <div 
            className={`absolute inset-0 w-full h-full transition-opacity duration-300 pointer-events-none overflow-hidden ${
              mediaMode === 'video' ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <video
              ref={videoRef}
              key={videoData.video_url}
              src={videoData.video_url}
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(e) => {
                const { videoWidth, videoHeight } = e.target;
                if (videoWidth && videoHeight) {
                  setIsVideoWidescreen(videoWidth > videoHeight);
                }
              }}
              className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                isVideoWidescreen ? 'scale-[1.38]' : 'scale-100'
              }`}
            />
          </div>
        )}

        {/* Subtle Video/Canvas Pill Indicator */}
        {hasValidVideo && showVideoBadge && (
          <div className="absolute bottom-2.5 right-2.5 z-30 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium bg-black/60 backdrop-blur-md text-white/90 px-2.5 py-1 rounded-full border border-white/10 shadow-sm transition">
              <Film size={11} className={mediaMode === 'video' ? 'text-brand-400' : 'text-white/60'} />
              <span className="uppercase text-[9px] tracking-wider font-semibold">
                {mediaMode === 'video' ? (videoData?.type === 'canvas' ? 'Canvas' : 'Video') : 'Cover'}
              </span>
            </span>
          </div>
        )}

        {/* Top-Right Subtle External Link (revealed on hover) */}
        {!hideExternalLinks && Boolean(videoData?.spotify_track_id || videoData?.video_id) && (
          <div className="absolute top-2.5 right-2.5 z-30">
            {videoData?.spotify_track_id ? (
              <a
                href={`https://open.spotify.com/track/${videoData.spotify_track_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-content-secondary hover:text-[#1DB954] flex items-center justify-center transition shadow-sm opacity-0 group-hover:opacity-100"
                title="Open track on Spotify"
              >
                <ExternalLink size={11} />
              </a>
            ) : videoData?.video_id ? (
              <a
                href={`https://www.youtube.com/watch?v=${videoData.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-content-secondary hover:text-white flex items-center justify-center transition shadow-sm opacity-0 group-hover:opacity-100"
                title="Watch full video on YouTube"
              >
                <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
        )}

        {/* Subtle Loading Spinner while fetching or downloading snippet */}
        {(isLoadingVideo || videoData?.status === 'processing') && (
          <div className="absolute bottom-2.5 left-2.5 z-30 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium bg-black/60 backdrop-blur-md text-white/80 px-2 py-0.5 rounded-full border border-white/10">
              <Loader2 size={10} className="animate-spin text-brand-400" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
