import { NoteConfig, SongPreset, ScalePreset, Tuning } from './types';

// =================================================================================
// 🔗 CONFIGURATION DES RESSOURCES
// =================================================================================
// On utilise un chemin relatif (local) au lieu de GitHub.
// Assurez-vous d'avoir un dossier "samples" dans votre dossier "public" contenant les MP3.
export const ASSETS_BASE_URL = "/"; 

// Standard Note Colors (User requirement: Fixed color per note)
export const NOTE_COLORS: Record<string, string> = {
  'C': '#FF0000', // Red
  'D': '#FF8C00', // Dark Orange
  'E': '#FFD700', // Gold
  'F': '#32CD32', // Lime Green
  'G': '#00BFFF', // Deep Sky Blue
  'A': '#2563EB', // Dark Blue (Lighter shade: Royal Blue)
  'B': '#9400D3'  // Dark Violet
};

// Deprecated: Old static string colors. Kept for backward compat if needed, but logic replaced.
export const COLORS_VISU: Record<string, string> = {
  '6G': '#00BFFF', '5G': '#FF4B4B', '4G': '#00008B',
  '3G': '#FFD700', '2G': '#FF4B4B', '1G': '#00BFFF',
  '1D': '#32CD32', '2D': '#00008B', '3D': '#FFA500',
  '4D': '#00BFFF', '5D': '#9400D3', '6D': '#FFD700'
};

export const BASE_TUNING: Record<string, string> = {
  '1D': 'E3', '1G': 'G3', '2D': 'A3', '2G': 'C4', '3D': 'D4', '3G': 'E4',
  '4D': 'G4', '4G': 'A4', '5D': 'C5', '5G': 'D5', '6D': 'E5', '6G': 'G5'
};

// Liste chromatique étendue pour les calculs d'intervalles (Accordage personnalisé)
// Couvre largement de C3 à C6 pour permettre -1.5 tons / +1 ton sur les cordes extrêmes
export const ALL_CHROMATIC_NOTES = [
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5', 'C6'
];

// Liste des samples réellement disponibles dans le dossier /samples
// Restreint les choix possibles pour éviter de sélectionner une note sans son.
// Plage standard Ngonilélé : approx E3 à G5 chromatique.
export const AVAILABLE_SAMPLES = [
  'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5'
];

export const SCALE_MAPPING = ['1D', '1G', '2D', '2G', '3D', '3G', '4D', '4G', '5D', '5G', '6D', '6G'];

export const STRING_CONFIGS: NoteConfig[] = [
  { stringId: '6G', note: 'G5', color: COLORS_VISU['6G'], hand: 'G', index: 6 },
  { stringId: '5G', note: 'D5', color: COLORS_VISU['5G'], hand: 'G', index: 5 },
  { stringId: '4G', note: 'A4', color: COLORS_VISU['4G'], hand: 'G', index: 4 },
  { stringId: '3G', note: 'E4', color: COLORS_VISU['3G'], hand: 'G', index: 3 },
  { stringId: '2G', note: 'C4', color: COLORS_VISU['2G'], hand: 'G', index: 2 },
  { stringId: '1G', note: 'G3', color: COLORS_VISU['1G'], hand: 'G', index: 1 },
  { stringId: '1D', note: 'E3', color: COLORS_VISU['1D'], hand: 'D', index: 1 },
  { stringId: '2D', note: 'A3', color: COLORS_VISU['2D'], hand: 'D', index: 2 },
  { stringId: '3D', note: 'D4', color: COLORS_VISU['3D'], hand: 'D', index: 3 },
  { stringId: '4D', note: 'G4', color: COLORS_VISU['4D'], hand: 'D', index: 4 },
  { stringId: '5D', note: 'C5', color: COLORS_VISU['5D'], hand: 'D', index: 5 },
  { stringId: '6D', note: 'E5', color: COLORS_VISU['6D'], hand: 'D', index: 6 },
];

