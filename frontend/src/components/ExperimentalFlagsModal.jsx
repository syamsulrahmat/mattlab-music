import React, { useState } from 'react';
import { 
  X, 
  FlaskConical, 
  AlertTriangle, 
  RotateCcw, 
  Search, 
  Lock, 
  Check, 
  Layers, 
  Sparkles 
} from 'lucide-react';
import { useDevFlags } from '../context/FlagsContext';

export const ExperimentalFlagsModal = ({ isOpen, onClose, showToast }) => {
  const { 
    flags, 
    setFlag, 
    resetAllFlags, 
    lockDevMode, 
    flagSpecs 
  } = useDevFlags();
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredSpecs = flagSpecs.filter((spec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      spec.title.toLowerCase().includes(q) ||
      spec.description.toLowerCase().includes(q) ||
      spec.category.toLowerCase().includes(q)
    );
  });

  const handleResetAll = () => {
    resetAllFlags();
    showToast?.('✨ All experimental flags reset to default');
  };

  const handleLock = () => {
    onClose();
    lockDevMode();
    showToast?.('🔒 Developer Mode locked');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative w-full max-w-3xl bg-surface-island border border-border-medium rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-border-medium flex items-center justify-between bg-surface-panel/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <FlaskConical size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Experimental Flags
              </h2>
              <p className="text-xs text-content-secondary mt-0.5">
                Internal developer switches & custom appearance overrides
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAll}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-subtle flex items-center gap-1.5 transition active:scale-95"
              title="Reset all flags to factory default"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset all</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-white/10 transition"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mx-5 mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-300 leading-relaxed">
          <AlertTriangle size={18} className="shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold">WARNING: EXPERIMENTAL FEATURES AHEAD!</span> By enabling these feature flags, you are customizing internal typography and audio pipelines. Changes apply immediately in real-time.
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search available flags..."
              className="w-full bg-surface-panel hover:bg-surface-elevated focus:bg-surface-elevated text-white pl-10 pr-4 py-2 rounded-xl text-xs font-medium outline-none border border-border-subtle focus:border-brand-500/50 transition placeholder-content-muted"
            />
          </div>
        </div>

        {/* Flags Scrollable List */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
          {filteredSpecs.map((spec) => {
            const currentValue = flags[spec.id] !== undefined ? flags[spec.id] : spec.default;
            const isModified = currentValue !== spec.default;

            return (
              <div 
                key={spec.id}
                className={`p-4 rounded-xl border transition ${
                  isModified 
                    ? 'bg-surface-panel/90 border-brand-500/30' 
                    : 'bg-surface-panel/40 border-border-subtle'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        {spec.title}
                      </h4>
                      {isModified && (
                        <span className="text-[9px] font-bold bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full uppercase">
                          Modified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-content-secondary leading-relaxed">
                      {spec.description}
                    </p>
                    <div className="text-[10px] text-content-muted font-semibold tracking-wider uppercase pt-0.5">
                      #{spec.id} • {spec.category}
                    </div>
                  </div>

                  <div className="shrink-0 sm:w-60">
                    {spec.type === 'select' ? (
                      <select
                        value={currentValue}
                        onChange={(e) => {
                          const val = isNaN(Number(e.target.value)) || e.target.value === '' 
                            ? e.target.value 
                            : Number(e.target.value);
                          setFlag(spec.id, val);
                        }}
                        className="w-full bg-surface-elevated hover:bg-surface-hover text-white text-xs font-semibold px-3 py-2 rounded-xl border border-border-medium outline-none cursor-pointer focus:border-brand-500 transition"
                      >
                        {spec.options.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-surface-island text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : spec.type === 'boolean' ? (
                      <select
                        value={currentValue ? 'true' : 'false'}
                        onChange={(e) => setFlag(spec.id, e.target.value === 'true')}
                        className="w-full bg-surface-elevated hover:bg-surface-hover text-white text-xs font-semibold px-3 py-2 rounded-xl border border-border-medium outline-none cursor-pointer focus:border-brand-500 transition"
                      >
                        <option value="false" className="bg-surface-island text-white">Disabled</option>
                        <option value="true" className="bg-surface-island text-brand-400 font-bold">Enabled</option>
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSpecs.length === 0 && (
            <div className="p-8 text-center text-content-secondary text-xs">
              No flags matched "{searchQuery}".
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-5 py-3 border-t border-border-medium bg-surface-panel/80 flex items-center justify-between text-xs">
          <div className="text-content-muted text-[11px]">
            Changes apply instantly to the current browser session.
          </div>
          <button
            onClick={handleLock}
            className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1.5 hover:underline transition"
            title="Lock Developer Mode and hide experiments"
          >
            <Lock size={12} />
            <span>Lock Developer Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};
