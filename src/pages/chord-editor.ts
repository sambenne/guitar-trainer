import './editor.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import * as repo from '../storage/repo';
import { STRING_COUNT, STRING_NAMES, type Chord } from '../types/models';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FRETS_SHOWN = 5;

// Same proportions as the read-only chord diagram, plus room for tap targets
const W = 260;
const H = 320;
const GRID_LEFT = 50;
const GRID_RIGHT = 230;
const GRID_TOP = 64;
const GRID_BOTTOM = 300;
const STRING_GAP = (GRID_RIGHT - GRID_LEFT) / (STRING_COUNT - 1);
const FRET_GAP = (GRID_BOTTOM - GRID_TOP) / FRETS_SHOWN;

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
  });
  t.textContent = content;
  return t;
}

export function renderChordEditor(root: HTMLElement, ctx: RouteContext): () => void {
  let disposed = false;

  const [id, query] = (ctx.params.id ?? '').split('?');
  const duplicate = query?.includes('duplicate=1') ?? false;

  let draft: Chord = {
    id: crypto.randomUUID(),
    name: '',
    startFret: 1,
    strings: Array.from({ length: STRING_COUNT }, () => ({ state: 'open' as const })),
  };
  let isNew = true;
  let selectedFinger = 0; // 0 = no finger number

  void (async () => {
    if (id) {
      const existing = await repo.getChord(id);
      if (existing) {
        if (duplicate || repo.isPresetChord(id)) {
          draft = { ...structuredClone(existing), id: crypto.randomUUID(), name: `${existing.name} (copy)` };
        } else {
          draft = structuredClone(existing);
          isNew = false;
        }
      }
    }
    if (!disposed) build();
  })();

  function build(): void {
    root.innerHTML = `
      <div class="page">
        <div class="editor-head">
          <button class="ghost cancel-btn">Cancel</button>
          <h1>${isNew ? 'New Chord' : 'Edit Chord'}</h1>
          <button class="primary save-btn">Save</button>
        </div>

        <label class="field">
          <span>Chord name</span>
          <input class="name-input" placeholder="e.g. Em7" maxlength="20" />
        </label>

        <div class="field">
          <span>Tap the fretboard to place fingers. Tap above the nut to cycle open ○ / muted ×</span>
          <div class="card"><svg class="chord-editor-board" viewBox="0 0 ${W} ${H}"></svg></div>
        </div>

        <div class="field">
          <span>Finger number for new dots</span>
          <div class="finger-picker">
            ${[0, 1, 2, 3, 4]
              .map((f) => `<button data-finger="${f}" aria-pressed="${f === 0}">${f === 0 ? 'None' : f}</button>`)
              .join('')}
          </div>
        </div>

        <div class="field">
          <span>Starting fret</span>
          <div class="stepper">
            <button class="fret-down" aria-label="Lower">−</button>
            <span class="stepper-value fret-value">1</span>
            <button class="fret-up" aria-label="Higher">+</button>
          </div>
        </div>

        <p class="editor-error"></p>
      </div>
    `;

    const nameInput = root.querySelector('.name-input') as HTMLInputElement;
    nameInput.value = draft.name;
    nameInput.addEventListener('input', () => (draft.name = nameInput.value));

    const board = root.querySelector('.chord-editor-board') as SVGSVGElement;
    const fretValue = root.querySelector('.fret-value') as HTMLElement;
    const errorEl = root.querySelector('.editor-error') as HTMLElement;

    function renderBoard(): void {
      board.innerHTML = '';
      const styles = getComputedStyle(document.documentElement);
      const line = styles.getPropertyValue('--border').trim();
      const dim = styles.getPropertyValue('--text-dim').trim();
      const fg = styles.getPropertyValue('--text').trim();
      const accent = styles.getPropertyValue('--accent').trim();
      const atNut = draft.startFret <= 1;

      // String name labels under the grid
      for (let s = 0; s < STRING_COUNT; s++) {
        board.appendChild(text(GRID_LEFT + s * STRING_GAP, H - 8, STRING_NAMES[s], 13, dim));
      }

      for (let f = 0; f <= FRETS_SHOWN; f++) {
        const y = GRID_TOP + f * FRET_GAP;
        board.appendChild(
          el('line', {
            x1: GRID_LEFT,
            y1: y,
            x2: GRID_RIGHT,
            y2: y,
            stroke: f === 0 && atNut ? fg : line,
            'stroke-width': f === 0 && atNut ? 5 : 1.5,
          }),
        );
      }
      for (let s = 0; s < STRING_COUNT; s++) {
        const x = GRID_LEFT + s * STRING_GAP;
        board.appendChild(
          el('line', { x1: x, y1: GRID_TOP, x2: x, y2: GRID_BOTTOM, stroke: dim, 'stroke-width': 1.5 }),
        );
      }
      if (!atNut) board.appendChild(text(GRID_LEFT - 26, GRID_TOP + FRET_GAP / 2, String(draft.startFret), 15, dim));

      // Nut-state markers + fretted dots
      draft.strings.forEach((cs, s) => {
        const x = GRID_LEFT + s * STRING_GAP;
        if (cs.state === 'open') {
          board.appendChild(el('circle', { cx: x, cy: GRID_TOP - 22, r: 8, fill: 'none', stroke: fg, 'stroke-width': 2 }));
        } else if (cs.state === 'muted') {
          for (const sign of [1, -1]) {
            board.appendChild(
              el('line', {
                x1: x - 7,
                y1: GRID_TOP - 22 - 7 * sign,
                x2: x + 7,
                y2: GRID_TOP - 22 + 7 * sign,
                stroke: dim,
                'stroke-width': 2.5,
                'stroke-linecap': 'round',
              }),
            );
          }
        } else if (cs.state === 'fretted' && cs.fret) {
          const rel = cs.fret - draft.startFret;
          if (rel >= 0 && rel < FRETS_SHOWN) {
            const y = GRID_TOP + rel * FRET_GAP + FRET_GAP / 2;
            board.appendChild(el('circle', { cx: x, cy: y, r: 13, fill: accent }));
            if (cs.finger) board.appendChild(text(x, y, String(cs.finger), 14, '#141414'));
          }
        }

        // ---- Tap targets (invisible, on top) ----
        const nutHit = el('rect', {
          x: x - STRING_GAP / 2,
          y: 0,
          width: STRING_GAP,
          height: GRID_TOP - 6,
          fill: 'transparent',
        });
        nutHit.addEventListener('click', () => {
          draft.strings[s] = { state: draft.strings[s].state === 'muted' ? 'open' : 'muted' };
          renderBoard();
        });
        board.appendChild(nutHit);

        for (let r = 0; r < FRETS_SHOWN; r++) {
          const hit = el('rect', {
            x: x - STRING_GAP / 2,
            y: GRID_TOP + r * FRET_GAP,
            width: STRING_GAP,
            height: FRET_GAP,
            fill: 'transparent',
          });
          hit.addEventListener('click', () => {
            const fret = draft.startFret + r;
            const cur = draft.strings[s];
            if (cur.state === 'fretted' && cur.fret === fret) {
              draft.strings[s] = { state: 'open' };
            } else {
              draft.strings[s] = { state: 'fretted', fret, ...(selectedFinger ? { finger: selectedFinger } : {}) };
            }
            renderBoard();
          });
          board.appendChild(hit);
        }
      });
    }

    root.querySelectorAll<HTMLButtonElement>('.finger-picker button').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedFinger = Number(btn.dataset.finger);
        root
          .querySelectorAll('.finger-picker button')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      });
    });

    function setStartFret(next: number): void {
      const startFret = Math.min(15, Math.max(1, next));
      const delta = startFret - draft.startFret;
      if (delta === 0) return;
      draft.strings = draft.strings.map((string) =>
        string.state === 'fretted' && string.fret ? { ...string, fret: string.fret + delta } : string,
      );
      draft.startFret = startFret;
      fretValue.textContent = String(draft.startFret);
      renderBoard();
    }
    (root.querySelector('.fret-down') as HTMLElement).addEventListener('click', () => setStartFret(draft.startFret - 1));
    (root.querySelector('.fret-up') as HTMLElement).addEventListener('click', () => setStartFret(draft.startFret + 1));
    fretValue.textContent = String(draft.startFret);

    (root.querySelector('.cancel-btn') as HTMLElement).addEventListener('click', () => navigate('/editor'));
    (root.querySelector('.save-btn') as HTMLElement).addEventListener('click', async () => {
      if (!draft.name.trim()) {
        errorEl.textContent = 'Give the chord a name.';
        return;
      }
      draft.name = draft.name.trim();
      const hasHiddenFinger = draft.strings.some(
        (string) =>
          string.state === 'fretted' &&
          (!string.fret || string.fret < draft.startFret || string.fret >= draft.startFret + FRETS_SHOWN),
      );
      if (hasHiddenFinger) {
        errorEl.textContent = 'Every fretted note must be visible within the five-fret window.';
        return;
      }

      await repo.saveChord(draft);
      navigate('/editor');
    });

    renderBoard();
  }

  return () => {
    disposed = true;
  };
}
