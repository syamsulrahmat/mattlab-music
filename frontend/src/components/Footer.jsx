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
      className="mt-16 pt-10 pb-0 px-4 sm:px-8 border-t-0 md:border-t md:border-border-subtle bg-surface-base md:bg-surface-island text-xs text-content-secondary select-none"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          {/* Column 1: Brand & Status */}
          <div className="space-y-3">
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

            <p className="text-xs text-content-secondary leading-relaxed max-w-md">
              Personal lossless music streaming with Demucs AI stem separation, live synchronized lyrics, and Spotify chart sync.
            </p>

            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Server Online</span>
            </div>
          </div>

          {/* Column 2: Tools & Actions */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-content-primary">
              Tools & Actions
            </h4>
            <ul className="space-y-1.5">
              <li>
                <button
                  onClick={onOpenBugReport}
                  className="flex items-center gap-2.5 py-1 text-content-secondary hover:text-brand-500 transition group text-left cursor-pointer active:scale-[0.98]"
                >
                  <div className="relative shrink-0">
                    <Bug size={15} className="text-amber-400 group-hover:scale-110 transition" />
                    {hasResolvedIssues && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-surface-island" />
                    )}
                  </div>
                  <span className="text-xs text-content-secondary group-hover:text-content-primary transition">
                    Report an Issue / Bug
                  </span>
                  {hasResolvedIssues && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                      Update
                    </span>
                  )}
                </button>
              </li>

              {onRequestMusic && (
                <li>
                  <button
                    onClick={onRequestMusic}
                    className="flex items-center gap-2.5 py-1 text-content-secondary hover:text-brand-400 transition group text-left cursor-pointer active:scale-[0.98]"
                  >
                    <DownloadCloud size={15} className="text-brand-400 group-hover:scale-110 transition shrink-0" />
                    <span className="text-xs text-content-secondary group-hover:text-content-primary transition">Request Music (Lidarr)</span>
                  </button>
                </li>
              )}

              {isAdmin && onRefreshScan && (
                <li>
                  <button
                    onClick={onRefreshScan}
                    disabled={isScanning}
                    className="flex items-center gap-2.5 py-1 text-content-secondary hover:text-brand-500 transition group text-left cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                  >
                    <RefreshCw size={15} className={`text-brand-500 ${isScanning ? 'animate-spin' : 'group-hover:scale-110'} transition shrink-0`} />
                    <span className="text-xs text-content-secondary group-hover:text-content-primary transition">{isScanning ? 'Syncing Library...' : 'Rescan Music Library'}</span>
                  </button>
                </li>
              )}

              {/* Keyboard shortcuts: hidden on mobile, visible on desktop */}
              <li className="hidden md:block">
                <button
                  onClick={onOpenShortcuts}
                  className="flex items-center gap-2.5 py-1 text-content-secondary hover:text-content-primary transition group text-left cursor-pointer"
                >
                  <Keyboard size={15} className="text-sky-400 group-hover:scale-110 transition shrink-0" />
                  <span className="text-xs text-content-secondary group-hover:text-content-primary transition">Keyboard Shortcuts</span>
                </button>
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
