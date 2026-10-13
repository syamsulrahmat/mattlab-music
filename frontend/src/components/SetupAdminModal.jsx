import React, { useState } from 'react';
import { ShieldCheck, User, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { useAuth } from '../context/AuthContext';

export const SetupAdminModal = () => {
  const { setupAdmin } = useAuth();
  const [username, setUsername] = useState('admin');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (password.length < 3) {
      setError('Password must be at least 3 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      await setupAdmin({
        username: username.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
      });
    } catch (err) {
      setError(err.message || 'Failed to setup admin account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <MattLabLogo
            variant="badge"
            bgColor="#1ed760"
            color="#000000"
            className="w-14 h-14 rounded-full shadow-lg mb-3"
          />
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Welcome to MattLab Music
          </h1>
          <p className="text-xs sm:text-sm text-[#a7a7a7] mt-1 max-w-xs">
            Create your primary <span className="text-[#1ed760] font-semibold">Admin Account</span> to secure your server.
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
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Admin Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or matt"
                required
                autoFocus
                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
              />
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Display Name <span className="text-[#666] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Matt"
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                <Lock size={16} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                <Lock size={16} />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-[#1ed760] hover:bg-[#1fdf64] text-black font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Create Admin Account</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[#727272]">
          Your account is stored securely in your self-hosted SQLite database.
        </div>
      </div>
    </div>
  );
};
