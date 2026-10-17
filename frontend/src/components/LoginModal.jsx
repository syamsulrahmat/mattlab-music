import React, { useState } from 'react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none overflow-hidden">
      {/* Ambient Aurora Orbs Background (Pure GPU-accelerated CSS) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Orb 1: MattLab Signature Emerald (Top-Left to Center Orbit) */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] sm:w-[480px] sm:h-[480px] rounded-full bg-emerald-500/22 blur-[110px] animate-aurora-1" />

        {/* Orb 2: Server Cyan (Bottom-Right to Center Orbit) */}
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] rounded-full bg-cyan-500/18 blur-[120px] animate-aurora-2" />

        {/* Orb 3: Central Deep Teal Pulsing Core */}
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] rounded-full bg-teal-500/15 blur-[90px] animate-aurora-core" />

        {/* Subtle Dark Radial Vignette for Contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      {/* Login Modal Card */}
      <div className="relative z-10 w-full max-w-sm min-h-[530px] bg-surface-island/90 backdrop-blur-xl border border-white/10 rounded-2xl p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col justify-between animate-in fade-in zoom-in-95 duration-200">
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
