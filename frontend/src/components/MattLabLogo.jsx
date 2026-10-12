import React from 'react';

/**
 * MattLabLogo - Dynamic SVG vector component for MattLab Music
 * Based on the latest artwork with continuous equalizer waveform polyline.
 * 
 * @param {'badge' | 'icon'} variant - 'badge' includes circular background wrapper; 'icon' is pure vector logo
 * @param {string} color - Fill & stroke color for the headphones/equalizer (default 'currentColor')
 * @param {string} bgColor - Background color for the circular badge (default '#1ed760')
 * @param {string} className - Tailwind or CSS class string
 */
export const MattLabLogo = ({
  variant = 'badge',
  color = 'currentColor',
  bgColor = '#1ed760',
  className = 'w-8 h-8',
  ...props
}) => {
  if (variant === 'icon') {
    // Pure vector icon with tight bounding box (spans full width 0-1000, height 90-860)
    return (
      <svg
        viewBox="0 70 1000 810"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <g fill={color} stroke={color}>
          {/* Left Earcup */}
          <path
            d="M130.62,520.32h0v337.75h0C58.53,858.07,0,799.54,0,727.45v-76.52C0,578.85,58.53,520.32,130.62,520.32h0Z"
            stroke="none"
          />
          {/* Right Earcup */}
          <path
            d="M869.38,858.07h0v-337.75h0c72.09,0,130.62,58.53,130.62,130.62v76.52c0,72.09-58.53,130.62-130.62,130.62h0Z"
            stroke="none"
          />
          {/* Headband Arch */}
          <path
            d="M869.38,810.45v-299.13c0-204.03-165.37-369.38-369.38-369.38S130.62,307.32,130.62,511.33v299.13"
            fill="none"
            strokeWidth="94.81"
            strokeLinecap="round"
            strokeMiterlimit="10"
          />
          {/* Equalizer Waveform Polyline */}
          <polyline
            points="789.46 686.59 736.39 686.59 703.35 623.26 650.8 759.25 573.14 547.27 500 843.14 426.86 547.27 349.2 759.25 296.65 623.26 263.61 686.59 210.54 686.59"
            fill="none"
            strokeWidth="32.18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );
  }

  // Variant: 'badge' (Full-bleed circular wrapper)
  return (
    <svg
      viewBox="0 0 1000 1000"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Circular wrapper container */}
      <circle cx="500" cy="500" r="490" fill={bgColor} />
      {/* Scaled logo centered inside circle badge */}
      <g transform="translate(500, 500) scale(0.72) translate(-500, -485)" fill={color} stroke={color}>
        {/* Left Earcup */}
        <path
          d="M130.62,520.32h0v337.75h0C58.53,858.07,0,799.54,0,727.45v-76.52C0,578.85,58.53,520.32,130.62,520.32h0Z"
          stroke="none"
        />
        {/* Right Earcup */}
        <path
          d="M869.38,858.07h0v-337.75h0c72.09,0,130.62,58.53,130.62,130.62v76.52c0,72.09-58.53,130.62-130.62,130.62h0Z"
          stroke="none"
        />
        {/* Headband Arch */}
        <path
          d="M869.38,810.45v-299.13c0-204.03-165.37-369.38-369.38-369.38S130.62,307.32,130.62,511.33v299.13"
          fill="none"
          strokeWidth="94.81"
          strokeLinecap="round"
          strokeMiterlimit="10"
        />
        {/* Equalizer Waveform Polyline */}
        <polyline
          points="789.46 686.59 736.39 686.59 703.35 623.26 650.8 759.25 573.14 547.27 500 843.14 426.86 547.27 349.2 759.25 296.65 623.26 263.61 686.59 210.54 686.59"
          fill="none"
          strokeWidth="32.18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};
