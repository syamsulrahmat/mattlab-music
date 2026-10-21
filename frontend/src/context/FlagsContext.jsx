import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DEV_UNLOCK_KEY = 'mattlab_dev_mode_unlocked';
const FLAGS_STORAGE_KEY = 'mattlab_experimental_flags';

export const DEFAULT_FLAGS = {
  font_family: 'circular', // 'circular' | 'system' | 'inter' | 'outfit'
  theme_accent: 'default', // 'default' | 'emerald' | 'cyan' | 'purple' | 'amber' | 'rose'
  crossfade_curve: 260, // 0 | 150 | 260 | 500
  audio_hud: false, // true | false
};

const THEME_ACCENTS = {
  default: {
    primary: '#22c55e',
    hover: '#4ade80',
    dark: '#15803d',
    light: '#86efac',
  },
  emerald: {
    primary: '#10b981',
    hover: '#34d399',
    dark: '#047857',
    light: '#6ee7b7',
  },
  cyan: {
    primary: '#06b6d4',
    hover: '#22d3ee',
    dark: '#0e7490',
    light: '#67e8f9',
  },
  purple: {
    primary: '#a855f7',
    hover: '#c084fc',
    dark: '#7e22ce',
    light: '#d8b4fe',
  },
  amber: {
    primary: '#f59e0b',
    hover: '#fbbf24',
    dark: '#b45309',
    light: '#fcd34d',
  },
  rose: {
    primary: '#f43f5e',
    hover: '#fb7185',
    dark: '#be123c',
    light: '#fda4af',
  },
};

const FONT_FAMILIES = {
  circular: '"Circular Std", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  outfit: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export const FLAG_SPECS = [
  {
    id: 'font_family',
    title: 'Interface Font Family',
    description: 'Select the primary typography engine for all application menus, metadata, and cards.',
    category: 'Typography & Design',
    type: 'select',
    default: 'circular',
    options: [
      { value: 'circular', label: 'Circular Std (Spotify Signature Geometric Sans)' },
      { value: 'system', label: 'System Default (Native OS: SF Pro / Segoe UI / Roboto)' },
    ],
  },
  {
    id: 'theme_accent',
    title: 'Brand Color Accent Override',
    description: 'Dynamically recolor buttons, active highlights, play controls, and slider tracks.',
    category: 'Typography & Design',
    type: 'select',
    default: 'default',
    options: [
      { value: 'default', label: 'Spotify Green (Vibrant Green)' },
      { value: 'emerald', label: 'Emerald / Sleek Mint' },
      { value: 'cyan', label: 'Electric Cyan' },
      { value: 'purple', label: 'Cyberpunk Neon Purple' },
      { value: 'amber', label: 'Sunset Amber' },
      { value: 'rose', label: 'Neon Rose Pink' },
    ],
  },
  {
    id: 'crossfade_curve',
    title: 'Audio Equal-Power Crossfade Duration',
    description: 'Millisecond duration of studio loudness-matched crossfades when toggling audio streams or tracks.',
    category: 'Audio & Streaming',
    type: 'select',
    default: 260,
    options: [
      { value: 0, label: '0ms (Instantaneous Cut / No Crossfade)' },
      { value: 150, label: '150ms (Ultra-Fast Blend)' },
      { value: 260, label: '260ms (Studio Standard - Balanced)' },
      { value: 500, label: '500ms (Cinematic Deep Crossfade)' },
    ],
  },
  {
    id: 'audio_hud',
    title: 'Live Audio Diagnostics HUD',
    description: 'Display an on-screen floating telemetry badge reporting real-time buffer progress, decoders, and playback telemetry.',
    category: 'Debug & Performance',
    type: 'boolean',
    default: false,
  },
];

const FlagsContext = createContext(null);

export const FlagsProvider = ({ children }) => {
  const [isDevUnlocked, setIsDevUnlocked] = useState(() => {
    try {
      return localStorage.getItem(DEV_UNLOCK_KEY) === 'true';
    } catch (_) {
      return false;
    }
  });

  const [flags, setFlags] = useState(() => {
    try {
      const saved = localStorage.getItem(FLAGS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_FLAGS, ...JSON.parse(saved) };
      }
    } catch (_) {}
    return DEFAULT_FLAGS;
  });

  const [isFlagsModalOpen, setIsFlagsModalOpen] = useState(false);

  // Apply CSS custom properties dynamically to DOM
  const applyCSSVariables = useCallback((currentFlags) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // 1. Font Family
    const fontStr = FONT_FAMILIES[currentFlags.font_family] || FONT_FAMILIES.circular;
    root.style.setProperty('--font-family-sans', fontStr);

    // 2. Theme Accent
    const palette = THEME_ACCENTS[currentFlags.theme_accent] || THEME_ACCENTS.default;
    root.style.setProperty('--brand-primary', palette.primary);
    root.style.setProperty('--brand-hover', palette.hover);
    root.style.setProperty('--brand-dark', palette.dark);
    root.style.setProperty('--brand-light', palette.light);
  }, []);

  useEffect(() => {
    applyCSSVariables(flags);
  }, [flags, applyCSSVariables]);

  const unlockDevMode = useCallback(() => {
    setIsDevUnlocked(true);
    try {
      localStorage.setItem(DEV_UNLOCK_KEY, 'true');
    } catch (_) {}
  }, []);

  const lockDevMode = useCallback(() => {
    setIsDevUnlocked(false);
    setIsFlagsModalOpen(false);
    try {
      localStorage.setItem(DEV_UNLOCK_KEY, 'false');
      localStorage.removeItem(FLAGS_STORAGE_KEY);
    } catch (_) {}
    setFlags(DEFAULT_FLAGS);
    applyCSSVariables(DEFAULT_FLAGS);
  }, [applyCSSVariables]);

  const setFlag = useCallback((key, value) => {
    setFlags((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      applyCSSVariables(updated);
      return updated;
    });
  }, [applyCSSVariables]);

  const resetAllFlags = useCallback(() => {
    setFlags(DEFAULT_FLAGS);
    try {
      localStorage.removeItem(FLAGS_STORAGE_KEY);
    } catch (_) {}
    applyCSSVariables(DEFAULT_FLAGS);
  }, [applyCSSVariables]);

  return (
    <FlagsContext.Provider
      value={{
        isDevUnlocked,
        unlockDevMode,
        lockDevMode,
        flags,
        setFlag,
        resetAllFlags,
        isFlagsModalOpen,
        setIsFlagsModalOpen,
        flagSpecs: FLAG_SPECS,
      }}
    >
      {children}
    </FlagsContext.Provider>
  );
};

export const useDevFlags = () => {
  const context = useContext(FlagsContext);
  if (!context) {
    throw new Error('useDevFlags must be used within FlagsProvider');
  }
  return context;
};
