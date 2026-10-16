/**
 * MattLab Music — Central Lyrics Configuration & Theme
 * 
 * Edit this single file to customize typography, colors, animations,
 * and layout behaviors across all lyrics displays:
 * 1. YouTube-Style Video PiP (HTML5 Canvas 2D)
 * 2. Interactive Document PiP & Mini-Player (HTML / Tailwind)
 * 3. In-App Fullscreen Lyrics Page (HTML / Tailwind)
 */

import { DESIGN_TOKENS } from './designTokens';

export const LYRICS_CONFIG = {
  // ─── 1. TYPOGRAPHY & WEIGHTS ─────────────────────────────────────────
  typography: {
    // Tailwind font weight classes: 'font-light' (300), 'font-normal' (400), 'font-medium' (500), 'font-semibold' (600), 'font-bold' (700)
    activeWeightClass: DESIGN_TOKENS.font.bold,
    upcomingWeightClass: DESIGN_TOKENS.font.bold,
    pastWeightClass: DESIGN_TOKENS.font.bold,
    // Dynamic Canvas weight (Video PiP automatically syncs with activeWeightClass)
    get canvasWeight() {
      const cls = String(this.activeWeightClass || '');
      if (cls.includes('bold')) return '700';
      if (cls.includes('semibold')) return '600';
      if (cls.includes('medium')) return '500';
      if (cls.includes('light')) return '300';
      return 'normal';
    },
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  // ─── 2. COLORS & OPACITY (TIED TO TAILWIND DESIGN TOKENS) ────────────
  colors: {
    // Current singing line (Tailwind text class)
    activeClass: DESIGN_TOKENS.brand.hover, // e.g. text-brand-400
    
    // Background highlight pill behind active line in full/scrolling modes
    activeBgClass: DESIGN_TOKENS.brand.bgSubtle, // e.g. bg-brand-500/15
    
    // Upcoming lyric line color & opacity
    upcomingClass: 'text-white/50',
    
    // Past sung lyric line color & opacity
    pastClass: 'text-white/60',

    // Inactive / idle lyrics
    idleClass: 'text-white/30',

    // Dynamic Canvas accessors (Video PiP canvas reads the active CSS token)
    get canvasActiveColor() {
      return DESIGN_TOKENS.getCssVar('--brand-primary', 'rgb(30, 215, 96)');
    },
    canvasUpcomingColor: 'rgba(255, 255, 255, 0.45)',
  },

  // ─── 3. ANIMATIONS & TRANSITIONS ─────────────────────────────────────
  animation: {
    // Active line scale pop factor (1.0 = flat/no scale, 1.03 = subtle, 1.06 = punchy)
    activeScale: 1.03,
    
    // Color/opacity fade transition between lyric lines (in milliseconds)
    transitionDurationMs: 250,
    
    // Fullscreen auto-scroll speed when snapping to the next line (in milliseconds)
    scrollDurationMs: 650,
    
    // Auto-scroll curve: 'cubic' (smooth ease-out) or 'linear'
    scrollEasing: 'cubic',
  },

  // ─── 4. TIMING & BEHAVIOR ────────────────────────────────────────────
  timing: {
    // Lead-in offset in seconds: line highlights ahead of audio so the user can anticipate singing
    leadInOffsetSec: 0.25,
    
    // Wrap active lyric line in quotes: “Lyric Text” vs Lyric Text in PiP
    showQuotesInPiP: true,

    // Whether to display the upcoming 2nd line preview in PiP modes
    showUpcomingLine: true,
  },
};
