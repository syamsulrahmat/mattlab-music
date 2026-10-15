import colors from 'tailwindcss/colors';

/**
 * ========================================================
 * 🎨 MATTLAB MUSIC MASTER THEME SWITCHBOARD
 * ========================================================
 * To change your main theme, just change the color below!
 * Available Tailwind color palettes:
 *   - colors.green    (Spotify Vibrant Green)
 *   - colors.emerald  (Sleek Mint / Deep Emerald)
 *   - colors.cyan     (Electric Cyan)
 *   - colors.purple   (Cyberpunk Neon Purple)
 *   - colors.indigo   (Deep Royal Indigo)
 *   - colors.blue     (Electric Sky Blue)
 *   - colors.amber    (Warm Golden Sunset)
 *   - colors.rose     (Neon Rose Pink)
 */
const ACTIVE_THEME = colors.green;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Master brand palette (bg-brand-500, text-brand-700, hover:bg-brand-600, etc.)
        brand: {
          ...ACTIVE_THEME,
          DEFAULT: ACTIVE_THEME[500],
          hover: ACTIVE_THEME[400],
          dark: ACTIVE_THEME[700],
          light: ACTIVE_THEME[300],
        },

        // Semantic surface background hierarchy (pure black -> island -> panel -> elevated -> hover)
        surface: {
          base: '#000000',
          island: '#121212',
          panel: '#181818',
          elevated: '#1f1f1f',
          elevated2: '#242424',
          hover: '#282828',
          active: '#333333',
        },

        // Semantic text and content hierarchy (primary white -> secondary gray -> muted -> subtle)
        content: {
          primary: '#ffffff',
          secondary: '#b3b3b3',
          muted: '#888888',
          subtle: '#666666',
          accent: ACTIVE_THEME[400],
        },

        // Semantic borders & dividers
        border: {
          subtle: 'rgba(255, 255, 255, 0.05)',
          medium: 'rgba(255, 255, 255, 0.10)',
          strong: 'rgba(255, 255, 255, 0.20)',
          brand: ACTIVE_THEME[500],
        },

        // Legacy & Spotify aliases linked directly to the active brand theme
        spotify: {
          green: ACTIVE_THEME[500],
          base: "#000000",
          island: "#121212",
          elevated: "#1f1f1f",
          elevated2: "#242424",
          cardHover: "#282828",
          textPrimary: "#ffffff",
          textSecondary: "#b3b3b3",
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'island': '8px',
      },
    },
  },
  plugins: [],
}
