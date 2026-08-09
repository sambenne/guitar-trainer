/** Index 0 = low E (6th string) … index 5 = high e (1st string). */
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'] as const;
export const STRING_COUNT = 6;

export type ChordStringState = 'open' | 'muted' | 'fretted';

export interface ChordString {
  state: ChordStringState;
  /** Absolute fret number (1-based) when state === 'fretted'. */
  fret?: number;
  /** Optional finger number 1–4. */
  finger?: number;
}

export interface Chord {
  id: string;
  name: string;
  /** First fret shown on the diagram (1 = nut position). */
  startFret: number;
  /** 6 entries, low E → high e. */
  strings: ChordString[];
}

export type StrumDirection = 'D' | 'U' | '-';

export interface StrumStep {
  direction: StrumDirection;
}

export interface StrummingPattern {
  id: string;
  name: string;
  /** 8th-note grid: length = beats × 2 for MVP. */
  steps: StrumStep[];
  /** Which strings are strummed; 6 entries, low E → high e. */
  strings: boolean[];
}

export interface SongBar {
  chordId: string;
  patternId: string;
  /**
   * Optional mid-bar chord change (e.g. the |A G| bars in Bad Moon Rising).
   * The second chord takes over from `atBeat` (1-based whole beat, 2..beats)
   * to the end of the bar. The strumming pattern is unaffected.
   */
  split?: { atBeat: number; chordId: string };
}

export interface SongSection {
  id: string;
  name: string;
  repeat: number;
  bars: SongBar[];
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  bpm: number;
  /** Capo fret (0 = none). Shapes stay the same; audio sounds this many semitones higher. */
  capo?: number;
  timeSignature: { beats: number; noteValue: number };
  sections: SongSection[];
}

/** Extra fields carried by user-created records stored in IndexedDB. */
export interface UserRecordMeta {
  createdAt: string;
  updatedAt: string;
}

export type UserSong = Song & UserRecordMeta;
export type UserChord = Chord & UserRecordMeta;
export type UserPattern = StrummingPattern & UserRecordMeta;

export interface Settings {
  metronomeEnabled: boolean;
  /** 0–1 */
  metronomeVolume: number;
  /** Play the song's strummed chords during playback. */
  strumEnabled: boolean;
  /** 0–1 */
  strumVolume: number;
  /** 'lowTop' = low E at top of strum panel (default); 'highTop' = tab convention. */
  stringOrientation: 'lowTop' | 'highTop';
}

export const DEFAULT_SETTINGS: Settings = {
  metronomeEnabled: true,
  metronomeVolume: 0.8,
  strumEnabled: true,
  strumVolume: 0.8,
  stringOrientation: 'lowTop',
};
