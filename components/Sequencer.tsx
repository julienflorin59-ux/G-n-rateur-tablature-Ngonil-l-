import React, { useState, useEffect } from 'react';
import { STRING_CONFIGS, NOTE_COLORS } from '../constants';
import { Tuning } from '../types';
import { ArrowRight, Trash2, Wand2, Hand, MousePointer2, ChevronsUp, ChevronUp, Minus } from 'lucide-react';

interface SequencerProps {
  onInsert: (code: string) => void;
  tuning: Tuning;
  rhythmMode: 'binary' | 'ternary';
  onRhythmModeChange: (mode: 'binary' | 'ternary') => void;
}

interface NoteCell {
    finger: string;
    durationCategory: 'fast' | 'medium' | 'slow';
}

const Sequencer: React.FC<SequencerProps> = ({ onInsert, tuning, rhythmMode, onRhythmModeChange }) => {
  // Config
  const steps = rhythmMode === 'binary' ? 16 : 12; // 16 steps (Binary) or 12 steps (Ternary)
  const fastNote = rhythmMode === 'binary' ? '♬' : '🎶';
  const fastNoteLabel = rhythmMode === 'binary' ? 'Double' : 'Triolet';
  
  // Store finger choice and duration
  const [grid, setGrid] = useState<Record<string, (NoteCell | null)[]>>({});
  const [fingeringMode, setFingeringMode] = useState<'auto' | 'manual'>('auto');
  
  // Initialize grid or reset when rhythmMode changes
  useEffect(() => {
      const newGrid: Record<string, (NoteCell | null)[]> = {};
      STRING_CONFIGS.forEach(s => {
          newGrid[s.stringId] = Array(steps).fill(null);
      });
      setGrid(newGrid);
  }, [rhythmMode, steps]);

  const handleStepClick = (e: React.MouseEvent, stringId: string, stepIndex: number, button: 'left' | 'right') => {
      e.preventDefault();
      
      // 1. Calculate Duration Category based on Height (Top/Middle/Bottom)
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const ratio = Math.max(0, Math.min(1, relativeY / rect.height));

      let durationCategory: 'fast' | 'medium' | 'slow' = 'fast';
      if (ratio < 0.35) durationCategory = 'fast';
      else if (ratio < 0.65) durationCategory = 'medium';
      else durationCategory = 'slow';

      // 2. Determine Finger
      let finger = 'P';
      if (fingeringMode === 'auto') {
           const thumbStrings = ['1D','2D','3D','1G','2G','3G'];
           finger = thumbStrings.includes(stringId) ? 'P' : 'I';
      } else {
           // Manual mode: Left = Thumb (P), Right = Index (I)
           finger = button === 'left' ? 'P' : 'I';
      }

      setGrid(prev => {
          const row = [...(prev[stringId] || Array(steps).fill(null))];
          const current = row[stepIndex];
          
          // If clicking with same finger AND roughly same duration (allow toggle off)
          // But here to allow changing duration we check if it's the exact same object content
          if (current && current.finger === finger && current.durationCategory === durationCategory) {
              row[stepIndex] = null; // Toggle off
          } else {
              row[stepIndex] = { finger, durationCategory }; // Set/Update
          }
          
          return { ...prev, [stringId]: row };
      });
  };

  const clearGrid = () => {
      const newGrid: Record<string, (NoteCell | null)[]> = {};
      STRING_CONFIGS.forEach(s => {
          newGrid[s.stringId] = Array(steps).fill(null);
      });
      setGrid(newGrid);
  };

  const generateCode = () => {
      // Convert Grid to Text Code
      let code = "TXT [SEQUENCEUR]\n";
      
      // We process column by column (time steps)
      for (let i = 0; i < steps; i++) {
          // Filter active notes
          const activeStrings = STRING_CONFIGS.filter(s => grid[s.stringId] && grid[s.stringId][i] !== null);
          
          // Default symbol for empty steps
          const defaultSymbol = fastNote; 
          
          if (activeStrings.length === 0) {
              code += `${defaultSymbol}   S\n`;
          } else {
              activeStrings.forEach((s, idx) => {
                  const cell = grid[s.stringId][i]!;
                  
                  // Map category to symbol
                  let symbol = defaultSymbol;
                  if (cell.durationCategory === 'medium') symbol = '♪';
                  if (cell.durationCategory === 'slow') symbol = '+';

                  // Polyphony uses '=' for subsequent notes, 
                  // but effectively the first note sets the step duration in this simplified generator
                  const prefix = idx === 0 ? symbol : '='; 
                  
                  code += `${prefix}   ${s.stringId}   ${cell.finger}\n`;
              });
          }
      }
      onInsert(code + "+ S"); // Add a rest at end
  };

  const getColor = (stringId: string) => {
      const note = tuning[stringId];
      if (!note) return '#ccc';
      const base = note.charAt(0).toUpperCase();
      return NOTE_COLORS[base] || '#ccc';
  };

  // Helper to get mini symbol for display inside grid cell
  const getDisplaySymbol = (category: 'fast' | 'medium' | 'slow') => {
      if (category === 'slow') return '+';
      if (category === 'medium') return '♪';
      return fastNote;
  };

  const orderedStringIds = [
      '6G', '5G', '4G', '3G', '2G', '1G', 
      '1D', '2D', '3D', '4D', '5D', '6D'
  ];

  return (
    <div className="flex flex-col h-full bg-[#dcc0a3] rounded-lg border border-[#cbb094] overflow-hidden">
        
        {/* SETTINGS HEADER */}
        <div className="flex-none p-4 flex flex-col gap-4 bg-[#e5c4a1]/40 border-b border-[#cbb094]">
             <div className="grid grid-cols-2 gap-4 text-sm text-[#5d4037]">
                
                {/* 1. Doigté Controls */}
                <div>
                    <div className="font-bold mb-2 flex items-center gap-1 text-xs md:text-sm">
                        Doigté :
                    </div>
                    
                    {/* Fingering Mode Toggle */}
                    <div className="flex items-center gap-2 mb-2 bg-[#e5c4a1] rounded p-1 border border-[#cbb094]/50">
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

                    {/* Spacer for alignment with Right Column's "Hauteur de frappe :" label */}
                    <div className="font-bold mb-1 flex items-center gap-1 text-xs md:text-sm opacity-0 select-none pointer-events-none" aria-hidden="true">
                        Hauteur de frappe :
                    </div>

                    <div className="bg-[#e5c4a1]/60 p-2 rounded-lg border border-[#cbb094] text-[10px] md:text-xs leading-tight shadow-sm h-16 overflow-y-auto custom-scrollbar">
                        {fingeringMode === 'auto' ? (
                            <div className="flex flex-col h-full justify-center gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold bg-[#A67C52] text-white px-1.5 rounded text-[9px]">P</span>
                                    <span>Cordes 1, 2, 3</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold bg-[#8d6e63] text-white px-1.5 rounded text-[9px]">I</span>
                                    <span>Cordes 4, 5, 6</span>
                                </div>
                                <div className="text-[8px] md:text-[9px] italic text-[#8d6e63] mt-1 text-center leading-none">
                                    Détection automatique selon la corde
                                </div>
                            </div>
                        ) : (
                             <div className="flex flex-col h-full justify-center gap-1">
                                <div className="flex items-center gap-1 mb-1 font-bold border-b border-[#5d4037]/20 pb-1 text-[9px]">
                                    <MousePointer2 size={10}/> Souris
                                </div>
                                <div className="flex justify-between text-[9px]">
                                    <span>Clic G.</span>
                                    <span className="font-bold">Pouce</span>
                                </div>
                                <div className="flex justify-between text-[9px]">
                                    <span>Clic D.</span>
                                    <span className="font-bold">Index</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Rythme Controls */}
                <div>
                     <div className="font-bold mb-2 flex items-center gap-1 text-xs md:text-sm">
                        Rythme :
                     </div>
                     <div className="flex items-center gap-2 mb-2 bg-[#e5c4a1] rounded p-1 border border-[#cbb094]/50">
                        <button 
                            onClick={() => onRhythmModeChange('binary')}
                            className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all ${rhythmMode === 'binary' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            4 Temps
                        </button>
                        <button 
                             onClick={() => onRhythmModeChange('ternary')}
                             className={`flex-1 text-[10px] py-1 px-1 rounded font-bold transition-all ${rhythmMode === 'ternary' ? 'bg-[#5d4037] text-[#e5c4a1]' : 'text-[#8d6e63] hover:bg-[#cbb094]/50'}`}
                        >
                            3 Temps
                        </button>
                     </div>

                    <div className="font-bold mb-1 flex items-center gap-1 text-xs md:text-sm">
                        Hauteur de frappe :
                    </div>
                    {/* Visual Legend for Hit Zones */}
                    <div className="flex items-center gap-2 h-16">
                        {/* Visual Bar Representation */}
                        <div className="h-full w-8 rounded bg-gradient-to-t from-[#A67C52] to-[#e5c4a1] border border-[#5d4037] relative flex flex-col justify-between items-center text-[8px] font-bold text-[#5d4037] overflow-hidden">
                            <div className="absolute top-[35%] w-full border-t border-[#5d4037]/50"></div>
                            <div className="absolute top-[65%] w-full border-t border-[#5d4037]/50"></div>
                        </div>
                        
                        {/* Labels */}
                        <div className="flex flex-col justify-between h-full text-[9px] leading-none py-1">
                            <div className="flex items-center gap-1">
                                <ChevronsUp size={10} className="text-[#8d6e63]"/> 
                                <span>Haut : <b>{fastNoteLabel}</b> ({fastNote})</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <ChevronUp size={10} className="text-[#8d6e63]"/> 
                                <span>Milieu : <b>Croche</b> (♪)</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Minus size={10} className="text-[#8d6e63]"/> 
                                <span>Bas : <b>Noire</b> (+)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* CONTROLS HEADER */}
        <div className="flex justify-between items-center bg-[#cbb094] p-2 flex-none shadow-sm">
            <div className="text-xs font-bold text-[#5d4037] uppercase tracking-wider pl-2">
                Grille
            </div>
            <div className="flex gap-2">
                <button onClick={clearGrid} className="p-2 text-red-700 hover:bg-[#bfa085] rounded transition-colors" title="Effacer tout"><Trash2 size={16}/></button>
                <button onClick={generateCode} className="px-4 py-1 bg-green-700 text-white rounded font-bold text-sm flex items-center gap-2 hover:bg-green-800 shadow-sm transition-colors">
                    Insérer <ArrowRight size={14}/>
                </button>
            </div>
        </div>

        {/* GRID CONTAINER */}
        <div className="flex-1 overflow-y-auto border-t border-[#A67C52]/20 relative custom-scrollbar bg-[#fdf6e3] flex flex-col min-h-0">
            
            {/* Header Row (String Names) */}
            <div className="flex sticky top-0 z-10 bg-[#e5c4a1] border-b border-[#5d4037]/20 shadow-sm">
                {/* Number Column Spacer */}
                <div className="w-8 flex-none border-r border-[#5d4037]/10 bg-[#dcc0a3]"></div>
                
                {/* String Headers */}
                <div className="flex flex-1">
                    {orderedStringIds.map((sid, idx) => {
                        const conf = STRING_CONFIGS.find(s => s.stringId === sid);
                        if (!conf) return null;
                        const color = getColor(sid);
                        const isSeparator = idx === 5; 

                        return (
                            <div 
                                key={sid} 
                                className={`flex-1 flex flex-col items-center justify-center py-2 border-r border-[#5d4037]/10 ${isSeparator ? 'border-r-2 border-r-[#5d4037]/50' : ''}`}
                                style={{ backgroundColor: `${color}20` }}
                            >
                                <div 
                                    className="w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[8px] md:text-[10px] font-bold text-white shadow-sm"
                                    style={{ backgroundColor: color }}
                                >
                                    {sid}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Time Step Rows */}
            <div className="flex-1 pb-4">
                {Array.from({ length: steps }).map((_, stepIdx) => {
                    const isBeat = stepIdx % 4 === 0;
                    
                    return (
                        <div 
                            key={stepIdx} 
                            className={`flex hover:bg-[#A67C52]/10 transition-colors ${isBeat ? 'border-t border-[#5d4037]/30 bg-[#5d4037]/5' : 'border-t border-[#5d4037]/5'}`}
                        >
                            {/* Step Number */}
                            <div className="w-8 flex-none flex items-center justify-center text-[9px] font-bold text-[#8d6e63] border-r border-[#5d4037]/10 bg-[#e5c4a1]/30 select-none">
                                {stepIdx + 1}
                            </div>

                            {/* String Cells */}
                            <div className="flex flex-1">
                                {orderedStringIds.map((sid, strIdx) => {
                                     // Safe access using Optional Chaining to avoid "Cannot read properties of undefined"
                                     const cell = grid[sid]?.[stepIdx];
                                     // Check truthiness (undefined or null will be false)
                                     const isActive = !!cell;
                                     const color = getColor(sid);
                                     const isSeparator = strIdx === 5;

                                     return (
                                        <div 
                                            key={sid}
                                            onContextMenu={(e) => handleStepClick(e, sid, stepIdx, 'right')}
                                            onClick={(e) => handleStepClick(e, sid, stepIdx, 'left')}
                                            className={`
                                                flex-1 h-8 md:h-10 cursor-pointer flex items-center justify-center border-r border-[#5d4037]/5 relative group
                                                ${isSeparator ? 'border-r-2 border-r-[#5d4037]/20' : ''}
                                            `}
                                        >
                                            {/* Zone Guides (visible on hover) */}
                                            <div className="absolute top-[35%] w-full border-t border-black/5 opacity-0 group-hover:opacity-100 pointer-events-none"></div>
                                            <div className="absolute top-[65%] w-full border-t border-black/5 opacity-0 group-hover:opacity-100 pointer-events-none"></div>

                                            {/* Vertical String Line Background */}
                                            <div className="absolute inset-y-0 w-[1px] bg-[#5d4037]/10 pointer-events-none"></div>

                                            {/* Note Marker */}
                                            <div 
                                                className={`
                                                    w-5 h-5 md:w-6 md:h-6 rounded-full transition-all duration-200 z-10 shadow-sm flex items-center justify-center text-[8px] font-bold text-white select-none
                                                    ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50 hover:opacity-30 hover:scale-75'}
                                                `}
                                                style={{ backgroundColor: isActive ? color : '#5d4037' }}
                                            >
                                                {isActive ? (
                                                    <span className="flex items-center leading-none -ml-[1px]">
                                                        {cell!.finger}
                                                        <span className="text-[6px] opacity-80 scale-75 inline-block ml-[1px] -mt-[1px]">
                                                            {getDisplaySymbol(cell!.durationCategory)}
                                                        </span>
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                     );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    </div>
  );
};

export default Sequencer;