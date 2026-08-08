import type { Chord, Song, StrummingPattern } from '../types/models';
import { PRESET_CHORDS } from '../data/chords';
import { PRESET_PATTERNS } from '../data/patterns';
import { PRESET_SONGS } from '../data/songs';

/**
 * Content repository. Milestone 1 serves bundled presets only; Milestone 2
 * merges user records from IndexedDB behind the same async API, so pages
 * won't need to change.
 */

export async function getSongs(): Promise<Song[]> {
  return PRESET_SONGS;
}

export async function getSong(id: string): Promise<Song | undefined> {
  return PRESET_SONGS.find((s) => s.id === id);
}

export async function getChordMap(): Promise<Map<string, Chord>> {
  return new Map(PRESET_CHORDS.map((c) => [c.id, c]));
}

export async function getPatternMap(): Promise<Map<string, StrummingPattern>> {
  return new Map(PRESET_PATTERNS.map((p) => [p.id, p]));
}
