import { describe, expect, it } from 'vitest';
import { buildSongExport, parseBackup, prepareImport, type BackupFile } from '../src/storage/transfer';
import type { Chord, Song, StrummingPattern } from '../src/types/models';

const chord: Chord = {
  id: 'my-chord',
  name: 'Xm',
  startFret: 1,
  strings: [
    { state: 'open' },
    { state: 'muted' },
    { state: 'fretted', fret: 2, finger: 1 },
    { state: 'open' },
    { state: 'open' },
    { state: 'open' },
  ],
};

const pattern: StrummingPattern = {
  id: 'my-pattern',
  name: 'Mine',
  steps: [
    { direction: 'D' },
    { direction: 'U' },
    { direction: 'D' },
    { direction: 'U' },
  ],
  strings: [true, true, true, true, true, true],
};

const song: Song = {
  id: 'my-song',
  title: 'My Song',
  bpm: 100,
  timeSignature: { beats: 4, noteValue: 4 },
  sections: [
    {
      id: 's1',
      name: 'Verse',
      repeat: 1,
      bars: [{ chordId: 'my-chord', patternId: 'my-pattern' }],
    },
  ],
};

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return { version: 1, songs: [song], chords: [chord], patterns: [pattern], ...overrides };
}

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    const parsed = parseBackup(JSON.stringify(backup()));
    expect(parsed.songs).toHaveLength(1);
    expect(parsed.chords).toHaveLength(1);
    expect(parsed.patterns).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('{nope')).toThrow(/not valid JSON/);
  });

  it('rejects wrong version', () => {
    expect(() => parseBackup(JSON.stringify({ version: 2 }))).toThrow(/version/);
  });

  it('rejects a chord with the wrong number of strings', () => {
    const bad = backup({ chords: [{ ...chord, strings: chord.strings.slice(0, 5) }] });
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/6 entries/);
  });

  it('rejects a pattern with an invalid direction', () => {
    const bad = backup({
      patterns: [
        {
          ...pattern,
          steps: [{ direction: 'X' as never }, ...pattern.steps.slice(1)],
        },
      ],
    });
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/steps\[0\]/);
  });


  it('rejects a pattern with an incomplete beat', () => {
    const bad = backup({ patterns: [{ ...pattern, steps: pattern.steps.slice(0, 3) }] });
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/complete beats/);
  });

  it('rejects a chord whose finger is outside the visible fret window', () => {
    const badChord: Chord = {
      ...chord,
      strings: chord.strings.map((string, index) =>
        index === 2 ? { state: 'fretted', fret: 7, finger: 1 } : string,
      ),
    };
    expect(() => parseBackup(JSON.stringify(backup({ chords: [badChord] })))).toThrow(/five-fret window/);
  });
  it('rejects a song with out-of-range bpm', () => {
    const bad = backup({ songs: [{ ...song, bpm: 999 }] });
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/bpm/);
  });

  it('treats missing collections as empty', () => {
    const parsed = parseBackup(JSON.stringify({ version: 1 }));
    expect(parsed.songs).toEqual([]);
  });
});

describe('prepareImport', () => {
  it('keeps IDs that do not collide', () => {
    const plan = prepareImport(backup(), new Set());
    expect(plan.songs[0].id).toBe('my-song');
    expect(plan.remapped).toEqual({});
  });

  it('re-IDs collisions and remaps song references', () => {
    let n = 0;
    const plan = prepareImport(backup(), new Set(['my-chord', 'my-song']), () => `new-${++n}`);
    expect(plan.chords[0].id).toBe('new-1');
    expect(plan.songs[0].id).toBe('new-2');
    expect(plan.songs[0].sections[0].bars[0].chordId).toBe('new-1');
    expect(plan.songs[0].sections[0].bars[0].patternId).toBe('my-pattern');
    expect(plan.remapped).toEqual({ 'my-chord': 'new-1', 'my-song': 'new-2' });
  });

  it('allows references to existing/preset IDs outside the backup', () => {
    const b = backup({ chords: [] });
    b.songs = [
      { ...song, sections: [{ id: 's1', name: 'V', repeat: 1, bars: [{ chordId: 'em', patternId: 'my-pattern' }] }] },
    ];
    const plan = prepareImport(b, new Set(['em']));
    expect(plan.songs[0].sections[0].bars[0].chordId).toBe('em');
  });

  it('rejects songs referencing chords that resolve nowhere', () => {
    const b = backup({ chords: [] });
    expect(() => prepareImport(b, new Set())).toThrow(/missing chord "my-chord"/);
  });
});

describe('buildSongExport', () => {
  it('bundles only non-preset referenced chords/patterns', () => {
    const mixed: Song = {
      ...song,
      sections: [
        {
          id: 's1',
          name: 'V',
          repeat: 1,
          bars: [
            { chordId: 'em', patternId: 'p-campfire' }, // presets — not bundled
            { chordId: 'my-chord', patternId: 'my-pattern' },
          ],
        },
      ],
    };
    const chordMap = new Map([['my-chord', chord]]);
    const patternMap = new Map([['my-pattern', pattern]]);
    const file = buildSongExport(mixed, chordMap, patternMap, (id) => id === 'em', (id) => id === 'p-campfire');
    expect(file.songs).toHaveLength(1);
    expect(file.chords.map((c) => c.id)).toEqual(['my-chord']);
    expect(file.patterns.map((p) => p.id)).toEqual(['my-pattern']);
  });
});
