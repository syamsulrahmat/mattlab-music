import React, { useState, useEffect, useRef } from 'react';
import { Edit2, AlertCircle } from 'lucide-react';

export const PromptModal = ({
  isOpen,
  title = 'Edit',
  message,
  initialValue = '',
  placeholder = 'Enter a value...',
  confirmText = 'Save',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  isLoading = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || '');
      setError('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, initialValue]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('This field cannot be empty');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div 
        className="bg-[#242424] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
            <Edit2 size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            {message && <p className="text-xs text-[#888] mt-0.5">{message}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
              placeholder={placeholder}
              disabled={isLoading}
              className="w-full bg-[#181818] border border-white/10 focus:border-brand-500 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none transition placeholder:text-[#666]"
            />
            {error && (
              <p className="flex items-center gap-1 text-[11px] text-red-400 mt-1.5">
                <AlertCircle size={12} />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#b3b3b3] hover:text-white hover:bg-white/5 transition disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={isLoading || !value.trim()}
              className="px-5 py-2 rounded-full text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black transition active:scale-95 disabled:opacity-50 shadow-lg shadow-brand-500/20"
            >
              {isLoading ? 'Saving...' : confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
