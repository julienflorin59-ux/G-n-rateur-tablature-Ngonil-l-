
import { ParsedNote, TICKS_QUARTER, TICKS_EIGHTH, TICKS_TRIPLET, TICKS_SIXTEENTH } from '../types';

const SYMBOLS_DURATION: Record<string, number> = {
  '+': TICKS_QUARTER, // 12
  '♪': TICKS_EIGHTH,  // 6
  '🎶': TICKS_TRIPLET, // 4
  '♬': TICKS_SIXTEENTH, // 3
  'w': 48, // Ronde (non affiché mais supporté)
  'h': 24  // Blanche (non affiché mais supporté)
};

export const parseTablature = (text: string): ParsedNote[] => {
  const data: ParsedNote[] = [];
  let currentTick = 0;
  
  if (!text) return [];

  const lines = text.trim().split('\n');

  lines.forEach((line, index) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;

    const col1 = parts[0]; // Duration / Delta symbol
    
    let thisDelta = 0;

    // --- DETECTION DU DELTA ---
    if (col1 === '=') {
      if (data.length > 0) {
          currentTick = data[data.length - 1].tick; 
      }
      thisDelta = 0;
    } else if (/^\d+(\.\d+)?$/.test(col1)) {
       thisDelta = parseFloat(col1);
    } else if (SYMBOLS_DURATION[col1] !== undefined) {
       thisDelta = SYMBOLS_DURATION[col1];
    } else if (col1.endsWith('.') && SYMBOLS_DURATION[col1.slice(0, -1)]) {
       thisDelta = Math.floor(SYMBOLS_DURATION[col1.slice(0, -1)] * 1.5);
    } else {
       thisDelta = 12; 
    }

    const noteTick = currentTick + thisDelta;
    currentTick = noteTick;

    // --- 2. Content Analysis ---
    let stringCode = parts[1].toUpperCase();
    
    // Special Command: TXT
    if (stringCode === 'TXT') {
      const message = parts.slice(2).join(' ');
      data.push({
        id: `txt-${index}`,
        tick: noteTick,
        duration: 0,
        stringId: 'TEXTE',
        message,
        lineIndex: index
      });
      return;
    }

    // Special Command: PAGE
    if (stringCode === 'PAGE') {
      data.push({
        id: `pg-${index}`,
        tick: noteTick,
        duration: 0,
        stringId: 'PAGE_BREAK',
        isPageBreak: true,
        lineIndex: index
      });
      return;
    }

    // Silence (S)
    if (stringCode === 'S' || stringCode === 'SILENCE' || stringCode === 'SEP') {
       return;
    }

    // Note Normale
    // MODIF: On n'impose plus de doigté par défaut. 
    // Si la 3ème colonne est absente, doigt est undefined.
    let doigt: string | undefined = undefined;
    if (parts.length > 2) {
      const p3 = parts[2].toUpperCase();
      if (p3 === 'I' || p3 === 'P') {
        doigt = p3;
      }
    }
    
    data.push({
      id: `note-${index}`,
      tick: noteTick,
      duration: 0,
      stringId: stringCode,
      doigt: doigt,
      lineIndex: index
    });
  });

  return data.sort((a, b) => a.tick - b.tick);
};
