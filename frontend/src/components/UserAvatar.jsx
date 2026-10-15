import React, { useState, useEffect } from 'react';

/**
 * Universal UserAvatar component for MattLab Music
 * Renders custom uploaded avatar photo or gracefully falls back to styled user initials.
 */
export const UserAvatar = ({ 
  user, 
  size = 'md', 
  className = '',
  ring = true,
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset error state if avatar_url changes (e.g. after uploading a new photo)
  useEffect(() => {
    setImageError(false);
  }, [user?.avatar_url]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-7 h-7 text-[11px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-20 h-20 text-2xl',
    '2xl': 'w-28 h-28 text-3xl',
  }[size] || 'w-9 h-9 text-xs';

  const displayName = user?.display_name || user?.username || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const isAdmin = user?.role === 'admin';

  if (user?.avatar_url && !imageError) {
    return (
      <div 
        className={`relative rounded-full overflow-hidden shrink-0 select-none bg-[#1e1e1e] ${sizeClasses} ${
          ring ? 'ring-1 ring-white/15 shadow-sm' : ''
        } ${className}`}
      >
        <img
          src={user.avatar_url}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-bold tracking-wider select-none ${sizeClasses} ${
        isAdmin 
          ? 'bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/30' 
          : 'bg-[#222222] text-[#e0e0e0] ring-1 ring-white/10'
      } ${className}`}
      title={displayName}
    >
      {initials}
    </div>
  );
};
