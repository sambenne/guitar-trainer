import type { Song } from '../types/models';

/** Preset songs, read-only. Chord progressions only — no lyrics. */
export const PRESET_SONGS: Song[] = [
  {
    id: 'horse-with-no-name',
    title: 'A Horse With No Name',
    artist: 'America',
    bpm: 90,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 4,
        bars: [
          { chordId: 'em', patternId: 'p-campfire' },
          { chordId: 'd69', patternId: 'p-campfire' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 4,
        bars: [
          { chordId: 'em', patternId: 'p-campfire' },
          { chordId: 'd69', patternId: 'p-campfire' },
        ],
      },
    ],
  },
  {
    id: 'knockin-on-heavens-door',
    title: "Knockin' On Heaven's Door",
    artist: 'Bob Dylan',
    bpm: 72,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 2,
        bars: [
          { chordId: 'g', patternId: 'p-campfire' },
          { chordId: 'd', patternId: 'p-campfire' },
          { chordId: 'am', patternId: 'p-campfire' },
          { chordId: 'am', patternId: 'p-campfire' },
          { chordId: 'g', patternId: 'p-campfire' },
          { chordId: 'd', patternId: 'p-campfire' },
          { chordId: 'c', patternId: 'p-campfire' },
          { chordId: 'c', patternId: 'p-campfire' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 2,
        bars: [
          { chordId: 'g', patternId: 'p-campfire' },
          { chordId: 'd', patternId: 'p-campfire' },
          { chordId: 'am', patternId: 'p-campfire' },
          { chordId: 'am', patternId: 'p-campfire' },
        ],
      },
    ],
  },
  {
    id: 'stand-by-me',
    title: 'Stand By Me',
    artist: 'Ben E. King',
    bpm: 100,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 2,
        bars: [
          { chordId: 'g', patternId: 'p-four-downs' },
          { chordId: 'g', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'd', patternId: 'p-four-downs' },
          { chordId: 'g', patternId: 'p-four-downs' },
          { chordId: 'g', patternId: 'p-four-downs' },
        ],
      },
    ],
  },
];
