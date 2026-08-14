import type { Chord, StrumDirection } from '../types/models';

/**
 * Chord playback using the FreePats FSS Steel String Guitar samples
 * (bundled in public/samples/, see FREEPATS-README.txt for attribution).
 * Each sample covers nearby pitches via playbackRate shifting.
 */

interface SampleDef {
  midi: number;
  url: string;
}

const SAMPLES: SampleDef[] = [
  { midi: 40, url: 'samples/e2.wav' },
  { midi: 45, url: 'samples/a2.wav' },
  { midi: 51, url: 'samples/ds3.wav' },
  { midi: 56, url: 'samples/gs3.wav' },
  { midi: 60, url: 'samples/c4.wav' },
  { midi: 63, url: 'samples/ds4.wav' },
  { midi: 66, url: 'samples/fs4.wav' },
  { midi: 69, url: 'samples/a4.wav' },
];

/** Open-string MIDI notes, low E → high e (standard tuning). */
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

let loadPromise: Promise<Map<number, AudioBuffer>> | null = null;

export function loadSampler(ctx: AudioContext): Promise<Map<number, AudioBuffer>> {
  if (!loadPromise) {
    const base = import.meta.env.BASE_URL;
    loadPromise = Promise.all(
      SAMPLES.map(async (s) => {
        const res = await fetch(base + s.url);
        if (!res.ok) throw new Error(`Failed to load sample ${s.url}`);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        return [s.midi, buf] as const;
      }),
    ).then((entries) => new Map(entries));
    loadPromise.catch(() => (loadPromise = null)); // allow retry after failure
  }
  return loadPromise;
}

/**
 * MIDI note per string for a chord; null = muted/unplayed.
 * A capo raises every sounding string by the same number of semitones
 * (fret positions are relative to the capo, exactly like on a real guitar).
 */
export function chordMidiNotes(chord: Chord, capo = 0): (number | null)[] {
  return chord.strings.map((cs, i) => {
    if (cs.state === 'muted') return null;
    if (cs.state === 'fretted' && cs.fret) return OPEN_STRING_MIDI[i] + cs.fret + capo;
    return OPEN_STRING_MIDI[i] + capo;
  });
}

function nearestSample(buffers: Map<number, AudioBuffer>, midi: number): { midi: number; buffer: AudioBuffer } {
  let best: { midi: number; buffer: AudioBuffer } | null = null;
  for (const [m, buffer] of buffers) {
    if (!best || Math.abs(m - midi) < Math.abs(best.midi - midi)) best = { midi: m, buffer };
  }
  return best!;
}

/**
 * Safety limiter for strum output. Per-voice gain alone cannot guarantee
 * headroom: a tight strum of a four-string chord sums almost coherently and
 * peaked at 1.28 in testing. Route strums through this instead of straight to
 * the destination.
 */
export function createStrumLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  return limiter;
}

export interface StrumOptions {
  /** AudioContext time to start; defaults to now. */
  when?: number;
  direction?: StrumDirection;
  /** Seconds between adjacent string onsets. ~0.008 tight, ~0.05 slow roll. */
  spread?: number;
  /** Only strum strings where mask[i] is true (in addition to chord muting). */
  stringMask?: boolean[];
  /** Capo fret — raises every note by this many semitones. */
  capo?: number;
  gain?: number;
}

/**
 * Strum a chord. Downstrokes roll low E → high e, upstrokes the reverse.
 * Returns the time of the last string onset.
 */
export function strumChord(
  // BaseAudioContext so the same code can render offline (used by tests/tools)
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffers: Map<number, AudioBuffer>,
  chord: Chord,
  opts: StrumOptions = {},
): number {
  const { when = ctx.currentTime, direction = 'D', spread = 0.012, stringMask, capo = 0, gain = 0.9 } = opts;

  const notes = chordMidiNotes(chord, capo)
    .map((midi, stringIdx) => ({ midi, stringIdx }))
    .filter((n): n is { midi: number; stringIdx: number } => n.midi !== null)
    .filter((n) => !stringMask || stringMask[n.stringIdx]);

  const order = direction === 'U' ? [...notes].reverse() : notes;
  let t = when;
  order.forEach((note, i) => {
    const sample = nearestSample(buffers, note.midi);
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = Math.pow(2, (note.midi - sample.midi) / 12);

    const g = ctx.createGain();
    // Headroom for the worst case: six strings whose transients align. At 0.55
    // a full G peaked slightly over 1.0 and clipped a few samples.
    g.gain.value = gain / Math.max(2.2, notes.length * 0.62);
    src.connect(g);
    g.connect(destination);
    t = when + i * spread;
    src.start(t);
  });
  return t;
}
