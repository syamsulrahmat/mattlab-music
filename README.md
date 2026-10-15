# 🎵 MattLab Music

> **Self-hosted personal music streaming web application with a modern Spotify-inspired Island UI, built for Unraid & Docker.**

[![Live Domain](https://img.shields.io/badge/Live-music.mattdrive.com-1ed760?style=flat-square&logo=cloudflare)](https://music.mattdrive.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Deployment-Docker-2496ED?style=flat-square&logo=docker)](https://www.docker.com)
[![Mobile Friendly](https://img.shields.io/badge/Mobile-Friendly%20(PWA)-purple?style=flat-square)](https://music.mattdrive.com)

Minimal, blisteringly fast, and focused on essential Spotify-like music discovery without the bloat. Runs natively on your personal server and streams your audio collection anywhere.

---

## 🌟 Features

- **Continuous Audio Engine**: Persistent bottom player bar that never interrupts or resets playback during catalog navigation.
- **HTTP 206 Partial Content**: Native byte-range streaming allowing instant seeking and smooth audio scrubbing.
- **Lightning-Fast Scanner**:
  - Incremental tag parser using Mutagen (MP3, FLAC, M4A, AAC, OGG).
  - Automatically caches and serves embedded/folder album artwork.
- **Spotify-Inspired Island UI**:
  - Dark matte aesthetic with album grids, artist discographies, and track tables.
  - Quick-play hover buttons, live search, and full active queue drawer.
- **Mobile Friendly**:
  - Fully responsive layout optimized for mobile screens.
  - Installable as a progressive web app (PWA) with native lock-screen media controls (MediaSession API).
- **Playlists & Liked Songs**:
  - Heart icon to save favorites.
  - Custom playlists: create, add tracks, reorder, and manage.
- **Global Keyboard Shortcuts**:
  - `Space`: Play / Pause
  - `Arrow Left` / `Arrow Right`: Seek -5s / +5s
  - `Arrow Up` / `Arrow Down`: Volume -5% / +5%
  - `Shift + N` / `Shift + P`: Next / Previous song
  - `M`: Toggle mute

---

## 🚀 Quick Start (Docker Compose)

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: mattlab-music
    restart: unless-stopped
    volumes:
      - ./backend/app:/app/app
      - ./frontend/dist:/app/frontend_dist:ro
      - /path/to/your/music:/music:ro
      - /path/to/appdata:/data
    environment:
      - MUSIC_DIR=/music
      - DATA_DIR=/data
      - DB_PATH=/data/music.db
      - COVERS_DIR=/data/covers
    ports:
      - "8085:8085"
```

Start the application:
```bash
docker compose up -d
```

---

## 🛠️ Management Commands

### Triggering Manual Library Scan via CLI
```bash
docker compose run --rm backend python -m app.scanner_cli
```

### Checking Backend Logs
```bash
docker compose logs -f backend
```
