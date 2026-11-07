# Backend Services & Automation Engines

This document provides a detailed technical reference for the background workers, media acquisition pipelines, synchronization mechanisms, and automated repair services operating within MattLab Music.

---

## 1. Automated Media Acquisition Pipeline

The platform orchestrates automated catalog resolution and media ingestion through bidirectional integration with Lidarr and indexers.

```
[Client UI: Request Music Modal]
               |
               v
  (POST /api/request-music)
               |
               v
+-------------------------------+       +------------------------------------+
| Backend Acquisition Service   | ----> | Lidarr REST API                    |
| - Parse Artist / Album / Track|       | - Lookup MusicBrainz Release       |
| - Verify Existing Local Files |       | - Monitor & Dispatch Download Task |
+-------------------------------+       +------------------------------------+
                                                          |
                                                          v
                                                +--------------------+
                                                | Download Indexer   |
                                                | (qBittorrent / FLAC|
                                                +--------------------+
                                                          |
                                                          v
                                                +--------------------+
                                                | Storage Ingestion  |
                                                | (/music library)   |
                                                +--------------------+
```

### Ingestion Workflow
1. **Request Dispatching**: When an album, track, or playlist is submitted, the acquisition engine checks local storage to prevent duplicate downloads.
2. **Catalog Metadata Resolution**: Unresolved releases are indexed via MusicBrainz and dispatched to Lidarr.
3. **Automated Monitoring**: The background polling service monitors progress and notifies the client via WebSocket / polling, displaying real-time download status in the *Active Download Activity* drawer.
4. **Triggered Catalog Rescan**: Upon successful file landing in `/music`, an incremental scanner automatically registers the track with embedded artwork and tags into the SQLite database.

---

## 2. Spotify Sync & Chart Reconciliation Engine

The `spotify_sync` engine synchronizes external streaming charts and user playlists with local storage.

- **Automated Chart Indexing**: Scheduled background workers query the Spotify Web API for global Top 50, Viral 50, and national charts.
- **Fuzzy Signature Matching**: Tracks are resolved against local audio files using normalized artist-title Levenshtein string distance calculations and duration bounds.
- **Playlist Migration**: Users can import public Spotify playlist URLs. The service translates Spotify track IDs into local files and flags missing entries for automated acquisition.

---

## 3. Lyrics Crawling & Sub-Second Synchronization Engine

The lyrics engine implements a cascading multi-tier lookup protocol designed for rapid retrieval and resilience against external rate limiting.

### Cascading Lookup Protocol
1. **Tier 1: Embedded Audio Tags**: Scans Mutagen ID3 `USLT` / `SYLT` tags and FLAC Vorbis comments for pre-existing embedded lyrics.
2. **Tier 2: Local Sidecar Files**: Inspects the track directory for matching `.lrc` or `.txt` sidecar files.
3. **Tier 3: Remote Provider (LRCLIB API)**: Queries the public LRCLIB database for crowd-sourced, timestamped karaoke files.

### Resilience & Anti-Throttling Architecture
- **Strict Pacing**: Remote queries are throttled with a 2.5-second inter-request delay.
- **Negative 404 Caching**: Unmatched tracks are stored in `lyrics_cache` with an instrumental/unmatched flag to prevent repeated lookups.
- **Automatic Circuit Breaker**: If consecutive external calls return `429 Too Many Requests` or `5xx` server errors, the crawler enters a cooldown state for 60 seconds before resuming.

---

## 4. Self-Healing Library Watchdog & Integrity Repair

The `auto_healer` service acts as an autonomous data integrity supervisor:

- **Corrupted Audio Detection**: Validates audio bitstreams using Mutagen to identify truncated downloads, broken headers, or abrupt file cuts.
- **Missing Artwork Recovery**: Automatically extracts folder-level cover images (`cover.jpg`, `folder.png`) or pulls high-resolution art from MusicBrainz.
- **Automated Re-Fetch**: Files identified as irreversibly damaged are automatically flagged, purged, and re-dispatched to the acquisition pipeline for clean re-downloading.

---

## 5. AI Stem Isolation Service (Demucs Microservice)

The optional `demucs-service` enables on-demand neural network stem separation:

- **Model Architecture**: Utilizes Meta's `HTDemucs` (Hybrid Transformer Demucs) model running via PyTorch CUDA.
- **Separation Capabilities**: Isolates master audio tracks into four discrete, lossless 320 kbps stems:
  - `vocals`: Isolated lead and backing vocal track.
  - `drums`: Isolated percussive bitstream.
  - `bass`: Low-frequency basslines and synthesizers.
  - `other`: Melodic instruments, synthesizers, and guitars.
- **Interactive Karaoke**: Enables real-time vocal muting during synchronized lyrics playback.

---

## 6. Operational Notifications & Telegram Gateway

The notification subsystem (`telegram.py`) provides automated operational alerts to the administrator's Telegram bot using structured topic threading:

- **Development (`--dev` / Topic 9)**: Git synchronizations, container deployments, code verification results, and pull requests.
- **Music Telemetry (`--music` / Topic 6)**: Background lyrics crawling milestones, playlist import summaries, and chart synchronizations.
- **System Alerts (`--alerts` / Topic 12)**: Critical hardware errors, container restarts, or unrecoverable media exceptions.
- **Administrative Commands (`--commands` / Topic 3)**: Output from scheduled maintenance scripts and system status digests.
