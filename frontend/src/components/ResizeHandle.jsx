import React from 'react';

export const ResizeHandle = ({ 
  onMouseDown, 
  onTouchStart, 
  onDoubleClick, 
  isDragging = false,
  className = 'hidden md:flex',
  title = "Drag to resize sidebar (double-click to reset)"
}) => {
  return (
    <div
      role="separator"
      tabIndex={0}
      title={title}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDoubleClick={onDoubleClick}
      className={`relative z-20 items-center justify-center w-2 -mx-1 h-full cursor-col-resize select-none touch-none group shrink-0 ${className}`}
    >
      {/* 2px Visual Indicator Line */}
      <div
        className={`w-0.5 h-12 rounded-full transition-all duration-150 ${
          isDragging
            ? 'h-full bg-brand-500 shadow-[0_0_8px_rgba(var(--brand-500),0.8)] opacity-100'
            : 'bg-white/10 group-hover:bg-brand-500/80 group-hover:h-20 group-hover:shadow-[0_0_6px_rgba(var(--brand-500),0.4)]'
        }`}
      />
    </div>
  );
};
