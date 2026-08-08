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
  {
    id: 'eleanor-rigby',
    title: 'Eleanor Rigby',
    artist: 'The Beatles',
    bpm: 136,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 2,
        bars: [
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
        ],
      },
      {
        id: 'verse',
        name: 'Verse',
        repeat: 2,
        bars: [
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
          { chordId: 'c', patternId: 'p-four-downs' },
          { chordId: 'em', patternId: 'p-four-downs' },
        ],
      },
    ],
  },
  {
    id: 'wonderwall',
    title: 'Wonderwall',
    artist: 'Oasis',
    bpm: 87,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 4,
        bars: [
          { chordId: 'em7', patternId: 'p-down-ups' },
          { chordId: 'g', patternId: 'p-down-ups' },
          { chordId: 'dsus4', patternId: 'p-down-ups' },
          { chordId: 'a7sus4', patternId: 'p-down-ups' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 4,
        bars: [
          { chordId: 'cadd9', patternId: 'p-down-ups' },
          { chordId: 'em7', patternId: 'p-down-ups' },
          { chordId: 'g', patternId: 'p-down-ups' },
          { chordId: 'em7', patternId: 'p-down-ups' },
        ],
      },
    ],
  },
  {
    id: 'perfect',
    title: 'Perfect',
    artist: 'Ed Sheeran',
    bpm: 63,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 4,
        bars: [
          { chordId: 'g', patternId: 'p-campfire' },
          { chordId: 'em', patternId: 'p-campfire' },
          { chordId: 'c', patternId: 'p-campfire' },
          { chordId: 'd', patternId: 'p-campfire' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 4,
        bars: [
          { chordId: 'em', patternId: 'p-campfire' },
          { chordId: 'c', patternId: 'p-campfire' },
          { chordId: 'g', patternId: 'p-campfire' },
          { chordId: 'd', patternId: 'p-campfire' },
        ],
      },
    ],
  },
  {
    id: 'three-little-birds',
    title: 'Three Little Birds',
    artist: 'Bob Marley',
    bpm: 74,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 2,
        bars: [
          { chordId: 'a', patternId: 'p-skank' },
          { chordId: 'a', patternId: 'p-skank' },
          { chordId: 'd', patternId: 'p-skank' },
          { chordId: 'a', patternId: 'p-skank' },
        ],
      },
      {
        id: 'verse',
        name: 'Verse',
        repeat: 2,
        bars: [
          { chordId: 'a', patternId: 'p-skank' },
          { chordId: 'e', patternId: 'p-skank' },
          { chordId: 'd', patternId: 'p-skank' },
          { chordId: 'a', patternId: 'p-skank' },
        ],
      },
    ],
  },
  {
    id: 'zombie',
    title: 'Zombie',
    artist: 'The Cranberries',
    bpm: 84,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        repeat: 4,
        bars: [
          { chordId: 'em', patternId: 'p-down-ups' },
          { chordId: 'c', patternId: 'p-down-ups' },
          { chordId: 'g', patternId: 'p-down-ups' },
          { chordId: 'd', patternId: 'p-down-ups' },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        repeat: 4,
        bars: [
          { chordId: 'em', patternId: 'p-down-ups' },
          { chordId: 'c', patternId: 'p-down-ups' },
          { chordId: 'g', patternId: 'p-down-ups' },
          { chordId: 'd', patternId: 'p-down-ups' },
        ],
      },
    ],
  },
];
