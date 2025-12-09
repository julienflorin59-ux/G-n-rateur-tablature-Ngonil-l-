import React, { useRef, useState, useEffect } from 'react';
import { STRING_CONFIGS, NOTE_COLORS } from '../constants';
import { Tuning } from '../types';

interface StringPadProps {
  onInsert: (stringId: string, finger: string, advanceTicks: number) => void;
  tuning: Tuning;
  fingeringMode: 'auto' | 'manual';
  activeStringId?: string | null;
}

const StringPad: React.FC<StringPadProps> = ({ onInsert, tuning, fingeringMode, activeStringId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Refs for Long Press handling on Mobile
  const timerRef = useRef<number | null>(null);
  const isLongPress = useRef(false);
  const ignoreNextClick = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Replicate Visualizer spacing logic to ensure perfect alignment
  const getResponsiveSpacing = (w: number) => {
    const responsiveSpacing = w / 14; 
    // FIX: Removed Math.max(30, ...) to prevent overflow on small mobile screens
    return Math.min(50, responsiveSpacing);
  };

  const spacing = getResponsiveSpacing(width);
  const centerX = width / 2;

  const handleInteraction = (
      e: React.MouseEvent | React.TouchEvent, 
      stringId: string, 
      hand: string, 
      advanceTicks: number, 
      forceFinger?: string
  ) => {
      let fingerCode = 'P'; 
      
      if (fingeringMode === 'auto') {
          const thumbStrings = ['1D', '1G', '2D', '2G', '3D', '3G'];
          fingerCode = thumbStrings.includes(stringId) ? 'P' : 'I';
      } else {
          if (forceFinger) {
              fingerCode = forceFinger;
          }
      }

      onInsert(stringId, fingerCode, advanceTicks);
  };

  const getNoteName = (stringId: string) => {
      if (!tuning) return '';
      return tuning[stringId] || '';
  };

  const getColor = (stringId: string) => {
     if (!tuning) return '#ccc';
     const note = tuning[stringId];
     if (!note) return '#ccc';
     const base = note.charAt(0).toUpperCase();
     return NOTE_COLORS[base] || '#ccc';
  };

  // --- HANDLERS ---
  const handleClick = (e: React.MouseEvent, stringId: string, hand: string, advanceTicks: number) => {
      if (ignoreNextClick.current) return;
      handleInteraction(e, stringId, hand, advanceTicks, 'P'); 
  };

  const handleContextMenu = (e: React.MouseEvent, stringId: string, hand: string, advanceTicks: number) => {
      e.preventDefault();
      if (ignoreNextClick.current) return;
      handleInteraction(e, stringId, hand, advanceTicks, 'I'); 
  };

  const handleTouchStart = () => {
      isLongPress.current = false;
      timerRef.current = window.setTimeout(() => {
          isLongPress.current = true;
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); 
  };

  const handleTouchEnd = (e: React.TouchEvent, stringId: string, hand: string, advanceTicks: number) => {
      e.preventDefault();
      ignoreNextClick.current = true;
      setTimeout(() => { ignoreNextClick.current = false; }, 300);

      if (timerRef.current) clearTimeout(timerRef.current);
      const finger = isLongPress.current ? 'I' : 'P';
      handleInteraction(e, stringId, hand, advanceTicks, finger);
  };

  const handleTouchMove = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div ref={containerRef} className="relative w-full h-32 md:h-40 overflow-hidden">
        {width > 0 && STRING_CONFIGS.map(s => {
            const direction = s.hand === 'G' ? -1 : 1;
            const x = centerX + (direction * s.index * spacing);
            const color = getColor(s.stringId);
            const noteName = getNoteName(s.stringId);

            // Calculate dynamic width to prevent overlap on small screens
            // Max 40px (desktop), Min 20px (tiny mobile), or 92% of available spacing
            const colWidth = Math.min(40, Math.max(20, spacing * 0.92));

            // Check if active (Voice Input Feedback)
            const isActive = activeStringId === s.stringId;
            const activeStyle = isActive ? {
                transform: 'translateX(-50%) scale(1.1) translateY(-5px)',
                zIndex: 50,
                boxShadow: `0 0 15px ${color}`,
                borderColor: '#fff',
                filter: 'brightness(1.2)',
                transition: 'all 0.1s ease-out'
            } : {
                transform: 'translateX(-50%)',
                borderColor: color
            };

            return (
                <div
                    key={s.stringId}
                    className="absolute top-0 h-full flex flex-col rounded-lg border border-[#cbb094]/50 overflow-hidden shadow-sm select-none touch-manipulation origin-center bg-[#e5c4a1]/20 transition-transform duration-200"
                    style={{
                        left: `${x}px`,
                        width: `${colWidth}px`,
                        ...activeStyle
                    }}
                >
                    {/* BUTTON 1/8 (Top) */}
                    <button
                        className="flex-1 w-full relative group/btn hover:bg-white/20 active:bg-white/40 transition-colors border-b border-[#5d4037]/10"
                        onMouseDown={(e) => handleClick(e, s.stringId, s.hand, 1.5)}
                        onContextMenu={(e) => handleContextMenu(e, s.stringId, s.hand, 1.5)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, s.stringId, s.hand, 1.5)}
                        onTouchMove={handleTouchMove}
                        data-tooltip={`Ajouter ${noteName} (1/8 temps)`}
                    >
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${color}33, ${color}10)` }}></div>
                        <span className="absolute top-0.5 left-0 right-0 text-[8px] text-[#5d4037] text-center opacity-50 font-bold z-10">1/8</span>
                        {/* String ID Overlay on top most button */}
                        <span className="absolute top-3 left-0 right-0 text-[10px] md:text-xs font-bold text-black z-20 pointer-events-none drop-shadow-sm text-center">
                            {s.stringId}
                        </span>
                    </button>

                    {/* BUTTON 1/4 */}
                    <button
                        className="flex-1 w-full relative group/btn hover:bg-white/20 active:bg-white/40 transition-colors border-b border-[#5d4037]/10"
                        onMouseDown={(e) => handleClick(e, s.stringId, s.hand, 3)}
                        onContextMenu={(e) => handleContextMenu(e, s.stringId, s.hand, 3)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, s.stringId, s.hand, 3)}
                        onTouchMove={handleTouchMove}
                        data-tooltip={`Ajouter ${noteName} (1/4 temps)`}
                    >
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${color}55, ${color}33)` }}></div>
                        <span className="absolute top-1 left-0 right-0 text-[8px] text-[#5d4037] text-center opacity-50 font-bold z-10">1/4</span>
                    </button>

                    {/* BUTTON 1/2 */}
                    <button
                        className="flex-1 w-full relative group/btn hover:bg-white/20 active:bg-white/40 transition-colors border-b border-[#5d4037]/10"
                        onMouseDown={(e) => handleClick(e, s.stringId, s.hand, 6)}
                        onContextMenu={(e) => handleContextMenu(e, s.stringId, s.hand, 6)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, s.stringId, s.hand, 6)}
                        onTouchMove={handleTouchMove}
                        data-tooltip={`Ajouter ${noteName} (1/2 temps)`}
                    >
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${color}99, ${color}55)` }}></div>
                        <span className="absolute top-1 left-0 right-0 text-[8px] text-[#5d4037] text-center opacity-50 font-bold z-10">1/2</span>
                    </button>

                    {/* BUTTON 1 (Bottom) */}
                    <button
                        className="flex-1 w-full relative group/btn hover:bg-white/20 active:bg-white/40 transition-colors"
                        onMouseDown={(e) => handleClick(e, s.stringId, s.hand, 12)}
                        onContextMenu={(e) => handleContextMenu(e, s.stringId, s.hand, 12)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, s.stringId, s.hand, 12)}
                        onTouchMove={handleTouchMove}
                        data-tooltip={`Ajouter ${noteName} (1 temps)`}
                    >
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${color}CC, ${color}99)` }}></div>
                        <span className="absolute bottom-1 left-0 right-0 text-[8px] text-[#5d4037] text-center opacity-50 font-bold z-10">1</span>
                        {/* Note Name Overlay on bottom most button */}
                        <span className="absolute bottom-3 left-0 right-0 text-[10px] md:text-sm font-normal text-black z-20 pointer-events-none drop-shadow-sm text-center">
                            {noteName}
                        </span>
                    </button>
                </div>
            );
        })}
        
        {/* Center Divider for visual reference */}
        <div className="absolute left-1/2 top-2 bottom-2 w-[2px] bg-[#5d4037] opacity-20 -translate-x-1/2 rounded pointer-events-none"></div>
    </div>
  );
};

export default StringPad;