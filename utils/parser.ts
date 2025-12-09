import { ParsedNote, TICKS_QUARTER, TICKS_EIGHTH, TICKS_TRIPLET, TICKS_SIXTEENTH } from '../types';

const SYMBOLS_DURATION: Record<string, number> = {
  '+': TICKS_QUARTER, // 12
  '♪': TICKS_EIGHTH,  // 6
  '🎶': TICKS_TRIPLET, // 4
  '♬': TICKS_SIXTEENTH, // 3
  'w': 48, // Ronde (non affiché mais supporté)
  'h': 24  // Blanche (non affiché mais supporté)
};

const AUTOMATIC_FINGERING: Record<string, string> = {
  '1G': 'P', '2G': 'P', '3G': 'P',
  '1D': 'P', '2D': 'P', '3D': 'P',
  '4G': 'I', '5G': 'I', '6G': 'I',
  '4D': 'I', '5D': 'I', '6D': 'I'
};

export const parseTablature = (text: string): ParsedNote[] => {
  const data: ParsedNote[] = [];
  let currentTick = 0;
  
  // On ne garde plus de "lastNoteDuration" par défaut, chaque ligne définit son propre delta
  // Si une ligne n'a pas de durée explicite, on assume 0 ou la valeur précédente selon le contexte, 
  // mais ici on va favoriser la lecture explicite.

  if (!text) return [];

  const lines = text.trim().split('\n');

  lines.forEach((line, index) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;

    const col1 = parts[0]; // Duration / Delta symbol
    
    let thisDelta = 0;

    // --- DETECTION DU DELTA ---
    if (col1 === '=') {
      // Polyphonie : Delta 0, on reste sur le tick précédent
      // On doit reculer le currentTick de la durée de la note précédente pour se mettre au même niveau
      // MAIS dans notre logique simplifiée, currentTick est le curseur de fin.
      // Pour faire simple : Si '=', on utilise le StartTick de la dernière note ajoutée.
      if (data.length > 0) {
          currentTick = data[data.length - 1].tick; 
      }
      thisDelta = 0;
    } else if (/^\d+(\.\d+)?$/.test(col1)) {
       // C'est un nombre (Ticks bruts)
       // Supporte maintenant les flottants (ex: 1.5)
       thisDelta = parseFloat(col1);
    } else if (SYMBOLS_DURATION[col1] !== undefined) {
       thisDelta = SYMBOLS_DURATION[col1];
    } else if (col1.endsWith('.') && SYMBOLS_DURATION[col1.slice(0, -1)]) {
       // Support pointé (ex: +.)
       thisDelta = Math.floor(SYMBOLS_DURATION[col1.slice(0, -1)] * 1.5);
    } else {
       // Fallback: Si c'est un format inconnu, on assume 12 ticks par défaut pour éviter le crash
       thisDelta = 12; 
    }

    // Le tick de CETTE note est le currentTick actuel + le delta
    // (Si le delta représente le temps écoulé depuis la précédente)
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
        duration: 0, // Pas de durée visuelle
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

    // Silence (S) - Juste un marqueur de temps, pas d'objet note
    if (stringCode === 'S' || stringCode === 'SILENCE' || stringCode === 'SEP') {
       return;
    }

    // Note Normale
    let doigt = AUTOMATIC_FINGERING[stringCode] || 'P'; 
    if (parts.length > 2) {
      const p3 = parts[2].toUpperCase();
      if (p3 === 'I' || p3 === 'P') {
        doigt = p3;
      }
    }
    
    data.push({
      id: `note-${index}`,
      tick: noteTick,
      duration: 0, // On force 0, c'est un point dans l'espace
      stringId: stringCode,
      doigt: doigt,
      lineIndex: index
    });
  });

  return data.sort((a, b) => a.tick - b.tick);
};