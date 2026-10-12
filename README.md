# 🎵 MattLab Music

> **Self-hosted, personal music streaming web application with a modern Spotify-inspired Island UI, built for Unraid.**

[![Live Domain](https://img.shields.io/badge/Live-music.mattdrive.com-1ed760?style=flat-square&logo=cloudflare)](https://music.mattdrive.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Deployment-Docker-2496ED?style=flat-square&logo=docker)](https://www.docker.com)
[![PWA](https://img.shields.io/badge/PWA-Ready-purple?style=flat-square)](https://music.mattdrive.com)

Minimal, blisteringly fast, and focused on essential Spotify-like music discovery without the bloat. Runs natively on your personal server and streams your high-resolution music library anywhere in the world.

---

## 🌟 Features

- **Continuous Audio Engine**: Persistent bottom player bar that never interrupts or resets audio during catalog navigation.
- **HTTP 206 Partial Content**: Native byte-range streaming allowing instant seeking and smooth audio scrubbing.
- **Lightning Fast Library Scanner**:
  - Incremental tag parser using Mutagen (MP3, FLAC, M4A, AAC, OGG).
  - Automatically caches and serves embedded/folder album artwork.
  - Re-scans 1,600+ tracks in **0.29 seconds**.
- **Spotify-Inspired UI**:
  - Dark matte aesthetic with album grids, artist discographies, and track tables.
  - Quick-play hover buttons.
  - Full active queue drawer with jump-to-track.
- **Playlists & Liked Songs**:
  - Heart icon on player and song rows to save to "Liked Songs".
  - Custom playlists: create, add tracks from search/albums, reorder, and remove.
- **Web MediaSession API**:
  - Native lock-screen album art, song title, and scrubbing on iOS, Android, and macOS.
  - Supports keyboard hardware media keys.
- **Global Keyboard Shortcuts**:
  - `Space`: Play / Pause
  - `Arrow Left` / `Arrow Right`: Seek -5s / +5s
  - `Arrow Up` / `Arrow Down`: Volume -5% / +5%
  - `Shift + N` / `Shift + P`: Next / Previous song
  - `M`: Toggle mute

---

## 🌐 Accessing the App

### On Local Network (LAN)
Open in any browser:
```
http://192.168.100.200:8085
```

### On iPhone / iPad / Android (Install as PWA)
1. Open `http://192.168.100.200:8085` in **Safari** (iOS) or **Chrome** (Android).
2. Tap the **Share** button (iOS) or **Menu ⋮** (Android).
3. Select **Add to Home Screen**.
4. The app will launch in full screen without browser toolbars, behaving like a native app with lock-screen audio controls!

### Away From Home (Remote Streaming via Tailscale)
If you run Tailscale on your Unraid server and on your phone:
1. Connect to Tailscale on your mobile device.
2. Open your Unraid MagicDNS name or Tailscale IP (e.g. `http://mattlab:8085` or `http://100.x.x.x:8085`).
3. Stream all your high-res FLAC and MP3 music anywhere in the world with zero port forwarding required!

---

## 📁 System Paths & Volumes

| Host Path | Container Path | Purpose |
| :--- | :--- | :--- |
| `/mnt/user/Media/Music` | `/music` (read-only `:ro`) | Your main music library share |
| `/mnt/cache/appdata/music-app` | `/data` | SQLite database (`music.db`) & cached album artwork (`/data/covers`) |
| `/mnt/user/Development/music-app` | `/app` | Source code repository |

> **Note**: Mounting `/mnt/cache/appdata/...` bypasses Unraid's FUSE `shfs` driver, providing native POSIX filesystem locks and SQLite WAL mode reliability.

---

## 🛠️ Management Commands

Inside `/mnt/user/Development/music-app`:

### Rebuilding or Restarting Containers
```bash
docker compose up -d --force-recreate
```

### Triggering Manual Library Scan via CLI
```bash
docker compose run --rm backend python -m app.scanner_cli
```

### Checking Backend Logs
```bash
docker compose logs -f backend
```
