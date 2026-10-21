import React, { useState, useEffect } from 'react';
import { Sun, Sunrise, Sunset, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const HomeGreeting = () => {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = now.getHours();

  let greeting = 'Good evening';
  let Icon = Sunset;
  let iconColor = 'text-rose-400';
  let ambientGradient = 'from-rose-500/10 via-transparent to-transparent';

  if (hours >= 5 && hours < 12) {
    greeting = 'Good morning';
    Icon = Sunrise;
    iconColor = 'text-amber-400';
    ambientGradient = 'from-amber-500/10 via-transparent to-transparent';
  } else if (hours >= 12 && hours < 18) {
    greeting = 'Good afternoon';
    Icon = Sun;
    iconColor = 'text-yellow-400';
    ambientGradient = 'from-yellow-500/10 via-transparent to-transparent';
  } else if (hours >= 18 && hours < 22) {
    greeting = 'Good evening';
    Icon = Sunset;
    iconColor = 'text-rose-400';
    ambientGradient = 'from-rose-500/10 via-transparent to-transparent';
  } else {
    greeting = 'Good night';
    Icon = Moon;
    iconColor = 'text-indigo-400';
    ambientGradient = 'from-indigo-500/10 via-transparent to-transparent';
  }

  const name = user?.display_name || user?.username;
  const greetingText = name ? `${greeting}, ${name}` : greeting;

  const timeString = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateString = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${ambientGradient} bg-surface-elevated/60 border border-border-subtle p-5 sm:p-6 shadow-sm backdrop-blur-md`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left: Dynamic Greeting */}
        <div className="flex items-center gap-3.5">
          <div className={`p-2.5 rounded-xl bg-surface-panel/80 border border-white/10 ${iconColor} shadow-inner shrink-0`}>
            <Icon size={24} className="stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-content-primary tracking-tight">
              {greetingText}
            </h1>
            <p className="text-xs sm:text-sm text-content-secondary mt-0.5">
              Welcome back to MattLab Music
            </p>
          </div>
        </div>

        {/* Right: Live Clock & Date Badge */}
        <div className="flex items-center sm:flex-col sm:items-end justify-between border-t border-white/5 sm:border-t-0 pt-3 sm:pt-0">
          <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono tracking-tight text-content-primary">
            {timeString}
          </div>
          <div className="text-xs text-content-secondary font-medium">
            {dateString}
          </div>
        </div>
      </div>
    </div>
  );
};
