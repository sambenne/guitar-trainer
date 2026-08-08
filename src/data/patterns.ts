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
];
