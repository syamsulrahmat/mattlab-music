import React, { useState } from 'react';
import { Music } from 'lucide-react';

export const PlaylistCover = ({ 
  covers = [], 
  size = 'w-12 h-12', 
  iconSize = 20, 
  className = '' 
}) => {
  const [failedIndices, setFailedIndices] = useState(new Set());

  const handleImageError = (index) => {
    setFailedIndices((prev) => new Set(prev).add(index));
  };

  const validCovers = (covers || []).filter((_, idx) => !failedIndices.has(idx));

  // 1. Four or more covers: Spotify-style 2x2 grid collage
  if (validCovers.length >= 4) {
    return (
      <div className={`${size} rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0 bg-surface-elevated2 border border-border-subtle shadow ${className}`}>
        {validCovers.slice(0, 4).map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            onError={() => handleImageError(i)}
            className="w-full h-full object-cover bg-surface-panel"
            loading="lazy"
          />
        ))}
      </div>
    );
  }

  // 2. 1 to 3 covers: Single hero artwork
  if (validCovers.length >= 1) {
    return (
      <div className={`${size} rounded-md overflow-hidden shrink-0 bg-surface-elevated2 border border-border-subtle shadow ${className}`}>
        <img
          src={validCovers[0]}
          alt=""
          onError={() => handleImageError(0)}
          className="w-full h-full object-cover bg-surface-panel"
          loading="lazy"
        />
      </div>
    );
  }

  // 3. Fallback: Default music note icon
  return (
    <div className={`${size} rounded-md flex items-center justify-center shrink-0 bg-gradient-to-br from-surface-hover to-surface-panel border border-border-subtle shadow ${className}`}>
      <Music size={iconSize} className="text-content-muted" />
    </div>
  );
};
