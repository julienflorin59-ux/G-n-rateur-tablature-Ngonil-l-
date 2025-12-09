export type Hand = 'G' | 'D'; // Gauche (Left) | Droite (Right)
export type Tuning = Record<string, string>;

export interface NoteConfig {
  stringId: string; // e.g., '1G', '2D'
  note: string;     // e.g., 'C4'
  color: string;
  hand: Hand;
  index: number;    // 1-6
}

export interface ParsedNote {
  id: string;
  tick: number;
  duration: number;
  stringId: string;
  doigt?: string; // Finger: P (Thumb) or I (Index)
  message?: string; // For TXT commands
  isSeparator?: boolean;
  isPageBreak?: boolean;
  lineIndex: number; // The line number in the source code (0-based)
}

export interface SongPreset {
  name: string;
  code: string;
  category?: 'song' | 'exercise' | 'common';
  scaleName?: string; // Name of the associated scale to load automatically
}

export interface ScalePreset {
  name: string;
  tuning: Tuning;
}

export const TICKS_QUARTER = 12;
export const TICKS_EIGHTH = 6;
export const TICKS_TRIPLET = 4;
export const TICKS_SIXTEENTH = 3;

export enum PlaybackState {
  STOPPED,
  PLAYING,
  PAUSED
}