# System Architecture & Technical Specifications

This document outlines the architectural topology, audio streaming protocol, relational data model, and security mechanisms powering MattLab Music.

---

## 1. High-Level System Topology

MattLab Music operates on a decoupled client-server architecture consisting of an asynchronous ASGI application server, an optimized relational persistence layer, asynchronous background worker pipelines, and multi-platform client applications.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  +---------------------------+  +---------------------------+  +----------------+ |
|  | Web Application (React 18)|  | Desktop Client (Electron)|  | Mobile PWA     | |
|  +---------------------------+  +---------------------------+  +----------------+ |
+-----------------------------------------------------------------------------------+
                                          |
                                    HTTPS / WSS
                                          |
+-----------------------------------------------------------------------------------+
|                             INGRESS & REVERSE PROXY                               |
|        (Cloudflare Tunnel / Nginx / Traefik - SSL Termination & Rate Limiting)    |
+-----------------------------------------------------------------------------------+
                                          |
                                    HTTP / 8085
                                          |
+-----------------------------------------------------------------------------------+
|                             APPLICATION RUNTIME                                   |
|  +-----------------------------------------------------------------------------+  |
|  | FastAPI / Uvicorn ASGI Application                                          |  |
|  | - Authentication & RBAC Middleware       - Audio Streaming Engine (HTTP 206)|  |
|  | - Catalog Metadata Services             - Transcoding Pipeline (FFmpeg)    |  |
|  | - Dynamic Search & Auto-Healing API     - Lyrics Crawler & Synchronization |  |
|  +-----------------------------------------------------------------------------+  |
|           |                           |                        |                  |
|           v                           v                        v                  |
|    +-------------+             +--------------+         +--------------+          |
|    | SQLite (WAL)|             | Music Volume |         | Transcode    |          |
|    | Database    |             | (/music)     |         | Cache (/data)|          |
|    +-------------+             +--------------+         +--------------+          |
+-----------------------------------------------------------------------------------+
            |                                           |
            v                                           v
+--------------------------+                +--------------------------+
|  EXTERNAL ORCHESTRATION  |                |   AI PROCESSING SERVICE  |
|  - Lidarr & qBittorrent  |                |   - Demucs Isolation API |
|  - Spotify Web API       |                |     (Vocal/Stem Isolation|
|  - LRCLIB Lyrics API     |                |      via PyTorch CUDA)   |
+--------------------------+                +--------------------------+
```

---

## 2. Audio Streaming Architecture

### RFC 7233 Byte-Range Delivery
Audio delivery implements RFC 7233 compliant `HTTP 206 Partial Content` streaming. When a client requests playback or scrubs along the timeline:
1. The client issues an HTTP `GET` request specifying the required byte interval in the `Range: bytes=start-end` header.
2. The server verifies the file's binary headers and dispatches the exact binary byte chunk with `Content-Range: bytes start-end/total`.
3. The client's HTML5 Audio buffer streams the slice instantly without awaiting the completion of the full track payload.

### Dual-Fidelity Delivery Modes
Playback fidelity is dynamically negotiated based on client preferences:
- **Original Stream (Default)**: Direct binary stream of the master audio file (`FLAC`, `MP3`, `M4A`, `AAC`, `Opus`, `OGG`) preserving 100% bit-perfect audio fidelity.
- **Data Saver Mode (Adaptive 128 kbps)**: On-demand real-time transcoding powered by `ffmpeg` converting input master streams to 128 kbps MP3/Opus. Transcoded segments are cached under `/data/transcode_cache/` to ensure immediate subsequent retrieval with zero CPU utilization.

### Client-Side Preload & Memory Management
The web client maintains an asynchronous track pre-buffering pipeline:
- Preloads up to $N$ subsequent queue tracks sequentially in background `Blob` allocations.
- Employs an LRU cache eviction mechanism revoking object URLs when tracks exit the buffer window.
- Eliminates mechanical spin-up delays on server storage arrays during track boundaries.

---

## 3. Relational Data Model

MattLab Music employs SQLite operating in **Write-Ahead Logging (WAL)** mode for concurrent reader-writer access. The core relational entities are structured as follows:

### Primary Entities

| Table | Purpose | Key Attributes |
| :--- | :--- | :--- |
| `tracks` | Individual audio records | `id, title, artist_id, album_id, duration, path, bitrate, format, track_no, disc_no, play_count, last_played_at, fingerprint` |
| `albums` | Album releases | `id, title, artist_id, release_year, cover_path, total_tracks, genre` |
| `artists` | Musical artists & bands | `id, name, bio, image_path, monthly_listeners` |
| `playlists` | User-defined playlist entities | `id, user_id, name, description, is_public, cover_path, created_at, updated_at` |
| `playlist_tracks`| Associative playlist mapping | `id, playlist_id, track_id, position, added_at` |
| `users` | Multi-user identity & credentials | `id, username, password_hash, display_name, role, avatar_path, preferences_json, created_at` |
| `lyrics_cache` | Cached synchronization data | `track_id, synced_lyrics, plain_lyrics, source, is_instrumental, updated_at` |
| `broadcasts` | Administrative bulletin posts | `id, author_id, title, content, is_pinned, created_at, updated_at` |
| `broadcast_replies`| Threaded bulletin comments | `id, broadcast_id, user_id, message, created_at` |
| `bug_reports` | Internal tracking & feedback | `id, user_id, title, description, category, status, created_at, resolved_at` |

---

## 4. Authentication, Session & Security Model

- **Session Handling**: Authentication issues cryptographically signed, secure `HTTP-Only` cookies preventing client-side Cross-Site Scripting (XSS) credential extraction.
- **Password Security**: Passwords are encrypted using modern `bcrypt` key-derivation functions with unique cryptographic salts.
- **Role-Based Access Control (RBAC)**:
  - `admin`: Complete library modification, media acquisition triggers, user management, and broadcast authority.
  - `user`: Personal playback, playlist creation, profile customisation, and bulletin commenting.
- **Sanitization & Defense-in-Depth**: Strict filesystem path verification prevents directory traversal outside `/music` and `/data`.
