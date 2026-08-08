import type { Chord } from '../types/models';
import { STRING_COUNT } from '../types/models';

const SVG_NS = 'http://www.w3.org/2000/svg';

const FRETS_SHOWN = 5;

// Layout constants (viewBox units)
const W = 200;
const H = 240;
const GRID_LEFT = 36;
const GRID_RIGHT = 178;
const GRID_TOP = 46;
const GRID_BOTTOM = 226;
const GRID_W = GRID_RIGHT - GRID_LEFT;
const GRID_H = GRID_BOTTOM - GRID_TOP;
const STRING_GAP = GRID_W / (STRING_COUNT - 1);
const FRET_GAP = GRID_H / FRETS_SHOWN;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(x: number, y: number, content: string, size: number, fill: string): SVGTextElement {
  const t = el('text', {
    x,
    y,
    'font-size': size,
    fill,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': 'inherit',
  });
  t.textContent = content;
  return t;
}

/**
 * Renders a chord chart into an <svg>. Standard chart orientation:
 * vertical strings, low E on the left, nut at the top.
 */
export function createChordDiagram(): { svg: SVGSVGElement; render: (chord: Chord) => void } {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
  svg.classList.add('chord-diagram');

  function render(chord: Chord): void {
    svg.innerHTML = '';

    const styles = getComputedStyle(document.documentElement);
    const line = styles.getPropertyValue('--border').trim() || '#444';
    const stringColor = styles.getPropertyValue('--text-dim').trim() || '#999';
    const textColor = styles.getPropertyValue('--text').trim() || '#fff';
    const accent = styles.getPropertyValue('--accent').trim() || '#f5b301';
    const atNut = chord.startFret <= 1;

    // Frets (horizontal lines)
    for (let f = 0; f <= FRETS_SHOWN; f++) {
      const y = GRID_TOP + f * FRET_GAP;
      svg.appendChild(
        el('line', {
          x1: GRID_LEFT,
          y1: y,
          x2: GRID_RIGHT,
          y2: y,
          stroke: f === 0 && atNut ? textColor : line,
          'stroke-width': f === 0 && atNut ? 5 : 1.5,
        }),
      );
    }

    // Strings (vertical lines)
    for (let s = 0; s < STRING_COUNT; s++) {
      const x = GRID_LEFT + s * STRING_GAP;
      svg.appendChild(
        el('line', {
          x1: x,
          y1: GRID_TOP,
          x2: x,
          y2: GRID_BOTTOM,
          stroke: stringColor,
          'stroke-width': 1.5,
        }),
      );
    }

    // Start-fret label for chords up the neck
    if (!atNut) {
      svg.appendChild(text(GRID_LEFT - 20, GRID_TOP + FRET_GAP / 2, String(chord.startFret), 15, stringColor));
    }

    // Per-string markers
    chord.strings.forEach((cs, s) => {
      const x = GRID_LEFT + s * STRING_GAP;
      if (cs.state === 'open') {
        svg.appendChild(
          el('circle', { cx: x, cy: GRID_TOP - 16, r: 6.5, fill: 'none', stroke: textColor, 'stroke-width': 2 }),
        );
      } else if (cs.state === 'muted') {
        const y = GRID_TOP - 16;
        for (const sign of [1, -1]) {
          svg.appendChild(
            el('line', {
              x1: x - 6,
              y1: y - 6 * sign,
              x2: x + 6,
              y2: y + 6 * sign,
              stroke: stringColor,
              'stroke-width': 2,
              'stroke-linecap': 'round',
            }),
          );
        }
      } else if (cs.state === 'fretted' && cs.fret) {
        const relFret = cs.fret - chord.startFret; // 0-based row within the grid
        if (relFret < 0 || relFret >= FRETS_SHOWN) return;
        const y = GRID_TOP + relFret * FRET_GAP + FRET_GAP / 2;
        svg.appendChild(el('circle', { cx: x, cy: y, r: 11, fill: accent }));
        if (cs.finger) svg.appendChild(text(x, y, String(cs.finger), 13, '#141414'));
      }
    });
  }

  return { svg, render };
}
