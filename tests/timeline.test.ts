import { describe, expect, it } from 'vitest';
import { compileTimeline, nextChordChange } from '../src/audio/timeline';
import type { Song, StrummingPattern } from '../src/types/models';

const eighthPattern: StrummingPattern = {
  id: 'p8',
  name: 'Eighths',
  steps: [
    { direction: 'D' },
    { direction: '-' },
    { direction: 'D' },
    { direction: 'U' },
    { direction: '-' },
    { direction: 'U' },
    { direction: 'D' },
    { direction: 'U' },
  ],
  strings: [true, true, true, true, true, true],
};

const quarterPattern: StrummingPattern = {
  id: 'p4',
  name: 'Quarters',
  steps: [{ direction: 'D' }, { direction: 'D' }, { direction: 'D' }, { direction: 'D' }],
  strings: [true, true, true, true, true, true],
};

const patterns = new Map([
  [eighthPattern.id, eighthPattern],
  [quarterPattern.id, quarterPattern],
]);

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'test',
    title: 'Test Song',
    bpm: 90,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 2,
        bars: [
          { chordId: 'em', patternId: 'p8' },
          { chordId: 'd69', patternId: 'p8' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 1,
        bars: [{ chordId: 'g', patternId: 'p4' }],
      },
    ],
    ...overrides,
  };
}

describe('compileTimeline', () => {
  it('expands sections, repeats and bars into a flat step list', () => {
    const tl = compileTimeline(makeSong(), patterns);
    // Verse: 2 repeats × 2 bars × 8 steps = 32; Chorus: 1 × 1 × 4 = 4
    expect(tl.steps).toHaveLength(36);
    expect(tl.totalBeats).toBe(20); // 4 bars verse + 1 bar chorus, 4 beats each
    expect(tl.beatsPerBar).toBe(4);
  });

  it('positions steps in absolute beats with correct durations', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(tl.steps[0].atBeat).toBe(0);
    expect(tl.steps[0].durationBeats).toBe(0.5); // 8 steps over 4 beats
    expect(tl.steps[1].atBeat).toBe(0.5);
    expect(tl.steps[8].atBeat).toBe(4); // second bar starts on beat 4
    expect(tl.steps[8].chordId).toBe('d69');
    // Chorus quarter pattern: 4 steps over 4 beats
    const chorusFirst = tl.steps[32];
    expect(chorusFirst.durationBeats).toBe(1);
    expect(chorusFirst.atBeat).toBe(16);
  });

  it('tracks beatInBar for metronome accents', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(tl.steps[0].beatInBar).toBe(0);
    expect(tl.steps[3].beatInBar).toBe(1.5);
    expect(tl.steps[8].beatInBar).toBe(0); // new bar resets
  });

  it('records section step ranges for loop-a-section', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(tl.sections).toEqual([
      { name: 'Verse', stepStart: 0, stepEnd: 32 },
      { name: 'Chorus', stepStart: 32, stepEnd: 36 },
    ]);
  });

  it('labels repeats and bar indices', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(tl.steps[0].repeatIdx).toBe(0);
    expect(tl.steps[16].repeatIdx).toBe(1); // second pass through the verse
    expect(tl.steps[16].barIdx).toBe(0);
    expect(tl.steps[24].barIdx).toBe(1);
  });

  it('treats repeat < 1 as a single pass', () => {
    const song = makeSong();
    song.sections[0].repeat = 0;
    const tl = compileTimeline(song, patterns);
    expect(tl.steps.filter((s) => s.sectionIdx === 0)).toHaveLength(16);
  });

  it('throws on a missing pattern reference', () => {
    const song = makeSong();
    song.sections[0].bars[0].patternId = 'nope';
    expect(() => compileTimeline(song, patterns)).toThrow(/nope/);
  });
});

describe('nextChordChange', () => {
  it('finds the next step with a different chord', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(nextChordChange(tl, 0)).toBe(8); // em → d69 at bar 2
    expect(nextChordChange(tl, 8)).toBe(16); // d69 → em (verse repeat)
  });

  it('returns null when the chord never changes again', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(nextChordChange(tl, 35)).toBeNull();
    expect(nextChordChange(tl, 999)).toBeNull();
  });
});
