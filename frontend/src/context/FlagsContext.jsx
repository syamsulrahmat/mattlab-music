import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DEV_UNLOCK_KEY = 'mattlab_dev_mode_unlocked';
const FLAGS_STORAGE_KEY = 'mattlab_experimental_flags';

export const DEFAULT_FLAGS = {
  font_family: 'circular', // 'circular' | 'system' | 'inter' | 'outfit'
  theme_accent: 'default', // 'default' | 'emerald' | 'cyan' | 'purple' | 'amber' | 'rose'
  crossfade_curve: 260, // 0 | 150 | 260 | 500
  audio_hud: false, // true | false
  component_inspector: 'off', // 'off' | 'hover' | 'always'
};

const THEME_ACCENTS = {
  default: {
    500: '34 197 94',
    400: '74 222 128',
    300: '134 239 172',
    700: '21 128 61',
  },
  emerald: {
    500: '16 185 129',
    400: '52 211 153',
    300: '110 231 183',
    700: '4 120 87',
  },
  cyan: {
    500: '6 182 212',
    400: '34 211 238',
    300: '103 232 249',
    700: '14 116 144',
  },
  purple: {
    500: '168 85 247',
    400: '192 132 252',
    300: '216 180 254',
    700: '126 34 206',
  },
  amber: {
    500: '245 158 11',
    400: '251 191 36',
    300: '252 211 77',
    700: '180 83 9',
  },
  rose: {
    500: '244 63 94',
    400: '251 113 133',
    300: '253 164 175',
    700: '190 18 60',
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
  {
    id: 'component_inspector',
    title: 'Component Inspector & Visual Architecture Overlay',
    description: 'Display interactive outlines and labels on all UI components showing their name, file path, and purpose.',
    category: 'Debug & Performance',
    type: 'select',
    default: 'off',
    options: [
      { value: 'off', label: 'Disabled' },
      { value: 'hover', label: 'Hover to Inspect (Highlight active component under mouse)' },
      { value: 'always', label: 'Show All Badges (Persistent name tags on all components)' },
    ],
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
    const safeFlags = currentFlags || DEFAULT_FLAGS;

    // 1. Font Family
    const fontStr = FONT_FAMILIES[safeFlags.font_family] || FONT_FAMILIES.circular;
    root.style.setProperty('--font-family-sans', fontStr);

    // 2. Theme Accent
    const palette = THEME_ACCENTS[safeFlags.theme_accent] || THEME_ACCENTS.default;
    root.style.setProperty('--brand-500', palette[500]);
    root.style.setProperty('--brand-400', palette[400]);
    root.style.setProperty('--brand-300', palette[300]);
    root.style.setProperty('--brand-700', palette[700]);

    root.style.setProperty('--brand-primary', `rgb(${palette[500]})`);
    root.style.setProperty('--brand-hover', `rgb(${palette[400]})`);
    root.style.setProperty('--brand-dark', `rgb(${palette[700]})`);
    root.style.setProperty('--brand-light', `rgb(${palette[300]})`);
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
  }, []);

  const setFlag = useCallback((key, value) => {
    setFlags((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  }, []);

  const toggleComponentInspector = useCallback(() => {
    setFlags((prev) => {
      const current = prev.component_inspector || 'off';
      const next = current === 'off' ? 'hover' : current === 'hover' ? 'always' : 'off';
      const updated = { ...prev, component_inspector: next };
      try {
        localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  }, []);

  const resetAllFlags = useCallback(() => {
    setFlags(DEFAULT_FLAGS);
    try {
      localStorage.removeItem(FLAGS_STORAGE_KEY);
    } catch (_) {}
  }, []);

  return (
    <FlagsContext.Provider
      value={{
        isDevUnlocked,
        unlockDevMode,
        lockDevMode,
        flags,
        setFlag,
        toggleComponentInspector,
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
