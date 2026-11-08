# 🎵 MattLab Music

> **Self-Hosted High-Fidelity Music Streaming Platform & Media Management System**

[![Version](https://img.shields.io/badge/Version-1.1.0-1ed760?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED?style=flat-square&logo=docker)](https://www.docker.com)
[![Platform](https://img.shields.io/badge/Client-Web%20PWA%20%7C%20Windows-purple?style=flat-square)](docs/DESKTOP_APPLICATION.md)

MattLab Music is an enterprise-grade, self-hosted streaming application designed for audio enthusiasts and personal server environments. Built with modern web standards and asynchronous backend services, it delivers bit-perfect audio streaming, automated media cataloging, synchronized lyrics, and multi-client access with complete privacy and zero cloud dependencies.

---

## 📑 Documentation Suite

Comprehensive technical, operational, and user documentation is available in the [`docs/`](docs/) directory:

- 🏛️ **[System Architecture](docs/ARCHITECTURE.md)**: Network topology, streaming protocols, caching layers, and database schema.
- 📱 **[User & Navigation Guide](docs/USER_GUIDE.md)**: Interface layouts, responsive mobile sheets, Command Palette (`⌘K`), and keyboard shortcuts.
- ⚙️ **[Backend Services & Automation](docs/BACKEND_SERVICES.md)**: Automated acquisition pipeline, Spotify synchronization, lyrics crawler, auto-healer, and AI stem isolation.
- 💻 **[Desktop Application](docs/DESKTOP_APPLICATION.md)**: Windows portable Electron client, transparent acrylic miniplayer, and global media keys.
- 🚀 **[Deployment & Operations](docs/DEPLOYMENT.md)**: Production Docker Compose reference, Unraid guide, reverse proxy configuration, and disaster recovery.

---

## ✨ Core Capabilities

### 1. High-Fidelity Streaming Engine
- **Bit-Perfect Local Playback**: Streams lossless audio formats (FLAC up to 24-bit/192kHz, MP3 up to 320 kbps, AAC, M4A, Opus, and OGG).
- **RFC 7233 Partial Content Delivery**: Native HTTP 206 byte-range streaming for instant seeking and timeline scrubbing without re-downloading tracks.
- **Adaptive Bandwidth Transcoding**: Integrated FFmpeg engine providing on-demand 128 kbps transcoding for bandwidth-constrained mobile connections, backed by an intelligent server transcode cache.
- **Configurable Preload Buffer**: Client-side background pre-buffering (0 to 10 tracks) ensuring gapless song transitions even when server hard drives spin down.

### 2. Modern Island UI Architecture
- **Responsive Multi-Device Layout**: Tailored desktop split-pane experience, responsive tablet grid, and mobile touch interface with swipeable bottom sheets.
- **Progressive Web App (PWA)**: Full offline-capable shell, installable on iOS and Android devices with MediaSession API lock-screen media controls.
- **Hierarchical Settings Navigation**: iOS-style master-detail configuration menus for granular control over audio fidelity, buffer allocation, and interface transparency.
- **Command Palette (`⌘K` / `Ctrl+K`)**: Rapid keyboard-first navigation to search library catalogs, trigger system commands, or navigate interfaces in milliseconds.

### 3. Automated Media Ingestion & Discovery
- **High-Fidelity Media Acquisition**: Automated catalog searching and ingestion pipeline integrated with Lidarr and private indexers.
- **Spotify Chart & Playlist Reconciliation**: Daily synchronization of global Top 50 and Viral charts, with 1-click import of public Spotify playlists into local lossless tracks.
- **Smart Radio & Queue Autoplay**: Contextual recommendation engine matching track genres, eras, and popularity curves when active playback finishes.

### 4. Real-Time Lyrics & Media Visualizers
- **Sub-Second Karaoke Synchronization**: Live line-by-line scrolling lyrics powered by a multi-tier crawler (ID3 tags → local `.lrc` sidecars → LRCLIB API) protected by rate-limiting circuit breakers.
- **Integrated Lyrics Editor**: In-browser interactive timing studio for manual offset adjustment, line-by-line timestamp creation, and Romanization (Pinyin, Romaji, Hangul).
- **Dynamic Video Backgrounds**: High-definition looping video visualizers sourcing official Spotify Canvas MP4s and synchronized YouTube video streams.

### 5. Multi-User Administration & Library Watchdog
- **Role-Based Access Control**: Multi-user authentication supporting administrative and standard user roles, profile management, and custom avatar handling.
- **System Broadcast Bulletin**: Interactive administrative announcements board with real-time notifications and threaded community discussion.
- **Self-Healing Library Integrity Watchdog**: Continuous background service detecting corrupted rips, truncated bitstreams, or missing artwork, automatically re-fetching pristine releases.
- **AI Stem Isolation (Demucs)**: Neural network vocal and instrument isolation microservice separating audio into independent lossless stems (Vocals, Drums, Bass, Other).

---

## 🚀 Quick Start (Docker Compose)

The standard deployment configuration runs the application as an isolated container:

```yaml
services:
  mattlab-music:
    image: ghcr.io/mattlab/mattlab-music:latest
    container_name: mattlab-music
    restart: unless-stopped
    ports:
      - "8085:8085"
    volumes:
      - /mnt/user/appdata/mattlab-music/data:/data
      - /mnt/user/media/music:/music:ro
    environment:
      - MUSIC_DIR=/music
      - DATA_DIR=/data
      - DB_PATH=/data/music.db
      - COVERS_DIR=/data/covers
```

Launch the platform:
```bash
docker compose up -d
```

Navigate to `http://<your-server-ip>:8085` to complete the initial administrative setup.

---

## 🛠️ Management Commands

Execute operational commands directly inside the active container:

```bash
# Trigger an incremental media library scan
docker exec -it mattlab-music python3 -m app.scanner_cli

# Inspect real-time server runtime logs
docker logs -f mattlab-music
```

---

## 🛡️ License

This project is licensed under the terms of the MIT License.
