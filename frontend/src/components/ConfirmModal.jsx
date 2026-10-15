import React, { useEffect } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'primary'
  onConfirm,
  onClose,
  isLoading = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div 
        className="bg-surface-elevated2 border border-border-medium rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${
          isDanger 
            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
            : 'bg-brand-500/10 border-brand-500/20 text-brand-400'
        }`}>
          {isDanger ? <AlertTriangle size={24} /> : <Info size={24} />}
        </div>

        <div>
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          {message && (
            <p className="text-xs text-content-muted mt-1.5 leading-relaxed">
              {message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-full text-xs font-semibold text-content-secondary hover:text-white hover:bg-white/5 transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 rounded-full text-xs font-bold transition active:scale-95 shadow-lg disabled:opacity-50 ${
              isDanger
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                : 'bg-brand-500 hover:bg-brand-400 text-black shadow-brand-500/20'
            }`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
