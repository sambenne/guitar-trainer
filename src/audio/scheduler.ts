import type { Timeline } from './timeline';
import type { Chord, StrummingPattern } from '../types/models';
import { scheduleClick } from './metronome';
import { createStrumLimiter, loadSampler, strumChord } from './sampler';

/**
 * Lookahead scheduler ("A Tale of Two Clocks" pattern).
 *
 * A coarse JS interval wakes every LOOKAHEAD_MS and schedules, on the
 * AudioContext clock, everything that falls within the next SCHEDULE_AHEAD
 * window: metronome clicks at exact audio times, plus a record of each
 * step's start/end time that the UI reads back via getPosition() on rAF.
 * Musical timing therefore never depends on JS timer accuracy.
 */

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds
const START_DELAY = 0.15; // gap between pressing play and the first count-in click

export type PlaybackState = 'stopped' | 'countIn' | 'playing' | 'paused' | 'ended';

export interface SchedulerPosition {
  state: PlaybackState;
  /** Continuous index into timeline.steps; null unless playing. */
  stepFloat: number | null;
  /** 1-based count-in beat; null unless counting in. */
  countInBeat: number | null;
}

interface StartedStep {
  idx: number;
  start: number;
  end: number;
}

export interface Player {
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setBpm(bpm: number): void;
  getBpm(): number;
  setMetronome(enabled: boolean, volume: number): void;
  /** Strummed chord audio during playback. */
  setGuitar(enabled: boolean, volume: number): void;
  /** Capo fret — strums sound this many semitones higher. */
  setCapo(fret: number): void;
  /** Loop a step range [start, end); null disables looping (song plays once). */
  setLoop(range: { start: number; end: number } | null): void;
  getLoop(): { start: number; end: number } | null;
  getPosition(): SchedulerPosition;
  dispose(): Promise<void>;
}

