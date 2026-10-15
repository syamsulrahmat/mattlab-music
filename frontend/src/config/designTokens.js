/**
 * Global Design Tokens Reference & JavaScript Bridge
 * 
 * Centralized JS access for UI tokens defined in tailwind.config.js and index.css.
 * All React components and Web APIs (Canvas, DOM portals) should reference these tokens.
 */

export const DESIGN_TOKENS = {
  // Brand accents
  brand: {
    DEFAULT: 'text-brand-500',
    hover: 'text-brand-400',
    dark: 'text-brand-700',
    light: 'text-brand-300',
    bg: 'bg-brand-500',
    bgHover: 'bg-brand-400',
    bgSubtle: 'bg-brand-500/15',
    border: 'border-brand-500',
    borderSubtle: 'border-brand-500/30',
  },

  // Semantic surfaces
  surface: {
    base: 'bg-surface-base',           // #000000
    island: 'bg-surface-island',       // #121212
    panel: 'bg-surface-panel',         // #181818
    elevated: 'bg-surface-elevated',   // #1f1f1f
    elevated2: 'bg-surface-elevated2', // #242424
    hover: 'hover:bg-surface-hover',   // #282828
  },

  // Semantic content & typography
  content: {
    primary: 'text-content-primary',       // #ffffff
    secondary: 'text-content-secondary',   // #b3b3b3
    muted: 'text-content-muted',           // #888888
    subtle: 'text-content-subtle',         // #666666
    accent: 'text-content-accent',         // Active brand accent
  },

  // Semantic borders & dividers
  border: {
    subtle: 'border-border-subtle',   // rgba(255, 255, 255, 0.05)
    medium: 'border-border-medium',   // rgba(255, 255, 255, 0.10)
    strong: 'border-border-strong',   // rgba(255, 255, 255, 0.20)
  },

  // Standardized font weights
  font: {
    light: 'font-light',         // 300
    normal: 'font-normal',       // 400 (Regular)
    medium: 'font-medium',       // 500
    semibold: 'font-semibold',   // 600
    bold: 'font-bold',           // 700
    extrabold: 'font-extrabold', // 800
    black: 'font-black',         // 900
  },

  // Helper to read computed CSS variables (for Canvas 2D or dynamic JS)
  getCssVar: (varName, fallback = '') => {
    if (typeof window !== 'undefined') {
      try {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (val) return val;
      } catch (_) {}
    }
    return fallback;
  },
};
