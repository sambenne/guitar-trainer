import type { StrummingPattern, StrumDirection } from '../types/models';
import { STRING_NAMES, STRING_COUNT, patternStepsPerBeat } from '../types/models';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Column width for an eighth-note grid; sixteenths halve it so the panel keeps its shape. */
const COL_W = 80;
/** Counting syllables within one beat, by position: eighths "1 &", sixteenths "1 e & a". */
const SUBDIVISION_LABELS: Record<number, string[]> = {
  2: ['', '&'],
  4: ['', 'e', '&', 'a'],
};

/** How a step is counted aloud — shared so the display and editor never disagree. */
export function stepLabel(stepIndex: number, stepsPerBeat: number): string {
  const within = stepIndex % stepsPerBeat;
  if (within === 0) return String(stepIndex / stepsPerBeat + 1);
  return (SUBDIVISION_LABELS[stepsPerBeat] ?? SUBDIVISION_LABELS[2])[within] ?? '';
}
const H = 280;
const LABEL_Y = 22;
const ARROW_Y = 62;
const STRINGS_TOP = 116;
const STRINGS_BOTTOM = 252;
const STRING_GAP = (STRINGS_BOTTOM - STRINGS_TOP) / (STRING_COUNT - 1);
const PICK_TRAVEL_PAD = 22; // pick sweeps a little beyond the outer strings

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function arrowGlyph(direction: StrumDirection): string {
  return direction === 'D' ? '↓' : direction === 'U' ? '↑' : '–';
}

/**
 * Physical motion of the strumming hand for a step: explicit D/U wins;
 * ghost steps ('-') alternate down on even steps, up on odd (8th-note motion).
 */
function motionIsDown(direction: StrumDirection, stepIndex: number): boolean {
  if (direction === 'D') return true;
  if (direction === 'U') return false;
  return stepIndex % 2 === 0;
}

export interface StrumDisplay {
  svg: SVGSVGElement;
  setPattern(pattern: StrummingPattern, lowStringOnTop: boolean): void;
  /** stepFloat: continuous position in [0, steps); null = stopped/idle. */
  update(stepFloat: number | null): void;
}

