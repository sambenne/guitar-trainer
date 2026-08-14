import type { Song, StrummingPattern, StrumDirection } from '../types/models';
import { patternStepsPerBeat } from '../types/models';

/** One strum step, flattened out of sections/repeats/bars, positioned in beats. */
export interface TimelineStep {
  /** Absolute beat position from song start. */
  atBeat: number;
  durationBeats: number;
  /** 0-based beat within its bar (float). */
  beatInBar: number;
  sectionIdx: number;
  sectionName: string;
  repeatIdx: number;
  /** Bar index within the section's bar list. */
  barIdx: number;
  /** 0-based bar number across the whole song, counting repeats. */
  barIndex: number;
  /** Step index within the pattern. */
  stepIdx: number;
  chordId: string;
  patternId: string;
  direction: StrumDirection;
}

export interface TimelineSection {
  name: string;
  /** Index into steps of the section's first step. */
  stepStart: number;
  /** Exclusive end index. */
  stepEnd: number;
}

export interface Timeline {
  steps: TimelineStep[];
  totalBeats: number;
  beatsPerBar: number;
  sections: TimelineSection[];
  /**
   * Step index where each bar begins. Bars can hold different numbers of steps
   * (an eighth-note pattern in one bar, sixteenths in the next), so callers must
   * use this rather than dividing by a fixed steps-per-bar.
   */
  barStarts: number[];
}

export interface PlaybackLoopRange {
  start: number;
  end: number;
}

export interface UpcomingChordChange {
  index: number;
  /** Musical distance from the current step's start, including a loop wrap when needed. */
  beatsFromStepStart: number;
}

/**
 * Compile a song into a flat, beat-positioned step list. Pure — no audio, no DOM.
 * BPM is deliberately absent: beats convert to seconds only at schedule time.
 */
export function compileTimeline(song: Song, patterns: Map<string, StrummingPattern>): Timeline {
  const beatsPerBar = song.timeSignature.beats;
  const steps: TimelineStep[] = [];
  const sections: TimelineSection[] = [];
  const barStarts: number[] = [];
  let atBeat = 0;
  let barIndex = 0;

  song.sections.forEach((section, sectionIdx) => {
    const stepStart = steps.length;
    const repeat = Math.max(1, section.repeat);
    for (let repeatIdx = 0; repeatIdx < repeat; repeatIdx++) {
      section.bars.forEach((bar, barIdx) => {
        const pattern = patterns.get(bar.patternId);
        if (!pattern || pattern.steps.length === 0) {
          throw new Error(`Unknown or empty pattern "${bar.patternId}" in song "${song.id}"`);
        }
        const stepsPerBeat = patternStepsPerBeat(pattern);
        const durationBeats = beatsPerBar / pattern.steps.length;
        const requiredSteps = beatsPerBar * stepsPerBeat;
        if (pattern.steps.length !== requiredSteps) {
          throw new Error(
            `Pattern "${bar.patternId}" has ${pattern.steps.length} steps; ` +
              `${song.timeSignature.beats}/${song.timeSignature.noteValue} at ${stepsPerBeat} per beat ` +
              `requires ${requiredSteps}`,
          );
        }
        // Optional mid-bar chord change: split.chordId takes over from
        // the step that lands on split.atBeat (1-based whole beat).
        const split = bar.split;
        if (split && (!Number.isInteger(split.atBeat) || split.atBeat < 2 || split.atBeat > beatsPerBar)) {
          throw new Error(`Bar ${barIdx + 1} in song "${song.id}" has an invalid split beat ${split.atBeat}`);
        }
        const splitFromStep = split ? (split.atBeat - 1) * stepsPerBeat : Infinity;

        barStarts.push(steps.length);
        pattern.steps.forEach((strum, stepIdx) => {
          steps.push({
            atBeat,
            durationBeats,
            beatInBar: stepIdx * durationBeats,
            sectionIdx,
            sectionName: section.name,
            repeatIdx,
            barIdx,
            barIndex,
            stepIdx,
            chordId: stepIdx >= splitFromStep ? split!.chordId : bar.chordId,
            patternId: bar.patternId,
            direction: strum.direction,
          });
          atBeat += durationBeats;
        });
        barIndex++;
      });
    }
    sections.push({ name: section.name, stepStart, stepEnd: steps.length });
  });

  return { steps, totalBeats: atBeat, beatsPerBar, sections, barStarts };
}

/** Index of the next step (at or after `stepIdx`) whose chord differs; null if none. */
export function nextChordChange(timeline: Timeline, stepIdx: number): number | null {
  const current = timeline.steps[stepIdx];
  if (!current) return null;
  for (let i = stepIdx + 1; i < timeline.steps.length; i++) {
    if (timeline.steps[i].chordId !== current.chordId) return i;
  }
  return null;
}

/** Find the next chord the player will actually reach, respecting an optional loop and its wrap. */
export function nextChordChangeForPlayback(
  timeline: Timeline,
  stepIdx: number,
  loop: PlaybackLoopRange | null,
): UpcomingChordChange | null {
  const current = timeline.steps[stepIdx];
  if (!current) return null;

  const rangeStart = loop ? Math.max(0, loop.start) : 0;
  const rangeEnd = loop ? Math.min(timeline.steps.length, loop.end) : timeline.steps.length;
  if (rangeStart >= rangeEnd) return null;

  const forwardEnd = loop && stepIdx < rangeEnd ? rangeEnd : timeline.steps.length;
  for (let i = stepIdx + 1; i < forwardEnd; i++) {
    if (timeline.steps[i].chordId !== current.chordId) {
      return { index: i, beatsFromStepStart: timeline.steps[i].atBeat - current.atBeat };
    }
  }

  if (!loop) return null;

  const rangeStartBeat = timeline.steps[rangeStart].atBeat;
  const rangeEndBeat = rangeEnd === timeline.steps.length ? timeline.totalBeats : timeline.steps[rangeEnd].atBeat;
  const beatDistanceToWrap = Math.max(0, rangeEndBeat - current.atBeat);
  const wrapSearchEnd = Math.min(stepIdx + 1, rangeEnd);

  for (let i = rangeStart; i < wrapSearchEnd; i++) {
    if (timeline.steps[i].chordId !== current.chordId) {
      return {
        index: i,
        beatsFromStepStart: beatDistanceToWrap + (timeline.steps[i].atBeat - rangeStartBeat),
      };
    }
  }

  return null;
}
