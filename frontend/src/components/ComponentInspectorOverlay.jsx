import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDevFlags } from '../context/FlagsContext';
import { usePlayer } from '../context/PlayerContext';
import { Copy, Eye, EyeOff, Layers, Sparkles, GripVertical } from 'lucide-react';

export const ComponentInspectorOverlay = () => {
  const { isDevUnlocked, flags, setFlag, toggleComponentInspector } = useDevFlags();
  const { showToast } = usePlayer();
  const inspectorMode = flags.component_inspector || 'off'; // 'off' | 'hover' | 'always'

  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [allTaggedElements, setAllTaggedElements] = useState([]);
  const [copiedName, setCopiedName] = useState(null);
  const [isDockExpanded, setIsDockExpanded] = useState(false);

  // Draggable floating dock position state
  const [dockPos, setDockPos] = useState(() => {
    try {
      const saved = localStorage.getItem('mattlab_inspector_dock_pos');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return null;
  });
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startLeft: 0, startTop: 0, hasMoved: false });
  const dockRef = useRef(null);

  const handlePointerDown = (e) => {
    // Only drag with left click or touch
    if (e.button !== undefined && e.button !== 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dockEl = dockRef.current;
    if (!dockEl) return;
    const rect = dockEl.getBoundingClientRect();

    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false,
    };
    setIsDraggingDock(true);
  };

  useEffect(() => {
    if (!isDraggingDock) return;

    const handlePointerMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragStartRef.current.hasMoved = true;
      }

      const dockEl = dockRef.current;
      const dockWidth = dockEl ? dockEl.offsetWidth : 260;
      const dockHeight = dockEl ? dockEl.offsetHeight : 40;

      const rawLeft = dragStartRef.current.startLeft + dx;
      const rawTop = dragStartRef.current.startTop + dy;

      const clampedLeft = Math.max(8, Math.min(window.innerWidth - dockWidth - 8, rawLeft));
      const clampedTop = Math.max(8, Math.min(window.innerHeight - dockHeight - 8, rawTop));

      setDockPos({ x: clampedLeft, y: clampedTop });
    };

    const handlePointerUp = () => {
      setIsDraggingDock(false);
      setDockPos((curr) => {
        if (curr) {
          try {
            localStorage.setItem('mattlab_inspector_dock_pos', JSON.stringify(curr));
          } catch (_) {}
        }
        return curr;
      });
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingDock]);

  // Copy component reference to clipboard
  const handleCopyComponent = useCallback((name, file, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const snippet = `<${name} /> (${file || 'frontend/src/components'})`;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedName(name);
      if (showToast) {
        showToast(`📋 Copied "${snippet}" to clipboard!`);
      }
      setTimeout(() => setCopiedName(null), 2000);
    }).catch(() => {
      if (showToast) {
        showToast(`📋 Component: <${name} />`);
      }
    });
  }, [showToast]);

  // Query and measure all tagged elements for 'always' mode
  const refreshAllElements = useCallback(() => {
    if (inspectorMode !== 'always') {
      setAllTaggedElements([]);
      return;
    }
    const nodes = Array.from(document.querySelectorAll('[data-dev-component]'));
    const measurements = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('data-dev-component'),
        file: node.getAttribute('data-dev-file') || '',
        desc: node.getAttribute('data-dev-desc') || '',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        isVisible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight,
      };
    }).filter((item) => item.isVisible);

    setAllTaggedElements(measurements);
  }, [inspectorMode]);

  // Recalculate 'always' mode positions on scroll, resize, or tab switches
  useEffect(() => {
    if (inspectorMode === 'always') {
      refreshAllElements();
      const handleUpdate = () => refreshAllElements();
      window.addEventListener('resize', handleUpdate, { passive: true });
      window.addEventListener('scroll', handleUpdate, { passive: true, capture: true });
      const timer = setInterval(handleUpdate, 1500);
      return () => {
        window.removeEventListener('resize', handleUpdate);
        window.removeEventListener('scroll', handleUpdate, { capture: true });
        clearInterval(timer);
      };
    } else {
      setAllTaggedElements([]);
    }
  }, [inspectorMode, refreshAllElements]);

  // Mousemove listener for 'hover' mode
  useEffect(() => {
    if (inspectorMode !== 'hover') {
      setHoveredInfo(null);
      return;
    }

    const handleMouseMove = (e) => {
      // Ignore if hovering the inspector controller dock itself
      if (e.target.closest('#dev-component-inspector-dock')) {
        return;
      }

      // Find closest tagged component
      const target = e.target.closest('[data-dev-component]');
      if (!target) {
        setHoveredInfo(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const name = target.getAttribute('data-dev-component');
      const file = target.getAttribute('data-dev-file') || '';
      const desc = target.getAttribute('data-dev-desc') || '';

      setHoveredInfo({
        name,
        file,
        desc,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [inspectorMode]);

  if (!isDevUnlocked) return null;

  return (
    <>
      {/* 1. Hover Mode Highlight Box & Floating Badge */}
      {inspectorMode === 'hover' && hoveredInfo && (
        <div
          className="fixed pointer-events-none z-[9990] transition-all duration-100 ease-out"
          style={{
            top: `${hoveredInfo.top}px`,
            left: `${hoveredInfo.left}px`,
            width: `${hoveredInfo.width}px`,
            height: `${hoveredInfo.height}px`,
            boxShadow: '0 0 0 2px #06b6d4, 0 0 25px rgba(6, 182, 212, 0.35)',
            borderRadius: '6px',
            backgroundColor: 'rgba(6, 182, 212, 0.04)',
          }}
        >
          {/* Tag Pill Badge */}
          <div
            onClick={(e) => handleCopyComponent(hoveredInfo.name, hoveredInfo.file, e)}
            className="absolute -top-7 left-1 pointer-events-auto cursor-pointer bg-slate-950/95 border border-cyan-400 text-cyan-300 px-2 py-0.5 rounded shadow-xl flex items-center gap-1.5 font-mono text-[11px] font-bold hover:scale-105 active:scale-95 transition"
            title="Click to copy component name & file path for chat"
          >
            <span className="text-cyan-400">📦</span>
            <span>&lt;{hoveredInfo.name} /&gt;</span>
            {hoveredInfo.file && (
              <span className="text-[10px] text-content-muted font-normal hidden sm:inline">
                {hoveredInfo.file.replace('frontend/src/', '')}
              </span>
            )}
            <Copy size={11} className="text-cyan-400 opacity-70 ml-0.5" />
          </div>

          {/* Optional purpose description footer */}
          {hoveredInfo.desc && (
            <div className="absolute -bottom-6 left-1 bg-slate-950/90 border border-cyan-500/40 text-cyan-200/80 px-1.5 py-0.2 rounded text-[10px] shadow pointer-events-none hidden md:block max-w-sm truncate font-sans">
              💡 {hoveredInfo.desc}
            </div>
          )}
        </div>
      )}

      {/* 2. Always Mode: Persistent Micro-Badges on All Elements */}
      {inspectorMode === 'always' && (
        <div className="fixed inset-0 pointer-events-none z-[9980] overflow-hidden">
          {allTaggedElements.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="absolute pointer-events-none border border-dashed border-cyan-400/50 rounded"
              style={{
                top: `${item.top}px`,
                left: `${item.left}px`,
                width: `${item.width}px`,
                height: `${item.height}px`,
              }}
            >
              <div
                onClick={(e) => handleCopyComponent(item.name, item.file, e)}
                className="absolute top-1 left-1 pointer-events-auto cursor-pointer bg-slate-950/90 hover:bg-slate-900 border border-cyan-400 text-cyan-300 px-1.5 py-0.5 rounded shadow-md flex items-center gap-1 font-mono text-[10px] font-bold transition hover:scale-105 active:scale-95 z-10"
                title={`${item.name} (${item.file})\n${item.desc || ''}\n\nClick to copy!`}
              >
                <span>📦</span>
                <span>&lt;{item.name} /&gt;</span>
                <Copy size={9} className="text-cyan-400 opacity-60" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Floating Quick Controller Dock (Draggable anywhere on screen) */}
      <aside
        ref={dockRef}
        id="dev-component-inspector-dock"
        aria-label="Developer Component Inspector"
        style={
          dockPos
            ? {
                position: 'fixed',
                left: `${dockPos.x}px`,
                top: `${dockPos.y}px`,
                right: 'auto',
                bottom: 'auto',
              }
            : undefined
        }
        className={`fixed bottom-24 right-4 z-[9999] select-none flex items-center gap-1.5 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 text-content-primary rounded-full px-2 py-1.5 shadow-2xl transition-shadow ${
          isDraggingDock ? 'shadow-[0_0_20px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400 cursor-grabbing' : ''
        }`}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className="p-1 -ml-0.5 rounded-full text-cyan-400/70 hover:text-cyan-300 hover:bg-white/10 cursor-grab active:cursor-grabbing transition"
          title="Drag to reposition inspector"
        >
          <GripVertical size={13} />
        </div>

        <button
          type="button"
          onClick={(e) => {
            if (dragStartRef.current.hasMoved) return;
            toggleComponentInspector();
          }}
          className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer outline-none hover:text-white transition"
          title={`Component Inspector: ${inspectorMode.toUpperCase()} (Click to cycle or press Alt+C)`}
        >
          <Sparkles size={14} className={inspectorMode !== 'off' ? 'text-cyan-400 animate-pulse' : 'text-content-muted'} />
          <span className="font-mono text-[11px]">
            Inspector: <span className={inspectorMode !== 'off' ? 'text-cyan-400 font-bold' : 'text-content-muted'}>{inspectorMode.toUpperCase()}</span>
          </span>
        </button>

        {/* Quick Mode Buttons */}
        <div className="flex items-center gap-1 border-l border-white/10 pl-1.5 ml-0.5">
          <button
            type="button"
            onClick={() => setFlag('component_inspector', 'off')}
            className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition cursor-pointer ${
              inspectorMode === 'off' 
                ? 'bg-white/15 text-white font-bold' 
                : 'text-content-muted hover:text-white'
            }`}
            title="Disable inspector"
          >
            OFF
          </button>
          <button
            type="button"
            onClick={() => setFlag('component_inspector', 'hover')}
            className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition cursor-pointer ${
              inspectorMode === 'hover' 
                ? 'bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-500/50' 
                : 'text-content-muted hover:text-white'
            }`}
            title="Hover to inspect"
          >
            HOVER
          </button>
          <button
            type="button"
            onClick={() => setFlag('component_inspector', 'always')}
            className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition cursor-pointer ${
              inspectorMode === 'always' 
                ? 'bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-500/50' 
                : 'text-content-muted hover:text-white'
            }`}
            title="Always show all badges"
          >
            ALL
          </button>
        </div>

        <span className="text-[10px] font-mono text-content-subtle border-l border-white/10 pl-1.5 hidden md:inline">
          Alt+C
        </span>
      </aside>
    </>
  );
};
