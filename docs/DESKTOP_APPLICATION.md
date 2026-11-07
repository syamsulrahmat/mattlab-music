# Native Desktop Application

The MattLab Music Desktop Client is an Electron-based application delivering an integrated desktop listening experience with native operating system capabilities.

---

## 1. Architectural Overview

The desktop client bridges the production web bundle with desktop-grade APIs:

```
+-------------------------------------------------------------+
|               MATTLAB MUSIC DESKTOP (ELECTRON)              |
|                                                             |
|  +-------------------------------------------------------+  |
|  | Main Process (Node.js runtime)                         |  |
|  | - Window lifecycle management                         |  |
|  | - Transparent acrylic / glassmorphism frameless shell |  |
|  | - Global OS media key hooks (IPC)                     |  |
|  | - System tray minimization & background playback      |  |
|  +-------------------------------------------------------+  |
|                             |                               |
|                     IPC Bridge (preload.js)                 |
|                             |                               |
|  +-------------------------------------------------------+  |
|  | Renderer Process (Chromium runtime)                   |  |
|  | - React 18 production client                          |  |
|  | - HTML5 Audio Engine & WebAudio filters               |  |
|  | - Spotify-style custom titlebar window controls       |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Key Desktop Capabilities

### Transparent Acrylic Floating Miniplayer
- **Frameless Window Shell**: The miniplayer operates as an independent, frameless desktop window supporting drag-and-drop repositioning anywhere on the screen.
- **Glassmorphic Vibrancy**: Utilizes Windows DWM (Desktop Window Manager) acrylic blur effects, allowing desktop wallpaper and background applications to shine through.
- **Always-On-Top Multitasking**: Keeps active track artwork, synchronized karaoke lyrics, and playback controls pinned above full-screen editors or games.

### Global Hardware Media Keys
The client registers system-level media key shortcuts:
- `MediaPlayPause`: Global play/pause toggle.
- `MediaTrackNext`: Skip to next track in queue.
- `MediaTrackPrevious`: Skip to previous track or restart current track.
- `MediaStop`: Stop playback and unload audio buffer.

### Persistent Background Playback & System Tray
- Closing the main application window minimizes execution to the Windows system tray rather than terminating the process.
- Audio playback continues seamlessly in the background without interruptions.

---

## 3. Build & Packaging Guide

To package the standalone portable Windows executable:

```bash
cd desktop

# Install build dependencies
npm install

# Compile production React assets
npm run build:frontend

# Package portable Windows executable (.zip / .exe)
npm run package:portable
```

The resulting artifact `MattLab-Music-Windows-Portable.zip` is placed in `desktop/dist/` and served automatically via the web application's **About & System** download link.
