import type { Chord, Song, StrummingPattern } from '../types/models';
import { STRING_COUNT } from '../types/models';

/**
 * Backup / share file format. Pure functions — no DB, no DOM — so the
 * validation and re-ID logic is unit-testable.
 */

export interface BackupFile {
  version: 1;
  songs: Song[];
  chords: Chord[];
  patterns: StrummingPattern[];
}

export interface ImportPlan {
  songs: Song[];
  chords: Chord[];
  patterns: StrummingPattern[];
  /** old id → new id, for records that collided and were re-ID'd. */
  remapped: Record<string, string>;
}

export function buildBackup(songs: Song[], chords: Chord[], patterns: StrummingPattern[]): BackupFile {
  return { version: 1, songs, chords, patterns };
}

/** Bundle a single song with every non-preset chord/pattern it references. */
export function buildSongExport(
  song: Song,
  chordMap: Map<string, Chord>,
  patternMap: Map<string, StrummingPattern>,
  isPresetChord: (id: string) => boolean,
  isPresetPattern: (id: string) => boolean,
): BackupFile {
  const chordIds = new Set<string>();
  const patternIds = new Set<string>();
  for (const section of song.sections) {
    for (const bar of section.bars) {
      if (!isPresetChord(bar.chordId)) chordIds.add(bar.chordId);
      if (!isPresetPattern(bar.patternId)) patternIds.add(bar.patternId);
    }
  }
  const chords = [...chordIds].map((id) => chordMap.get(id)).filter((c): c is Chord => !!c);
  const patterns = [...patternIds].map((id) => patternMap.get(id)).filter((p): p is StrummingPattern => !!p);
  return buildBackup([song], chords, patterns);
}

// ---- Validation ----

class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkChord(c: unknown, i: number): asserts c is Chord {
  if (!isObj(c)) fail(`chords[${i}] is not an object`);
  if (typeof c.id !== 'string' || !c.id) fail(`chords[${i}].id missing`);
  if (typeof c.name !== 'string' || !c.name) fail(`chords[${i}].name missing`);
  if (typeof c.startFret !== 'number' || !Number.isInteger(c.startFret) || c.startFret < 1 || c.startFret > 15) {
    fail(`chords[${i}].startFret invalid`);
  }
  if (!Array.isArray(c.strings) || c.strings.length !== STRING_COUNT) fail(`chords[${i}].strings must have 6 entries`);
  const startFret = c.startFret;
  c.strings.forEach((s: unknown, j: number) => {
    if (!isObj(s) || !['open', 'muted', 'fretted'].includes(s.state as string)) {
      fail(`chords[${i}].strings[${j}].state invalid`);
    }
    if (s.state === 'fretted') {
      if (typeof s.fret !== 'number' || !Number.isInteger(s.fret) || s.fret < 1) {
        fail(`chords[${i}].strings[${j}].fret invalid`);
      }
      if (s.fret < startFret || s.fret >= startFret + 5) {
        fail(`chords[${i}].strings[${j}].fret is outside the five-fret window`);
      }
    }
    if (
      s.finger !== undefined &&
      (typeof s.finger !== 'number' || !Number.isInteger(s.finger) || s.finger < 1 || s.finger > 4)
    ) {
      fail(`chords[${i}].strings[${j}].finger invalid`);
    }
  });
}

function checkPattern(p: unknown, i: number): asserts p is StrummingPattern {
  if (!isObj(p)) fail(`patterns[${i}] is not an object`);
  if (typeof p.id !== 'string' || !p.id) fail(`patterns[${i}].id missing`);
  const steps = p.steps;
  if (!Array.isArray(steps) || steps.length === 0) fail(`patterns[${i}].steps must be non-empty`);
  if (steps.length < 4 || steps.length > 24 || steps.length % 2 !== 0) {
    fail(`patterns[${i}].steps must contain 2–12 complete beats`);
  }
  if (typeof p.name !== 'string' || !p.name) fail(`patterns[${i}].name missing`);
  steps.forEach((s: unknown, j: number) => {
    if (!isObj(s) || !['D', 'U', '-'].includes(s.direction as string)) fail(`patterns[${i}].steps[${j}] invalid`);
  });
  if (!Array.isArray(p.strings) || p.strings.length !== STRING_COUNT || p.strings.some((b) => typeof b !== 'boolean')) {
    fail(`patterns[${i}].strings must be 6 booleans`);
  }
}