export function createPlayer(
  timeline: Timeline,
  initialBpm: number,
  chords: Map<string, Chord>,
  patterns: Map<string, StrummingPattern>,
): Player {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let guitarGain: GainNode | null = null;

  let bpm = initialBpm;
  let metronomeEnabled = true;
  let metronomeVolume = 0.8;
  let guitarEnabled = true;
  let guitarVolume = 0.8;
  let capo = 0;
  let sampleBuffers: Map<number, AudioBuffer> | null = null;

  let state: PlaybackState = 'stopped';
  let loop: { start: number; end: number } | null = { start: 0, end: timeline.steps.length };

  let timer: ReturnType<typeof setInterval> | null = null;
  let nextIdx = 0; // next timeline step to schedule
  let nextTime = 0; // audio time at which that step starts
  let started: StartedStep[] = []; // scheduled steps, pruned as they pass
  let countInStart = 0;
  let countInEnd = 0;
  let endTime = Infinity; // audio time at which the song finishes (loop off)

  const secondsPerBeat = () => 60 / bpm;

  function ensureContext(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
    }
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (!guitarGain) {
      guitarGain = ctx.createGain();
      guitarGain.gain.value = guitarVolume;
      const limiter = createStrumLimiter(ctx);
      guitarGain.connect(limiter);
      limiter.connect(masterGain);
    }
    if (guitarEnabled && !sampleBuffers) {
      // Fire and forget — decoding usually finishes during the count-in.
      void loadSampler(ctx).then((buffers) => (sampleBuffers = buffers)).catch(() => {});
    }
    return ctx;
  }

  /** Strum the step's chord at its exact scheduled time. */
  function scheduleStrumForStep(stepIdx: number, startTime: number): void {
    if (!guitarEnabled || !ctx || !guitarGain || !sampleBuffers) return;
    const step = timeline.steps[stepIdx];
    if (step.direction === '-') return;
    const chord = chords.get(step.chordId);
    if (!chord) return;
    strumChord(ctx, guitarGain, sampleBuffers, chord, {
      when: startTime,
      direction: step.direction,
      spread: 0.008,
      stringMask: patterns.get(step.patternId)?.strings,
      capo,
    });
  }

  /** Schedule metronome clicks for every integer beat inside a step's window. */
  function scheduleClicksForStep(stepIdx: number, startTime: number): void {
    if (!metronomeEnabled || !ctx || !masterGain) return;
    const step = timeline.steps[stepIdx];
    const eps = 1e-6;
    let k = Math.ceil(step.atBeat - eps);
    while (k < step.atBeat + step.durationBeats - eps) {
      const time = startTime + (k - step.atBeat) * secondsPerBeat();
      const accent = k % timeline.beatsPerBar === 0;
      scheduleClick(ctx, masterGain, time, accent, metronomeVolume);
      k++;
    }
  }

  function tick(): void {
    if (!ctx || state === 'paused' || state === 'stopped') return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;

    while (nextTime < horizon) {
      // Loop wrap / song end
      if (loop) {
        if (nextIdx >= loop.end || nextIdx < loop.start) nextIdx = loop.start;
      } else if (nextIdx >= timeline.steps.length) {
        endTime = Math.min(endTime, nextTime);
        return;
      }

      const step = timeline.steps[nextIdx];
      const duration = step.durationBeats * secondsPerBeat();
      scheduleClicksForStep(nextIdx, nextTime);
      scheduleStrumForStep(nextIdx, nextTime);
      started.push({ idx: nextIdx, start: nextTime, end: nextTime + duration });
      nextIdx++;
      nextTime += duration;
    }

    // Keep the queue from growing unboundedly
    const now = ctx.currentTime;
    while (started.length > 1 && started[1].start <= now) started.shift();
  }

  async function play(): Promise<void> {
    const audio = ensureContext();
    if (audio.state === 'suspended') await audio.resume();

    if (state === 'paused') {
      state = started.length > 0 ? 'playing' : 'countIn';
      return; // resume() above un-freezes the clock; everything continues
    }
    if (state === 'playing' || state === 'countIn') return;

    // Fresh start (from 'stopped' or 'ended')
    started = [];
    endTime = Infinity;
    nextIdx = loop ? loop.start : 0;

    const spb = secondsPerBeat();
    countInStart = audio.currentTime + START_DELAY;
    countInEnd = countInStart + timeline.beatsPerBar * spb;
    if (metronomeEnabled && masterGain) {
      for (let b = 0; b < timeline.beatsPerBar; b++) {
        scheduleClick(audio, masterGain, countInStart + b * spb, b === 0, metronomeVolume);
      }
    }
    nextTime = countInEnd;
    state = 'countIn';

    if (!timer) timer = setInterval(tick, LOOKAHEAD_MS);
    tick();
  }

  async function pause(): Promise<void> {
    if (!ctx || (state !== 'playing' && state !== 'countIn')) return;
    await ctx.suspend(); // freezes the audio clock; resume continues seamlessly
    state = 'paused';
  }

  async function stop(): Promise<void> {
    state = 'stopped';
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    started = [];
    endTime = Infinity;
    if (ctx && masterGain) {
      // Kill any already-scheduled clicks
      masterGain.disconnect();
      masterGain = null;
      guitarGain = null; // ensureContext rebuilds the chain on next play
    }
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  }

  function getPosition(): SchedulerPosition {
    if (!ctx || state === 'stopped') return { state: 'stopped', stepFloat: null, countInBeat: null };
    const now = ctx.currentTime;

    if (state === 'countIn' || state === 'playing') {
      if (now < countInEnd) {
        const beat = Math.min(timeline.beatsPerBar, Math.floor((now - countInStart) / secondsPerBeat()) + 1);
        return { state: 'countIn', stepFloat: null, countInBeat: Math.max(1, beat) };
      }
      state = 'playing';

      if (now >= endTime) {
        state = 'ended';
        return { state: 'ended', stepFloat: null, countInBeat: null };
      }

      while (started.length > 1 && started[1].start <= now) started.shift();
      const active = started[0];
      if (!active) return { state, stepFloat: null, countInBeat: null };
      const phase = Math.min(0.999, Math.max(0, (now - active.start) / (active.end - active.start)));
      return { state: 'playing', stepFloat: active.idx + phase, countInBeat: null };
    }

    if (state === 'paused') {
      const active = started[0];
      if (now < countInEnd || !active) {
        return { state: 'paused', stepFloat: null, countInBeat: null };
      }
      const phase = Math.min(0.999, Math.max(0, (now - active.start) / (active.end - active.start)));
      return { state: 'paused', stepFloat: active.idx + phase, countInBeat: null };
    }

    return { state, stepFloat: null, countInBeat: null };
  }

  return {
    play,
    pause,
    stop,
    setBpm(next: number) {
      bpm = Math.min(300, Math.max(20, Math.round(next)));
    },
    getBpm: () => bpm,
    setMetronome(enabled: boolean, volume: number) {
      metronomeEnabled = enabled;
      metronomeVolume = volume;
    },
    setGuitar(enabled: boolean, volume: number) {
      guitarEnabled = enabled;
      guitarVolume = volume;
      if (guitarGain) guitarGain.gain.value = volume;
      if (enabled && ctx && !sampleBuffers) {
        void loadSampler(ctx).then((buffers) => (sampleBuffers = buffers)).catch(() => {});
      }
    },
    setCapo(fret: number) {
      capo = Math.min(11, Math.max(0, Math.round(fret)));
    },
    setLoop(range) {
      loop = range;
      if (range && (state === 'playing' || state === 'countIn')) {
        if (nextIdx < range.start || nextIdx >= range.end) nextIdx = range.start;
      }
    },
    getLoop: () => loop,
    getPosition,
    async dispose() {
      await stop();
      if (ctx) {
        await ctx.close();
        ctx = null;
      }
    },
  };
}
