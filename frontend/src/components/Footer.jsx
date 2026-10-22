import React from 'react';
import { 
  Bug, 
  DownloadCloud, 
  Keyboard, 
  RefreshCw, 
  Github, 
  ExternalLink, 
  HardDrive, 
  Sparkles, 
  Activity, 
  Server,
  Music,
  Disc3,
  Mic2
} from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { useAuth } from '../context/AuthContext';

export const Footer = ({
  stats,
  onOpenBugReport,
  onRequestMusic,
  onOpenShortcuts,
  onRefreshScan,
  isScanning = false,
  hasResolvedIssues = false,
}) => {
  const { isAdmin } = useAuth();

  return (
    <footer 
      data-dev-component="Footer"
      data-dev-file="src/components/Footer.jsx"
      data-dev-desc="Universal page footer with system telemetry, music request modal triggers, and shortcuts guide"
      className="mt-16 pt-12 pb-0 px-4 sm:px-8 border-t border-border-subtle bg-surface-island/40 text-xs text-content-secondary select-none"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Column 1: Brand & Status */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <MattLabLogo
                variant="badge"
                bgColor="var(--brand-primary)"
                color="var(--surface-base)"
                className="w-7 h-7 rounded-full shadow-md"
              />
              <span className="font-bold text-sm text-content-primary tracking-tight">
                MattLab Music
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-brand-500">
                v1.0.0
              </span>
            </div>

            <p className="text-[11px] text-content-secondary leading-relaxed">
              Personal lossless music streaming with Demucs AI stem separation, live synchronized lyrics, and Spotify chart sync.
            </p>

            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Server Online • Port 8085</span>
            </div>
          </div>

          {/* Column 2: Tools & Actions */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-content-primary">
              Tools & Actions
            </h4>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={onOpenBugReport}
                  className="flex items-center gap-2 text-content-secondary hover:text-brand-500 transition group text-left cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <Bug size={14} className="text-amber-400 group-hover:scale-110 transition" />
                    {hasResolvedIssues && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-surface-island" />
                    )}
                  </div>
                  <span className="font-semibold text-content-primary group-hover:text-brand-500">
                    Report an Issue / Bug
                  </span>
                  {hasResolvedIssues && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                      Update
                    </span>
                  )}
                </button>
              </li>

              {isAdmin && onRequestMusic && (
                <li>
                  <button
                    onClick={onRequestMusic}
                    className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition group text-left cursor-pointer"
                  >
                    <DownloadCloud size={14} className="text-brand-500 group-hover:scale-110 transition" />
                    <span>Request Music</span>
                  </button>
                </li>
              )}

              <li>
                <button
                  onClick={onOpenShortcuts}
                  className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition group text-left cursor-pointer"
                >
                  <Keyboard size={14} className="text-sky-400 group-hover:scale-110 transition" />
                  <span>Keyboard Shortcuts</span>
                </button>
              </li>

              {isAdmin && onRefreshScan && (
                <li>
                  <button
                    onClick={onRefreshScan}
                    disabled={isScanning}
                    className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition group text-left cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={`text-brand-500 ${isScanning ? 'animate-spin' : 'group-hover:scale-110'} transition`} />
                    <span>{isScanning ? 'Syncing Library...' : 'Rescan Music Library'}</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Column 3: Collection Statistics */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-content-primary">
              Library Stats
            </h4>
            {stats ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2 text-content-secondary">
                  <Music size={13} className="text-brand-500 shrink-0" />
                  <span>{stats.tracks?.toLocaleString() || 0} Tracks</span>
                </div>
                <div className="flex items-center gap-2 text-content-secondary">
                  <Disc3 size={13} className="text-purple-400 shrink-0" />
                  <span>{stats.albums?.toLocaleString() || 0} Albums</span>
                </div>
                <div className="flex items-center gap-2 text-content-secondary">
                  <Mic2 size={13} className="text-sky-400 shrink-0" />
                  <span>{stats.artists?.toLocaleString() || 0} Artists</span>
                </div>
                <div className="pt-0.5 text-[10px] text-content-subtle">
                  FastAPI • SQLite WAL • Vite React
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-content-subtle">Loading stats...</p>
            )}
          </div>

          {/* Column 4: Links & Ecosystem */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-content-primary">
              MattLab Ecosystem
            </h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/syamsulrahmat/mattlab-music"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-content-secondary hover:text-white transition group"
                >
                  <Github size={14} className="group-hover:scale-110 transition" />
                  <span>GitHub Repository</span>
                  <ExternalLink size={11} className="opacity-60" />
                </a>
              </li>
              <li>
                <a
                  href="http://192.168.100.200"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-content-secondary hover:text-white transition group"
                >
                  <Server size={14} className="group-hover:scale-110 transition text-emerald-400" />
                  <span>Unraid OS Dashboard</span>
                  <ExternalLink size={11} className="opacity-60" />
                </a>
              </li>
              <li className="pt-0.5">
                <span className="text-[10px] text-content-subtle block">
                  Alerts linked to @mattlabunraid_bot
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Vertically Centered with Symmetrical py-6 */}
        <div className="py-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-content-subtle">
          <div>
            © 2026 MattLab Music. Crafted for MattLab Unraid Server.
          </div>
          <div className="flex items-center gap-4">
            <span>Lossless FLAC</span>
            <span>•</span>
            <span>High-Res Audio</span>
            <span>•</span>
            <span>Self-Hosted</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
