import React, { useState } from 'react';
import { LogIn, User, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { MattLabLogo } from './MattLabLogo';
import { useAuth } from '../context/AuthContext';

export const LoginModal = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-sm bg-[#121212] border border-white/10 rounded-2xl p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <MattLabLogo
            variant="badge"
            bgColor="#1ed760"
            color="#000000"
            className="w-14 h-14 rounded-full shadow-lg mb-3"
          />
          <h1 className="text-2xl font-black tracking-tight text-white">
            Log in to MattLab Music
          </h1>
          <p className="text-xs sm:text-sm text-[#a7a7a7] mt-1">
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
            <label className="block text-xs font-semibold text-[#b3b3b3] mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                autoFocus
                autoComplete="username"
                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
              />
            </div>
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
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
                className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-[#666] outline-none focus:border-[#1ed760] focus:ring-1 focus:ring-[#1ed760] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#727272] hover:text-white transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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

        <div className="mt-6 text-center text-xs text-[#727272]">
          MattLab Unraid Music Platform
        </div>
      </div>
    </div>
  );
};
