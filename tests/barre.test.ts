import { describe, expect, it } from 'vitest';
import { barreFollowerStrings, barreGroups } from '../src/components/chord-diagram';
import type { ChordString } from '../src/types/models';

const open = (): ChordString => ({ state: 'open' });
const muted = (): ChordString => ({ state: 'muted' });
const fret = (fret: number, finger?: number): ChordString => ({ state: 'fretted', fret, finger });

describe('barreGroups', () => {
  it('groups strings that share a fret and a finger', () => {
    // B: x-2(1)-4(2)-4(3)-4(4)-2(1) — index bars fret 2 across A and high e
    const b = [muted(), fret(2, 1), fret(4, 2), fret(4, 3), fret(4, 4), fret(2, 1)];
    expect(barreGroups(b)).toEqual([{ fret: 2, finger: 1, strings: [1, 5] }]);
  });

  it('spans all barred strings of a full barre', () => {
    // F: 1(1)-3(3)-3(4)-2(2)-1(1)-1(1)
    const f = [fret(1, 1), fret(3, 3), fret(3, 4), fret(2, 2), fret(1, 1), fret(1, 1)];
    expect(barreGroups(f)).toEqual([{ fret: 1, finger: 1, strings: [0, 4, 5] }]);
  });

  it('is not fooled by a same-fret shape played with different fingers', () => {
    // A: x-0-2(1)-2(2)-2(3)-0 — three fingers on one fret is not a barre
    const a = [muted(), open(), fret(2, 1), fret(2, 2), fret(2, 3), open()];
    expect(barreGroups(a)).toEqual([]);
  });

  it('ignores fretted notes with no finger number', () => {
    const noFingers = [muted(), fret(2), fret(2), open(), open(), open()];
    expect(barreGroups(noFingers)).toEqual([]);
  });

  it('labels only the bass-most string of a barre', () => {
    const f = [fret(1, 1), fret(3, 3), fret(3, 4), fret(2, 2), fret(1, 1), fret(1, 1)];
    expect([...barreFollowerStrings(f)].sort()).toEqual([4, 5]);
  });
});
