/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: "#1ed760",
          base: "#000000",
          island: "#121212",
          elevated: "#1f1f1f",
          elevated2: "#242424",
          cardHover: "#282828",
          textPrimary: "#ffffff",
          textSecondary: "#b3b3b3",
        },
      },
      borderRadius: {
        'island': '8px',
      },
    },
  },
  plugins: [],
}
