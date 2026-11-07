# Production Deployment & Operations

This document outlines deployment configurations, reverse proxy setup, security hardening, and backup procedures for MattLab Music.

---

## 1. System Requirements

### Minimum Hardware
- **CPU**: 2 Cores (x86_64 or ARM64)
- **RAM**: 2 GB (4 GB recommended if enabling on-demand transcoding)
- **Storage**: SSD for the `/data` directory (SQLite database and cover cache) for optimal query latency.

### Software Prerequisites
- Docker Engine 20.10+
- Docker Compose v2+
- (Optional) NVIDIA Container Toolkit if utilizing the Demucs stem isolation microservice with CUDA acceleration.

---

## 2. Production Docker Compose Reference

```yaml
version: '3.8'

services:
  mattlab-music:
    image: ghcr.io/mattlab/mattlab-music:1.0.0
    container_name: mattlab-music
    restart: unless-stopped
    ports:
      - "8085:8085"
    volumes:
      # Persistent application data (SQLite database, album cover cache, transcode cache)
      - /mnt/user/appdata/mattlab-music/data:/data
      # Read-only audio library volume
      - /mnt/user/media/music:/music:ro
    environment:
      - MUSIC_DIR=/music
      - DATA_DIR=/data
      - DB_PATH=/data/music.db
      - COVERS_DIR=/data/covers
      - TRANSCODE_CACHE_DIR=/data/transcode_cache
      - PORT=8085
      # Optional: Telegram alert routing
      - TELEGRAM_BOT_TOKEN=your_token_here
      - TELEGRAM_CHAT_ID=your_chat_id_here
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8085/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

  # Optional: AI Stem Separation Service
  demucs-service:
    image: ghcr.io/mattlab/demucs-service:latest
    container_name: mattlab-demucs
    restart: unless-stopped
    ports:
      - "8086:8086"
    volumes:
      - /mnt/user/appdata/mattlab-music/demucs-cache:/cache
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## 3. Reverse Proxy & Ingress Configuration

### Nginx Reverse Proxy
Ensure byte-range headers and WebSocket upgrade directives are preserved:

```nginx
server {
    listen 443 ssl http2;
    server_name music.example.com;

    ssl_certificate /etc/letsencrypt/live/music.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.example.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forwarded identity
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering for instant byte-range audio seeking
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Cloudflare Tunnel Configuration
If utilizing Cloudflare Tunnel (`cloudflared`):
```yaml
ingress:
  - hostname: music.example.com
    service: http://localhost:8085
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
```

---

## 4. Backup & Disaster Recovery

### Database Hot Backup (SQLite WAL Mode)
Because SQLite operates with Write-Ahead Logging (`WAL`), create consistent hot backups directly from the host without stopping the container:

```bash
# Execute safe transactional backup
docker exec mattlab-music sqlite3 /data/music.db ".backup '/data/backup-music.db'"

# Synchronize backup artifact to disaster storage
rsync -av /mnt/user/appdata/mattlab-music/data/backup-music.db /mnt/user/backups/mattlab-music/
```

### Library Re-Index Recovery
If the database is damaged or lost, full recovery takes only minutes:
1. Re-launch the container with an empty `/data` directory.
2. Complete the initial admin setup in the web browser.
3. Trigger a complete library rescan via the CLI or Settings modal:
   ```bash
   docker exec mattlab-music python3 -m app.scanner_cli
   ```
4. The scanner automatically re-indexes all artist/album metadata, duration, bitrates, and embedded artwork.
