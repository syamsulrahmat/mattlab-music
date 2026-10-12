import React, { useEffect, useState, useRef } from 'react';
import { Mic2, Music, RefreshCw, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const parseLrc = (lrcString) => {
  if (!lrcString) return [];
  const lines = lrcString.split('\n');
  const parsed = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = match[3] ? parseFloat(`0.${match[3]}`) : 0;
      const time = minutes * 60 + seconds + fraction;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        parsed.push({ time, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
};

export const LyricsView = ({ onClose }) => {
  const { currentTrack, currentTime, seek } = usePlayer();
  const [lyricsData, setLyricsData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const activeLineRef = useRef(null);
  const containerRef = useRef(null);

  const fetchLyrics = async (trackId) => {
    if (!trackId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lyrics/${trackId}`);
      const data = await res.json();
      setLyricsData(data);
    } catch (err) {
      console.error('Failed to fetch lyrics:', err);
      setLyricsData({ notFound: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentTrack?.id) {
      fetchLyrics(currentTrack.id);
    } else {
      setLyricsData(null);
    }
  }, [currentTrack?.id]);

  const parsedLines = React.useMemo(() => {
    if (lyricsData?.syncedLyrics) {
      return parseLrc(lyricsData.syncedLyrics);
    }
    return [];
  }, [lyricsData?.syncedLyrics]);

  // Determine active synced line based on currentTime
  useEffect(() => {
    if (parsedLines.length === 0) {
      setActiveLineIdx(-1);
      return;
    }

    let foundIdx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time - 0.2) {
        foundIdx = i;
      } else {
        break;
      }
    }
    setActiveLineIdx(foundIdx);
  }, [currentTime, parsedLines]);

  // Smooth scroll active line into view
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIdx]);

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#b3b3b3]">
        <Mic2 size={48} className="mb-4 text-[#444]" />
        <h3 className="text-lg font-bold text-white mb-1">No track playing</h3>
        <p className="text-xs text-[#777]">Play a song to view live lyrics.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#1e1e1e] to-[#121212] overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#121212]/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3.5 truncate">
          <img
            src={currentTrack.cover_url || '/api/covers/0'}
            alt=""
            className="w-11 h-11 rounded-md object-cover shadow bg-[#222] shrink-0"
          />
          <div className="truncate">
            <h3 className="text-sm font-bold text-white truncate">{currentTrack.title}</h3>
            <p className="text-xs text-[#b3b3b3] truncate">{currentTrack.artist_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchLyrics(currentTrack.id)}
            disabled={isLoading}
            className="p-2 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
            title="Refresh Lyrics"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-[#1ed760]' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-[#b3b3b3] hover:text-white transition"
              title="Close Lyrics"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Lyrics Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 sm:px-12 md:px-20 py-16 scroll-smooth space-y-6 text-center md:text-left"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-24 text-[#b3b3b3] gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#1ed760] border-t-transparent" />
            <p className="text-xs font-medium">Fetching synchronized lyrics...</p>
          </div>
        ) : parsedLines.length > 0 ? (
          /* Synchronized Karaoke Lyrics */
          <div className="max-w-3xl mx-auto space-y-6 py-12">
            {parsedLines.map((line, idx) => {
              const isActive = idx === activeLineIdx;
              const isPast = idx < activeLineIdx;
              return (
                <p
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seek(line.time)}
                  className={`transition-all duration-300 font-black cursor-pointer leading-relaxed ${
                    isActive
                      ? 'text-white text-2xl sm:text-3xl md:text-4xl scale-105 origin-left drop-shadow-md'
                      : isPast
                      ? 'text-white/60 text-lg sm:text-xl md:text-2xl hover:text-white'
                      : 'text-white/30 text-lg sm:text-xl md:text-2xl hover:text-white/70'
                  }`}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : lyricsData?.plainLyrics ? (
          /* Plain Unsynced Lyrics */
          <div className="max-w-2xl mx-auto py-12 whitespace-pre-line text-white/80 font-medium text-base sm:text-lg leading-loose text-center">
            {lyricsData.plainLyrics}
          </div>
        ) : (
          /* Empty / Not Found State */
          <div className="flex flex-col items-center justify-center h-full py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-[#1f1f1f] flex items-center justify-center text-[#666] mb-4">
              <Music size={28} />
            </div>
            <h4 className="text-lg font-bold text-white mb-1.5">No lyrics available</h4>
            <p className="text-xs text-[#888] max-w-sm mb-6">
              We couldn't find lyrics for "{currentTrack.title}" by {currentTrack.artist_name} on LRCLIB or locally as a .lrc file.
            </p>
            <button
              onClick={() => fetchLyrics(currentTrack.id)}
              className="bg-[#1f1f1f] hover:bg-[#282828] text-white font-semibold text-xs px-4 py-2 rounded-full border border-white/10 transition flex items-center gap-2"
            >
              <RefreshCw size={13} />
              Try Searching Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