export function createStrumDisplay(): StrumDisplay {
  const svg = el('svg', { viewBox: `0 0 ${COL_W * 8} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.classList.add('strum-display');

  let pattern: StrummingPattern | null = null;
  let lowTop = true;
  let colW = COL_W;
  let colors = { line: '#444', dim: '#999', text: '#fff', accent: '#f5b301' };

  // Dynamic nodes, rebuilt by setPattern
  let highlightRect: SVGRectElement | null = null;
  let arrowNodes: SVGTextElement[] = [];
  let stringLines: SVGLineElement[] = [];
  let pick: SVGCircleElement | null = null;
  /** y position of each string row (index = physical string 0..5, low E first). */
  let stringY: number[] = [];
  let lastStep = -1;

  function stepX(i: number): number {
    return i * colW + colW / 2;
  }

  function setPattern(p: StrummingPattern, lowStringOnTop: boolean): void {
    pattern = p;
    lowTop = lowStringOnTop;
    lastStep = -1;

    const styles = getComputedStyle(document.documentElement);
    colors = {
      line: styles.getPropertyValue('--border').trim() || '#444',
      dim: styles.getPropertyValue('--text-dim').trim() || '#999',
      text: styles.getPropertyValue('--text').trim() || '#fff',
      accent: styles.getPropertyValue('--accent').trim() || '#f5b301',
    };

    const stepsPerBeat = patternStepsPerBeat(p);
    const steps = p.steps.length;
    // Sixteenths pack into half-width columns, so a bar occupies the same
    // space as an eighth-note bar instead of doubling the panel's aspect ratio.
    colW = stepsPerBeat === 4 ? COL_W / 2 : COL_W;
    const width = steps * colW;
    svg.setAttribute('viewBox', `0 0 ${width} ${H}`);
    svg.innerHTML = '';
    arrowNodes = [];
    stringLines = [];
    stringY = [];

    // Current-step highlight column (behind everything)
    highlightRect = el('rect', {
      x: 0,
      y: 0,
      width: colW,
      height: H,
      rx: 10,
      fill: colors.accent,
      opacity: 0,
    });
    svg.appendChild(highlightRect);

    // Beat labels + direction arrows
    for (let i = 0; i < steps; i++) {
      const within = i % stepsPerBeat;
      const label = stepLabel(i, stepsPerBeat);
      const labelNode = el('text', {
        x: stepX(i),
        y: LABEL_Y,
        'font-size': within === 0 ? 20 : 17,
        fill: colors.dim,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      labelNode.textContent = label;
      svg.appendChild(labelNode);

      const dir = p.steps[i].direction;
      const arrow = el('text', {
        x: stepX(i),
        y: ARROW_Y,
        'font-size': 34,
        'font-weight': 700,
        fill: dir === '-' ? colors.dim : colors.text,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      arrow.textContent = arrowGlyph(dir);
      svg.appendChild(arrow);
      arrowNodes.push(arrow);
    }

    // Strings (horizontal), physical index 0 = low E
    for (let s = 0; s < STRING_COUNT; s++) {
      const row = lowTop ? s : STRING_COUNT - 1 - s;
      const y = STRINGS_TOP + row * STRING_GAP;
      stringY[s] = y;
      const enabled = p.strings[s];

      const name = el('text', {
        x: 16,
        y,
        'font-size': 16,
        fill: enabled ? colors.dim : colors.line,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      name.textContent = STRING_NAMES[s];
      svg.appendChild(name);

      const lineNode = el('line', {
        x1: 34,
        y1: y,
        x2: width - 12,
        y2: y,
        stroke: enabled ? colors.dim : colors.line,
        'stroke-width': enabled ? 2 : 1,
        'stroke-dasharray': enabled ? 'none' : '4 6',
      });
      svg.appendChild(lineNode);
      stringLines.push(lineNode);
    }

    // Pick indicator
    pick = el('circle', { cx: -100, cy: -100, r: 11, fill: colors.accent, opacity: 0 });
    svg.appendChild(pick);
  }

  function update(stepFloat: number | null): void {
    if (!pattern || !highlightRect || !pick) return;
    const steps = pattern.steps.length;

    if (stepFloat === null) {
      highlightRect.setAttribute('opacity', '0');
      pick.setAttribute('opacity', '0');
      if (lastStep !== -1) {
        arrowNodes.forEach((a, idx) => {
          a.setAttribute('font-size', '34');
          a.setAttribute('fill', pattern!.steps[idx].direction === '-' ? colors.dim : colors.text);
        });
        stringLines.forEach((l, s) => resetString(l, s));
        lastStep = -1;
      }
      return;
    }

    const i = Math.min(Math.floor(stepFloat), steps - 1);
    const phase = stepFloat - i;
    const step = pattern.steps[i];
    const striking = step.direction !== '-';
    const down = motionIsDown(step.direction, i);

    // Column highlight + arrow emphasis
    highlightRect.setAttribute('x', String(i * colW));
    highlightRect.setAttribute('opacity', '0.14');
    if (i !== lastStep) {
      arrowNodes.forEach((a, idx) => {
        a.setAttribute('font-size', idx === i ? '46' : '34');
        a.setAttribute('fill', idx === i ? colors.accent : pattern!.steps[idx].direction === '-' ? colors.dim : colors.text);
      });
      lastStep = i;
    }

    // Pick position: sweep top↔bottom across the panel during the step
    const yStart = down ? STRINGS_TOP - PICK_TRAVEL_PAD : STRINGS_BOTTOM + PICK_TRAVEL_PAD;
    const yEnd = down ? STRINGS_BOTTOM + PICK_TRAVEL_PAD : STRINGS_TOP - PICK_TRAVEL_PAD;
    const y = yStart + (yEnd - yStart) * phase;
    pick.setAttribute('cx', String(stepX(i)));
    pick.setAttribute('cy', String(y));
    pick.setAttribute('opacity', striking ? '1' : '0.35');

    // Strings light up as the (striking) pick passes them
    stringLines.forEach((lineNode, s) => {
      const enabled = pattern!.strings[s];
      if (!enabled || !striking) {
        resetString(lineNode, s);
        return;
      }
      const passed = down ? y >= stringY[s] : y <= stringY[s];
      if (passed) {
        lineNode.setAttribute('stroke', colors.accent);
        lineNode.setAttribute('stroke-width', '3');
      } else {
        resetString(lineNode, s);
      }
    });
  }

  function resetString(lineNode: SVGLineElement, s: number): void {
    const enabled = pattern!.strings[s];
    lineNode.setAttribute('stroke', enabled ? colors.dim : colors.line);
    lineNode.setAttribute('stroke-width', enabled ? '2' : '1');
  }

  return { svg, setPattern, update };
}
