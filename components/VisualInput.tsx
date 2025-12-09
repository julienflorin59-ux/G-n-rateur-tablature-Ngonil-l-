import React, { useState, useRef } from 'react';
import { STRING_CONFIGS, NOTE_COLORS } from '../constants';
import { Tuning } from '../types';
import { Wand2, Hand, ThumbsUp, Monitor, Smartphone, MousePointer2 } from 'lucide-react';

interface VisualInputProps {
  onInsert: (text: string) => void;
  onDeleteLast: () => void;
  tuning?: Tuning;
  rhythmMode: 'binary' | 'ternary';
  onRhythmModeChange: (mode: 'binary' | 'ternary') => void;
  selectedNoteId: string | null;
  onDurationChange: (symbol: string) => void;
}

export const VisualInput: React.FC<VisualInputProps> = ({ 
  onInsert, 
  tuning,
  rhythmMode,
  onRhythmModeChange
}) => {
  // Fingering Mode State
  const [fingeringMode, setFingeringMode] = useState<'auto' | 'manual'>('auto');

  // Refs for Long Press handling on Mobile
  const timerRef = useRef<number | null>(null);
  const isLongPress = useRef(false);
  const ignoreNextClick = useRef(false);

  const handleInteraction = (
      e: React.MouseEvent | React.TouchEvent, 
      stringId: string, 
      hand: string, 
      forceFinger?: string
  ) => {
      // LOGIC: Always insert a standard gap (12) by default, user will move it.
      // We use '12' as the numeric code for a standard beat spacing.
      const rhythmCode = '12'; 

      let fingerCode = 'P'; // Default Pouce
      
      if (fingeringMode === 'auto') {
          const thumbStrings = ['1D', '1G', '2D', '2G', '3D', '3G'];
          fingerCode = thumbStrings.includes(stringId) ? 'P' : 'I';
      } else {
          if (forceFinger) {
              fingerCode = forceFinger;
          }
      }

      const line = `${rhythmCode}   ${stringId}   ${fingerCode}`;
      onInsert(line);
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

  // --- MOUSE HANDLERS ---
  const handleClick = (e: React.MouseEvent, stringId: string, hand: string) => {
      if (ignoreNextClick.current) return;
      handleInteraction(e, stringId, hand, 'P'); 
  };

  const handleContextMenu = (e: React.MouseEvent, stringId: string, hand: string) => {
      e.preventDefault();
      if (ignoreNextClick.current) return;
      handleInteraction(e, stringId, hand, 'I'); 
  };

  // --- TOUCH HANDLERS ---
  const handleTouchStart = () => {
      isLongPress.current = false;
      timerRef.current = window.setTimeout(() => {
          isLongPress.current = true;
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); 
  };

  const handleTouchEnd = (e: React.TouchEvent, stringId: string, hand: string) => {
      e.preventDefault();
      ignoreNextClick.current = true;
      setTimeout(() => { ignoreNextClick.current = false; }, 300);

      if (timerRef.current) clearTimeout(timerRef.current);
      const finger = isLongPress.current ? 'I' : 'P';
      handleInteraction(e, stringId, hand, finger);
  };

  const handleTouchCancel = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Group strings
  const leftStrings = STRING_CONFIGS.filter(s => s.hand === 'G').sort((a,b) => b.index - a.index); 
  const rightStrings = STRING_CONFIGS.filter(s => s.hand === 'D').sort((a,b) => a.index - b.index);

  const renderStringBlock = (s: typeof STRING_CONFIGS[0], hand: string) => {
      const color = getColor(s.stringId);
      const noteName = getNoteName(s.stringId);

      return (
        <button
            key={s.stringId}
            onClick={(e) => handleClick(e, s.stringId, hand)}
            onContextMenu={(e) => handleContextMenu(e, s.stringId, hand)}
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => handleTouchEnd(e, s.stringId, hand)}
            onTouchMove={handleTouchCancel}
            className="flex-1 min-w-0 h-full flex flex-col justify-between items-center rounded-lg border border-[#cbb094]/50 overflow-hidden hover:brightness-110 transition-all active:scale-95 shadow-sm group relative select-none touch-manipulation"
            style={{
                background: `linear-gradient(to top, ${color}CC, ${color}10)`,
                borderColor: color
            }}
        >
            <span className="mt-1 text-[10px] md:text-xs font-normal text-black z-10 pointer-events-none drop-shadow-sm w-full text-center truncate px-[1px]">
                {s.stringId}
            </span>
            <span className="mb-1 text-[10px] md:text-sm font-normal text-black z-10 tracking-wide pointer-events-none drop-shadow-sm w-full text-center truncate px-[1px]">
                {noteName}
            </span>
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none"></div>
        </button>
      );
  };

  return (
    <div className="flex flex-col bg-[#dcc0a3] rounded-lg border border-[#cbb094] h-full">
        
        {/* HEADER */}
        <div className="bg-[#cbb094]/50 p-2 flex items-center justify-between border-b border-[#bfa085]">
            <div className="flex items-center gap-2">
                <span className="text-xl">🎨</span>
                <h3 className="font-bold text-[#5d4037]">Ajouter des notes</h3>
            </div>
        </div>

        <div className="p-4 flex flex-col gap-6 flex-1">
            
            <div className="flex justify-between items-end">
                {/* 1. Doigté Controls */}
                <div className="flex-1">
                    <div className="font-bold mb-2 flex items-center gap-1 text-xs">Doigté :</div>
                    <div className="flex items-center gap-2 mb-2 bg-[#e5c4a1]/40 rounded p-1 border border-[#cbb094]/50 max-w-[200px]">
                        <button 
                            onClick={() => setFingeringMode('auto')}
                            className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all flex items-center justify-center gap-1 ${fingeringMode === 'auto' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            <Wand2 size={10} /> Auto
                        </button>
                        <button 
                             onClick={() => setFingeringMode('manual')}
                             className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all flex items-center justify-center gap-1 ${fingeringMode === 'manual' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            <Hand size={10} /> Manuel
                        </button>
                    </div>
                </div>

                {/* 2. Rythme Controls (Simplified) */}
                <div className="flex-1 text-right">
                     <div className="font-bold mb-2 flex items-center gap-1 text-xs justify-end">Grille :</div>
                     <div className="flex items-center gap-2 mb-2 bg-[#e5c4a1]/40 rounded p-1 border border-[#cbb094]/50 max-w-[150px] ml-auto">
                        <button 
                            onClick={() => onRhythmModeChange('binary')}
                            className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all ${rhythmMode === 'binary' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            4/4
                        </button>
                        <button 
                             onClick={() => onRhythmModeChange('ternary')}
                             className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all ${rhythmMode === 'ternary' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            3/4
                        </button>
                     </div>
                </div>
            </div>

            {/* STRINGS VISUALIZER */}
            <div className="flex gap-[2px] justify-center mt-2 w-full flex-1 min-h-[120px]">
                {/* MAIN GAUCHE */}
                <div className="flex-1 flex flex-col justify-end min-w-0">
                     <h4 className="text-center font-bold text-[#8d6e63] mb-2 text-xs uppercase tracking-widest truncate">Main Gauche</h4>
                     <div className="flex-1 flex justify-end gap-0.5 md:gap-1">
                        {leftStrings.map(s => renderStringBlock(s, 'G'))}
                     </div>
                </div>
                {/* DIVIDER */}
                <div className="w-[2px] bg-black self-stretch shrink-0 mx-0.5 md:mx-1 opacity-20"></div>
                {/* MAIN DROITE */}
                <div className="flex-1 flex flex-col justify-end min-w-0">
                     <h4 className="text-center font-bold text-[#8d6e63] mb-2 text-xs uppercase tracking-widest truncate">Main Droite</h4>
                     <div className="flex-1 flex justify-start gap-0.5 md:gap-1">
                        {rightStrings.map(s => renderStringBlock(s, 'D'))}
                     </div>
                </div>
            </div>
            
            <p className="text-[10px] text-[#8d6e63] text-center italic">
                Cliquez pour ajouter une note. Déplacez les notes dans la visualisation pour créer le rythme.
            </p>

        </div>
    </div>
  );
}