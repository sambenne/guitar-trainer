import { describe, expect, it } from 'vitest';
import { compileTimeline, nextChordChange, nextChordChangeForPlayback } from '../src/audio/timeline';
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
  steps: [
    { direction: 'D' },
    { direction: '-' },
    { direction: 'D' },
    { direction: '-' },
    { direction: 'D' },
    { direction: '-' },
    { direction: 'D' },
    { direction: '-' },
  ],
  strings: [true, true, true, true, true, true],
};

/** 4/4 on a sixteenth grid: 16 steps. */
const sixteenthPattern: StrummingPattern = {
  id: 'p16',
  name: 'Sixteenths',
  stepsPerBeat: 4,
  steps: Array.from({ length: 16 }, (_, i) => ({ direction: i % 4 === 0 ? ('D' as const) : ('-' as const) })),
  strings: [true, true, true, true, true, true],
};

const patterns = new Map([
  [eighthPattern.id, eighthPattern],
  [quarterPattern.id, quarterPattern],
  [sixteenthPattern.id, sixteenthPattern],
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
    // Verse: 2 repeats × 2 bars × 8 steps = 32; Chorus: 1 × 1 × 8 = 8
    expect(tl.steps).toHaveLength(40);
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
    // Quarter strokes still occupy an eight-step eighth-note grid
    const chorusFirst = tl.steps[32];
    expect(chorusFirst.durationBeats).toBe(0.5);
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
      { name: 'Chorus', stepStart: 32, stepEnd: 40 },
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

  it('rejects a pattern whose eighth-note length does not match the bar', () => {
    const incompatible: StrummingPattern = {
      ...eighthPattern,
      id: 'short',
      steps: eighthPattern.steps.slice(0, 4),
    };
    const song = makeSong();
    song.sections[0].bars[0].patternId = incompatible.id;
    expect(() => compileTimeline(song, new Map([...patterns, [incompatible.id, incompatible]]))).toThrow(/requires 8/);
  });

  it('switches to the split chord mid-bar', () => {
    const song = makeSong();
    // 4/4 bar of Em with D6/9 from beat 3 → steps 0-3 em, steps 4-7 d69
    song.sections[0].bars[0].split = { atBeat: 3, chordId: 'd69' };
    const tl = compileTimeline(song, patterns);
    expect(tl.steps.slice(0, 4).map((s) => s.chordId)).toEqual(['em', 'em', 'em', 'em']);
    expect(tl.steps.slice(4, 8).map((s) => s.chordId)).toEqual(['d69', 'd69', 'd69', 'd69']);
    // Bar boundaries and totals are unchanged
    expect(tl.steps[8].chordId).toBe('d69');
    expect(tl.totalBeats).toBe(20);
  });

  describe('sixteenth-note patterns', () => {
    function sixteenthSong(): Song {
      const song = makeSong();
      song.sections = [
        { id: 'v', name: 'Verse', repeat: 1, bars: [{ chordId: 'em', patternId: 'p16' }, { chordId: 'd69', patternId: 'p16' }] },
      ];
      return song;
    }

    it('lays 16 steps of a quarter the length across the bar', () => {
      const tl = compileTimeline(sixteenthSong(), patterns);
      expect(tl.steps).toHaveLength(32);
      expect(tl.steps[0].durationBeats).toBe(0.25);
      expect(tl.steps[4].atBeat).toBe(1); // fifth sixteenth = beat 2
      expect(tl.steps[16].atBeat).toBe(4); // second bar
      expect(tl.totalBeats).toBe(8);
    });

    it('puts a mid-bar split on the right sixteenth', () => {
      const song = sixteenthSong();
      // Split on beat 3 → step 8 of 16, not step 4
      song.sections[0].bars[0].split = { atBeat: 3, chordId: 'd69' };
      const tl = compileTimeline(song, patterns);
      expect(tl.steps.slice(0, 8).every((s) => s.chordId === 'em')).toBe(true);
      expect(tl.steps.slice(8, 16).every((s) => s.chordId === 'd69')).toBe(true);
      expect(tl.steps[8].beatInBar).toBe(2); // 0-based → beat 3
    });

    it('rejects a sixteenth pattern that does not fill the bar', () => {
      const short: StrummingPattern = { ...sixteenthPattern, id: 'short16', steps: sixteenthPattern.steps.slice(0, 8) };
      const song = sixteenthSong();
      song.sections[0].bars[0].patternId = short.id;
      expect(() => compileTimeline(song, new Map([...patterns, [short.id, short]]))).toThrow(/requires 16/);
    });

    it('numbers bars and records their step offsets when densities are mixed', () => {
      const song = makeSong();
      song.sections = [
        {
          id: 'v',
          name: 'Verse',
          repeat: 1,
          bars: [
            { chordId: 'em', patternId: 'p8' }, // 8 steps
            { chordId: 'd69', patternId: 'p16' }, // 16 steps
            { chordId: 'em', patternId: 'p8' }, // 8 steps
          ],
        },
      ];
      const tl = compileTimeline(song, patterns);
      expect(tl.barStarts).toEqual([0, 8, 24]);
      expect(tl.steps[0].barIndex).toBe(0);
      expect(tl.steps[8].barIndex).toBe(1);
      expect(tl.steps[24].barIndex).toBe(2);
      expect(tl.totalBeats).toBe(12); // three 4-beat bars regardless of grid
    });
  });

  it('rejects a split outside the bar', () => {
    const song = makeSong();
    song.sections[0].bars[0].split = { atBeat: 5, chordId: 'd69' };
    expect(() => compileTimeline(song, patterns)).toThrow(/invalid split beat/);
    song.sections[0].bars[0].split = { atBeat: 1, chordId: 'd69' };
    expect(() => compileTimeline(song, patterns)).toThrow(/invalid split beat/);
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
    expect(nextChordChange(tl, 39)).toBeNull();
    expect(nextChordChange(tl, 999)).toBeNull();
  });
});

describe('nextChordChangeForPlayback', () => {
  it('wraps to the first different chord in a full-song loop', () => {
    const tl = compileTimeline(makeSong(), patterns);
    const change = nextChordChangeForPlayback(tl, 39, { start: 0, end: tl.steps.length });
    expect(change).toEqual({ index: 0, beatsFromStepStart: 0.5 });
  });

  it('does not announce a chord outside a section loop', () => {
    const tl = compileTimeline(makeSong(), patterns);
    const verse = tl.sections[0];
    const change = nextChordChangeForPlayback(tl, verse.stepEnd - 1, {
      start: verse.stepStart,
      end: verse.stepEnd,
    });
    expect(change).toEqual({ index: 0, beatsFromStepStart: 0.5 });
  });

  it('does not wrap when playback is set to play once', () => {
    const tl = compileTimeline(makeSong(), patterns);
    expect(nextChordChangeForPlayback(tl, 39, null)).toBeNull();
  });
});
