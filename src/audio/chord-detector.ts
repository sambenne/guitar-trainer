import type { Chord } from '../types/models';
import { chordMidiNotes } from './sampler';

/**
 * Chord detection: FFT spectrum → chromagram (energy per pitch class) →
 * cosine match against templates built from the app's chord definitions.
 * Everything runs locally; microphone audio is analysed frame by frame and
 * never recorded or sent anywhere.
 */

export interface ChordTemplate {
  id: string;
  name: string;
  vector: number[]; // 12-dim, unit length
}

export interface Detection {
  id: string;
  name: string;
  score: number; // cosine similarity 0..1
}

const FREQ_MIN = 70; // just below low E (82 Hz)
const FREQ_MAX = 1100; // covers fundamentals + first harmonics
const SILENCE_GATE = 0.02; // sum of linear magnitudes below this = silence
export const MATCH_THRESHOLD = 0.75;

function normalize(v: number[]): number[] {
  const len = Math.hypot(...v);
  return len > 0 ? v.map((x) => x / len) : v;
}

export function buildTemplates(chords: Chord[]): ChordTemplate[] {
  return chords.map((chord) => {
    const vector = new Array<number>(12).fill(0);
    for (const midi of chordMidiNotes(chord)) {
      if (midi === null) continue;
      vector[midi % 12] = 1;
      // First harmonic of each string (octave) is the same pitch class;
      // the second (a fifth up) colours real guitar spectra, so give it a
      // small weight to match what the chroma of a strum actually looks like.
      vector[(midi + 7) % 12] = Math.max(vector[(midi + 7) % 12], 0.33);
    }
    return { id: chord.id, name: chord.name, vector: normalize(vector) };
  });
}

/** dB spectrum → normalized 12-bin chroma, or null when below the silence gate. */
export function chromaFromSpectrum(db: Float32Array, sampleRate: number, fftSize: number): number[] | null {
  const binHz = sampleRate / fftSize;
  const chroma = new Array<number>(12).fill(0);
  let total = 0;
  const from = Math.max(1, Math.floor(FREQ_MIN / binHz));
  const to = Math.min(db.length - 1, Math.ceil(FREQ_MAX / binHz));
  for (let i = from; i <= to; i++) {
    if (db[i] < -90) continue;
    const mag = 10 ** (db[i] / 20);
    const midi = 69 + 12 * Math.log2((i * binHz) / 440);
    chroma[((Math.round(midi) % 12) + 12) % 12] += mag;
    total += mag;
  }
  if (total < SILENCE_GATE) return null;
  return normalize(chroma);
}

export function matchChroma(chroma: number[], templates: ChordTemplate[]): Detection | null {
  let best: Detection | null = null;
  for (const t of templates) {
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += chroma[i] * t.vector[i];
    if (!best || dot > best.score) best = { id: t.id, name: t.name, score: dot };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

/** Cosine score for every template — lets callers judge near-identical voicings fairly. */
export function allScores(chroma: number[], templates: ChordTemplate[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const t of templates) {
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += chroma[i] * t.vector[i];
    scores[t.id] = dot;
  }
  return scores;
}

/**
 * Which chord of a chosen set was heard: the best-scoring member above the
 * threshold. Restricting the argmax to the set is what makes a board of
 * similar voicings usable — the question is "which of these", not "which of all".
 */
export function bestOfSet(ids: string[], scores: Record<string, number>): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const id of ids) {
    const score = scores[id];
    if (score === undefined) continue;
    if (!best || score > best.score) best = { id, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

/**
 * Is `targetId` effectively what was heard? True when the target scores above
 * the threshold and within a small margin of the outright winner — voicing
 * variants (Em7 vs Em, Cadd9 vs C) overlap too much to demand an exact argmax.
 */
export function targetMatches(targetId: string, best: Detection | null, scores: Record<string, number>): boolean {
  const target = scores[targetId] ?? 0;
  return target >= MATCH_THRESHOLD && target >= (best?.score ?? 0) - 0.035;
}

export interface MicDetector {
  stop(): void;
}

export interface DetectorFrame {
  best: Detection | null;
  scores: Record<string, number>;
}

/**
 * Open the microphone and report a debounced detection frame (or null while
 * silent/unstable). Rejects if the user denies mic access.
 */
export async function createMicDetector(
  chords: Chord[],
  onUpdate: (frame: DetectorFrame | null) => void,
): Promise<MicDetector> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  // Light smoothing only: chord changes must show up within a beat, and the
  // two-frame debounce below already suppresses flicker.
  analyser.smoothingTimeConstant = 0.25;
  source.connect(analyser);

  const templates = buildTemplates(chords);
  const data = new Float32Array(analyser.frequencyBinCount);
  let lastId: string | null = null;

  const timer = setInterval(() => {
    analyser.getFloatFrequencyData(data);
    const chroma = chromaFromSpectrum(data, ctx.sampleRate, analyser.fftSize);
    const match = chroma ? matchChroma(chroma, templates) : null;
    // Debounce: report only when the same result wins two consecutive frames
    const id = match?.id ?? null;
    const stable = id === lastId;
    lastId = id;
    onUpdate(stable && chroma ? { best: match, scores: allScores(chroma, templates) } : null);
  }, 100);

  return {
    stop() {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