// Helper function to create tuning object from note list string
const createTuning = (notesStr: string): Tuning => {
  // Regex to split notes like "E3G3A3..." -> ['E3', 'G3', 'A3'...]
  const notes = notesStr.match(/[A-G][#b]?[0-9]*/g) || [];
  const tuning: Tuning = {};
  SCALE_MAPPING.forEach((key, index) => {
    if (notes[index]) {
      tuning[key] = notes[index];
    }
  });
  return tuning;
};

export const SCALES_PRESETS: ScalePreset[] = [
  {
    name: "1. Pentatonique Fondamentale",
    tuning: createTuning("E3G3A3C4D4E4G4A4C5D5E5G5")
  },
  {
    name: "2. Pentatonique (Descente Basse)",
    tuning: createTuning("F3G3A3C4D4E4G4A4C5D5E5G5")
  },
  {
    name: "3. Manitoumani",
    tuning: createTuning("F3G3A3C4D4E4G4A4B4C5E5G5")
  },
  {
    name: "4. Orientale Sahara",
    tuning: createTuning("F3A3B3D4E4F4G#4A4B4C5E5F5")
  },
  {
    name: "5. Fa Blues Augmenté Nyama",
    tuning: createTuning("F3G#3A#3C4D#4F4G4G#4A#4C5D#5F5")
  },
  {
    name: "6. Fa Ionien",
    tuning: createTuning("F3A3A#3C4D4E4F4G4A4C5D5F5")
  },
  {
    name: "7. Une Âme",
    tuning: createTuning("F3G3G#3C4D4D#4F4G#4A#4C5D#5F5")
  },
  {
    name: "8. Impressionniste",
    tuning: createTuning("E3F3A3B3C4E4G4A4B4C5E5G5")
  }
];

export const PRESETS: SongPreset[] = [
  {
    name: "--- Nouveau / Vide ---",
    code: "",
    category: 'common'
  },
  {
    name: "Exercice Débutant 1 : Montée/Descente",
    code: `1   1D
+   S
+   1G
+   S
+   2D
+   S
+   2G
+   S
+   3D
+   S
+   3G
+   S
+   4D
+   S
+   4G
+   S
+   5D
+   S
+   5G
+   S
+   6D
+   S
+   6G
+   S
+   TXT  DESCENTE
+   6G
+   S
+   6D
+   S
+   5G
+   S
+   5D
+   S
+   4G
+   S
+   4D
+   S
+   3G
+   S
+   3D
+   S
+   2G
+   S
+   2D
+   S
+   1G
+   S
+   1D`,
    category: 'exercise',
    scaleName: "1. Pentatonique Fondamentale"
  },
  {
    name: "Manitoumani -M- & Lamomali",
    code: `1   4D
+   4G
+   5D
+   5G
+   4G
=   2D
+   3G
+   6D   x2
+   2G
=   5G
+  3G
+  6D   x2
+  2G
=  5G
+ 3G
+ 6D   x2
+ 2G
= 5G
+   TXT  REPETER 2x
+   PAGE
+   4D
+   4G
+   5D
+   5G
+   4G
=   1D
+   2G
+   6D   x2
+   2G
=   4G
+   1D
+   2G
+   6D   x2
+   2G
=   4G
+ S
+ S
+ PAGE
+   1G
+   3D
+   3G
+   5D
+   1G
+   3D
+   3G
+   5D
+ S
+ S
+ S
+ S
+ S
+ S
+ S
+ 4D
+ PAGE
+   4G
+   5D
+   5G
+   4G
=   2D
+   3G
+   6D   x2
+   2G
=   5G
+  3G
+  6D   x2
+  2G
=  5G
+ 3G
+ 6D   x2
+ 2G
= 5G`,
    category: 'song',
    scaleName: "3. Manitoumani"
  },
  {
    name: "Démonstration Rythmes",
    code: `1   6G
+   TXT  NOIRES (+)
+   6D
+   5G
+   5D
+   S
+   TXT  CROCHES (♪)
♪   4G
♪   4D
♪   3G
♪   3D
+   S
+   TXT  TRIOLETS (🎶)
🎶   2G
🎶   2D
🎶   1G
🎶   1D
🎶   2G
🎶   2D
+   S
+   TXT  DOUBLES (♬)
♬ 6G
♬ 6D
♬ 5G
♬ 5D
♬ 4G
♬ 4D
♬ 3G
♬ 3D`,
    category: 'exercise',
    scaleName: "1. Pentatonique Fondamentale"
  }
];