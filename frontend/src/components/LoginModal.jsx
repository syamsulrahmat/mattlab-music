import React, { useState, useEffect, useMemo } from 'react';
import { LogIn, User, Lock, AlertCircle, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { useAuth } from '../context/AuthContext';

export const LoginModal = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [coverUrls, setCoverUrls] = useState([]);

  // Fetch sample album covers from user's music library for the background wall
  useEffect(() => {
    let isMounted = true;
    const fetchCovers = async () => {
      try {
        const res = await fetch('/api/covers-sample?limit=30');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.covers) && data.covers.length > 0) {
            setCoverUrls(data.covers);
          }
        }
      } catch {
        // Fall back gracefully to clean background
      }
    };
    fetchCovers();
    return () => {
      isMounted = false;
    };
  }, []);

  // Split into 5 vertical columns, duplicated for seamless infinite -50% marquee loop
  const columns = useMemo(() => {
    if (!coverUrls.length) return [];
    const cols = [[], [], [], [], []];
    coverUrls.forEach((url, idx) => {
      cols[idx % 5].push(url);
    });
    return cols
      .filter((col) => col.length > 0)
      .map((col) => [...col, ...col]);
  }, [coverUrls]);

  const checkCapsLock = (e) => {
    if (e?.getModifierState) {
      const caps = e.getModifierState('CapsLock');
      setIsCapsLockOn(Boolean(caps));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login({ username: username.trim(), password });
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 select-none overflow-hidden">
      {/* Animated Album Art Grid (Angled Parallax Columns) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
        {columns.length > 0 && (
          <div className="absolute -inset-[35%] flex justify-center gap-4 sm:gap-6 md:gap-8 rotate-[-12deg] scale-105 opacity-[0.22] transition-opacity duration-1000">
            {columns.map((colCovers, colIdx) => {
              // Alternate vertical scrolling directions & varied speeds for natural parallax
              const animClass =
                colIdx % 2 === 0
                  ? colIdx === 2
                    ? 'animate-marquee-up-slower'
                    : 'animate-marquee-up-slow'
                  : colIdx === 3
                    ? 'animate-marquee-down-slower'
                    : 'animate-marquee-down-slow';

              return (
                <div key={colIdx} className={`flex flex-col gap-4 sm:gap-6 md:gap-8 shrink-0 ${animClass}`}>
                  {colCovers.map((url, imgIdx) => (
                    <div
                      key={imgIdx}
                      className="w-32 h-32 sm:w-44 sm:h-44 md:w-52 md:h-52 rounded-2xl overflow-hidden shadow-2xl bg-surface-island/70 border border-white/5 shrink-0"
                    >
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Cinematic Vignette & Radial Contrast Gradients for Razor-sharp Card Focus */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/80" />
      </div>

      {/* Login Modal Card */}
      <div className="relative z-10 w-full max-w-sm min-h-[530px] bg-surface-island/92 backdrop-blur-2xl border border-white/10 rounded-2xl p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col justify-between animate-in fade-in zoom-in-95 duration-200">
        <div>
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <MattLabLogo
              variant="badge"
              bgColor="var(--brand-primary)"
              color="var(--surface-base)"
              className="w-14 h-14 rounded-full shadow-lg mb-3"
            />
            <h1 className="text-2xl font-black tracking-tight text-content-primary">
              Log in to MattLab Music
            </h1>
            <p className="text-xs sm:text-sm text-content-secondary mt-1">
              Enter your credentials to access the music server
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onClick={checkCapsLock}
                  onFocus={checkCapsLock}
                  placeholder="Username"
                  required
                  autoFocus
                  autoComplete="username"
                  className="w-full bg-surface-elevated border border-border-medium rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-content-primary placeholder:text-content-subtle outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onClick={checkCapsLock}
                  onFocus={checkCapsLock}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-surface-elevated border border-border-medium rounded-xl pl-10 pr-10 py-2.5 text-sm text-content-primary placeholder:text-content-subtle outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-content-subtle hover:text-content-primary transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Dedicated Caps Lock Status Slot (Stationary Above Log In) */}
            <div className="min-h-[32px] flex items-center">
              {isCapsLockOn && (
                <div className="w-full px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-2 text-amber-400 text-xs animate-in fade-in slide-in-from-top-1 duration-150 shadow-sm">
                  <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                  <span className="font-semibold">Caps Lock is on</span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-brand-500 hover:bg-brand-400 text-black font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Logging In...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Log In</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-content-subtle">
          MattLab Unraid Music Platform
        </div>
      </div>
    </div>
  );
};
