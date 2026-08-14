import type { StrummingPattern } from '../types/models';

const ALL_STRINGS = [true, true, true, true, true, true];

/**
 * Preset strumming patterns, read-only. Steps sit on an 8th-note grid (2 per
 * beat) unless the pattern declares `stepsPerBeat: 4` for sixteenths.
 */
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
    /**
     * Creep, charted as "↓ ↓ ↑↑↓↓ ↓↑" — eight strokes whose spacing sets the
     * rhythm: quarters on 1 and 2, four sixteenths on 3, then eighths on 4.
     * Needs the sixteenth grid to express the beat-3 burst.
     */
    id: 'p-creep',
    name: 'Creep (D D UUDD DU)',
    stepsPerBeat: 4,
    steps: [
      // 1 e & a — quarter-note down
      { direction: 'D' },
      { direction: '-' },
      { direction: '-' },
      { direction: '-' },
      // 2 e & a — quarter-note down
      { direction: 'D' },
      { direction: '-' },
      { direction: '-' },
      { direction: '-' },
      // 3 e & a — the sixteenth burst
      { direction: 'U' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: 'D' },
      // 4 e & a — down, up on the offbeat
      { direction: 'D' },
      { direction: '-' },
      { direction: 'U' },
      { direction: '-' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // Country/rock: three straight downs, then down-up on 4.
    id: 'p-country',
    name: 'Country (D D D DU)',
    steps: [
      { direction: 'D' },
      { direction: '-' },
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
    // Swampy boogie: down-up on 1 and 3, single downs on 2 and 4.
    id: 'p-boogie',
    name: 'Boogie (DU D DU D)',
    steps: [
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: '-' },
      { direction: 'D' },
      { direction: 'U' },
      { direction: 'D' },
      { direction: '-' },
    ],
    strings: [...ALL_STRINGS],
  },
  {
    // Driving folk strum: rest on 2, then continuous down-ups.
    id: 'p-folk',
    name: 'Folk (D - DU DU DU)',
    steps: [
      { direction: 'D' },
      { direction: '-' },
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
