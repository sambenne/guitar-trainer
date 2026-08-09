import type { Chord, PracticeEntry, Song, StrummingPattern, UserChord, UserPattern, UserSong } from '../types/models';
import { PRESET_CHORDS } from '../data/chords';
import { PRESET_PATTERNS } from '../data/patterns';
import { PRESET_SONGS } from '../data/songs';
import * as db from './db';

/**
 * Content repository: bundled read-only presets merged with user records
 * from IndexedDB. Preset IDs are stable slugs; user IDs are UUIDs, so the
 * two never collide (imports are re-ID'd on the way in).
 */

const PRESET_SONG_IDS = new Set(PRESET_SONGS.map((s) => s.id));
const PRESET_CHORD_IDS = new Set(PRESET_CHORDS.map((c) => c.id));
const PRESET_PATTERN_IDS = new Set(PRESET_PATTERNS.map((p) => p.id));

export const isPresetSong = (id: string) => PRESET_SONG_IDS.has(id);
export const isPresetChord = (id: string) => PRESET_CHORD_IDS.has(id);
export const isPresetPattern = (id: string) => PRESET_PATTERN_IDS.has(id);

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

// ---- Songs ----

export async function getPresetSongs(): Promise<Song[]> {
  return PRESET_SONGS;
}

export async function getUserSongs(): Promise<UserSong[]> {
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getSongs(): Promise<Song[]> {
  return [...PRESET_SONGS, ...(await getUserSongs())];
}

export async function getSong(id: string): Promise<Song | undefined> {
  return PRESET_SONGS.find((s) => s.id === id) ?? (await db.getOne('songs', id));
}

export async function saveSong(song: Song): Promise<UserSong> {
  if (isPresetSong(song.id)) throw new Error('Preset songs are read-only');
  const existing = await db.getOne('songs', song.id);
  const now = new Date().toISOString();
  const record: UserSong = { ...song, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.put('songs', record);
  return record;
}

export async function deleteSong(id: string): Promise<void> {
  await db.remove('songs', id);
}

// ---- Chords ----

export async function getUserChords(): Promise<UserChord[]> {
  return (await db.getAll('chords')).sort(byName);
}

export async function getChordMap(): Promise<Map<string, Chord>> {
  const map = new Map<string, Chord>(PRESET_CHORDS.map((c) => [c.id, c]));
  for (const chord of await db.getAll('chords')) map.set(chord.id, chord);
  return map;
}

/** Presets first, then user chords — for editor dropdowns. */
export async function listChords(): Promise<Chord[]> {
  return [...PRESET_CHORDS, ...(await getUserChords())];
}

export async function getChord(id: string): Promise<Chord | undefined> {
  return PRESET_CHORDS.find((c) => c.id === id) ?? (await db.getOne('chords', id));
}

export async function saveChord(chord: Chord): Promise<UserChord> {
  if (isPresetChord(chord.id)) throw new Error('Preset chords are read-only');
  const existing = await db.getOne('chords', chord.id);
  const now = new Date().toISOString();
  const record: UserChord = { ...chord, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.put('chords', record);
  return record;
}

export async function deleteChord(id: string): Promise<void> {
  await db.remove('chords', id);
}

// ---- Patterns ----

export async function getUserPatterns(): Promise<UserPattern[]> {
  return (await db.getAll('patterns')).sort(byName);
}

export async function getPatternMap(): Promise<Map<string, StrummingPattern>> {
  const map = new Map<string, StrummingPattern>(PRESET_PATTERNS.map((p) => [p.id, p]));
  for (const pattern of await db.getAll('patterns')) map.set(pattern.id, pattern);
  return map;
}

export async function listPatterns(): Promise<StrummingPattern[]> {
  return [...PRESET_PATTERNS, ...(await getUserPatterns())];
}

export async function getPattern(id: string): Promise<StrummingPattern | undefined> {
  return PRESET_PATTERNS.find((p) => p.id === id) ?? (await db.getOne('patterns', id));
}

export async function savePattern(pattern: StrummingPattern): Promise<UserPattern> {
  if (isPresetPattern(pattern.id)) throw new Error('Preset patterns are read-only');
  const existing = await db.getOne('patterns', pattern.id);
  const now = new Date().toISOString();
  const record: UserPattern = { ...pattern, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.put('patterns', record);
  return record;
}

export async function deletePattern(id: string): Promise<void> {
  await db.remove('patterns', id);
}

// ---- Reference checks (protect songs from dangling refs on delete) ----

export async function chordUsage(chordId: string): Promise<string[]> {
  const songs = await getSongs();
  return songs
    .filter((s) => s.sections.some((sec) => sec.bars.some((b) => b.chordId === chordId)))
    .map((s) => s.title);
}

export async function patternUsage(patternId: string): Promise<string[]> {
  const songs = await getSongs();
  return songs
    .filter((s) => s.sections.some((sec) => sec.bars.some((b) => b.patternId === patternId)))
    .map((s) => s.title);
}

export async function resetUserData(): Promise<void> {
  await db.clearAll();
}

// ---- Practice history ----

/** Local calendar date as YYYY-MM-DD (not UTC — practice days follow the clock on the wall). */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface PracticeDelta {
  songId: string;
  songTitle: string;
  seconds: number;
  maxBpm: number;
  maxPct: number;
  loops: number;
}

/** Merge a chunk of playing time into today's entry for the song. */
export async function logPractice(delta: PracticeDelta): Promise<void> {
  if (delta.seconds <= 0) return;
  const date = localDate();
  const id = `${date}:${delta.songId}`;
  const existing = (await db.getOne('practice', id)) as PracticeEntry | undefined;
  const entry: PracticeEntry = existing ?? {
    id,
    date,
    songId: delta.songId,
    songTitle: delta.songTitle,
    seconds: 0,
    maxBpm: 0,
    maxPct: 0,
    loops: 0,
  };
  entry.songTitle = delta.songTitle;
  entry.seconds += delta.seconds;
  entry.maxBpm = Math.max(entry.maxBpm, delta.maxBpm);
  entry.maxPct = Math.max(entry.maxPct, delta.maxPct);
  entry.loops += delta.loops;
  await db.put('practice', entry);
}

/** All practice entries, newest date first. */
export async function getPracticeEntries(): Promise<PracticeEntry[]> {
  const entries = (await db.getAll('practice')) as PracticeEntry[];
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
