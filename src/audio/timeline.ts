import type { Song, StrummingPattern, StrumDirection } from '../types/models';

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
}

/**
 * Compile a song into a flat, beat-positioned step list. Pure — no audio, no DOM.
 * BPM is deliberately absent: beats convert to seconds only at schedule time.
 */
export function compileTimeline(song: Song, patterns: Map<string, StrummingPattern>): Timeline {
  const beatsPerBar = song.timeSignature.beats;
  const steps: TimelineStep[] = [];
  const sections: TimelineSection[] = [];
  let atBeat = 0;

  song.sections.forEach((section, sectionIdx) => {
    const stepStart = steps.length;
    const repeat = Math.max(1, section.repeat);
    for (let repeatIdx = 0; repeatIdx < repeat; repeatIdx++) {
      section.bars.forEach((bar, barIdx) => {
        const pattern = patterns.get(bar.patternId);
        if (!pattern || pattern.steps.length === 0) {
          throw new Error(`Unknown or empty pattern "${bar.patternId}" in song "${song.id}"`);
        }
        const durationBeats = beatsPerBar / pattern.steps.length;
        pattern.steps.forEach((strum, stepIdx) => {
          steps.push({
            atBeat,
            durationBeats,
            beatInBar: stepIdx * durationBeats,
            sectionIdx,
            sectionName: section.name,
            repeatIdx,
            barIdx,
            stepIdx,
            chordId: bar.chordId,
            patternId: bar.patternId,
            direction: strum.direction,
          });
          atBeat += durationBeats;
        });
      });
    }
    sections.push({ name: section.name, stepStart, stepEnd: steps.length });
  });

  return { steps, totalBeats: atBeat, beatsPerBar, sections };
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