function checkSong(s: unknown, i: number): asserts s is Song {
  if (!isObj(s)) fail(`songs[${i}] is not an object`);
  if (typeof s.id !== 'string' || !s.id) fail(`songs[${i}].id missing`);
  if (typeof s.title !== 'string' || !s.title) fail(`songs[${i}].title missing`);
  if (typeof s.bpm !== 'number' || s.bpm < 20 || s.bpm > 300) fail(`songs[${i}].bpm out of range`);
  const ts = s.timeSignature;
  if (!isObj(ts) || typeof ts.beats !== 'number' || ts.beats < 1 || typeof ts.noteValue !== 'number') {
    fail(`songs[${i}].timeSignature invalid`);
  }
  if (!Array.isArray(s.sections)) fail(`songs[${i}].sections missing`);
  s.sections.forEach((sec: unknown, j: number) => {
    if (!isObj(sec) || typeof sec.name !== 'string') fail(`songs[${i}].sections[${j}] invalid`);
    if (typeof sec.repeat !== 'number' || sec.repeat < 1) fail(`songs[${i}].sections[${j}].repeat invalid`);
    if (!Array.isArray(sec.bars)) fail(`songs[${i}].sections[${j}].bars missing`);
    sec.bars.forEach((b: unknown, k: number) => {
      if (!isObj(b) || typeof b.chordId !== 'string' || typeof b.patternId !== 'string') {
        fail(`songs[${i}].sections[${j}].bars[${k}] invalid`);
      }
    });
  });
}

/** Parse and structurally validate backup JSON. Throws with a readable message. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('File is not valid JSON');
  }
  if (!isObj(data)) fail('Backup must be a JSON object');
  if (data.version !== 1) fail(`Unsupported backup version: ${String(data.version)}`);

  const songs = (data.songs ?? []) as unknown[];
  const chords = (data.chords ?? []) as unknown[];
  const patterns = (data.patterns ?? []) as unknown[];
  if (!Array.isArray(songs) || !Array.isArray(chords) || !Array.isArray(patterns)) {
    fail('songs, chords and patterns must be arrays');
  }
  chords.forEach(checkChord);
  patterns.forEach(checkPattern);
  songs.forEach(checkSong);
  return { version: 1, songs: songs as Song[], chords: chords as Chord[], patterns: patterns as StrummingPattern[] };
}

/**
 * Plan an import: re-ID anything that collides with existing IDs (user data
 * or presets), remap song references, and verify every reference resolves to
 * something in the backup or an existing/preset ID.
 */
export function prepareImport(
  backup: BackupFile,
  existingIds: Set<string>,
  newId: () => string = () => crypto.randomUUID(),
): ImportPlan {
  const remapped: Record<string, string> = {};

  function assignId(oldId: string): string {
    if (!existingIds.has(oldId)) return oldId;
    const fresh = newId();
    remapped[oldId] = fresh;
    return fresh;
  }

  const chords = backup.chords.map((c) => ({ ...c, id: assignId(c.id) }));
  const patterns = backup.patterns.map((p) => ({ ...p, id: assignId(p.id) }));

  const knownChordIds = new Set(chords.map((c) => c.id));
  const knownPatternIds = new Set(patterns.map((p) => p.id));

  const songs = backup.songs.map((song) => {
    const id = assignId(song.id);
    const sections = song.sections.map((sec) => ({
      ...sec,
      bars: sec.bars.map((bar) => {
        const chordId = remapped[bar.chordId] ?? bar.chordId;
        const patternId = remapped[bar.patternId] ?? bar.patternId;
        if (!knownChordIds.has(chordId) && !existingIds.has(chordId)) {
          fail(`Song "${song.title}" references missing chord "${bar.chordId}"`);
        }
        if (!knownPatternIds.has(patternId) && !existingIds.has(patternId)) {
          fail(`Song "${song.title}" references missing pattern "${bar.patternId}"`);
        }
        return { chordId, patternId };
      }),
    }));
    return { ...song, id, sections };
  });

  return { songs, chords, patterns, remapped };
}
