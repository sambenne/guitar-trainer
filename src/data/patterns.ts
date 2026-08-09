import type { StrummingPattern } from '../types/models';

const ALL_STRINGS = [true, true, true, true, true, true];

/** Preset strumming patterns, read-only. Steps are on an 8th-note grid (2 per beat). */
export const PRESET_PATTERNS: StrummingPattern[] = [
  {
    id: 'p-four-downs',
    name: 'Four Downs',
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
    strings: [...ALL_STRINGS],
  },
  {
    id: 'p-halves',
    name: 'Halves',
    steps: [
      { direction: 'D' },
      { direction: '-' },
      { direction: '-' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: '-' },
      { direction: '-' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    id: 'p-campfire',
    name: 'Campfire (D DU UDU)',
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
    strings: [...ALL_STRINGS],
  },
  {
    id: 'p-down-ups',
    name: 'Down Ups',
    steps: [
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: 'U' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // Reggae feel: chop on beats 2 and 4, hand keeps moving through the rest.
    id: 'p-skank',
    name: 'Skank (2 & 4)',
    steps: [
      { direction: '-' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: '-' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // 3/4 time — six 8th-note steps per bar. For hymns and waltzes.
    id: 'p-waltz',
    name: 'Waltz (D - DU DU)',
    steps: [
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: 'U' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // 3/4 time, gentler: down on 1 and 2, down-up on 3.
    id: 'p-waltz-2',
    name: 'Waltz (D D DU)',
    steps: [
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: 'U' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // 6/8 time — a down on each of the six counts, swaying feel.
    id: 'p-68-downs',
    name: '6/8 Downs',
    steps: [
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: '-' },
    ],
    strings: [...ALL_STRINGS],
  },
];
