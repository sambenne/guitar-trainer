import './chords.css';
import { createChordDiagram } from '../components/chord-diagram';
import { loadSampler, strumChord } from '../audio/sampler';
import * as repo from '../storage/repo';
import type { Chord } from '../types/models';

type Mode = 'single' | 'compare';

let lastMode: Mode = 'single';
let lastSingleIdx = 0;
let lastCompare: [number, number] = [0, 1];

export function renderChordsPage(root: HTMLElement): () => void {
  let disposed = false;
  let chords: Chord[] = [];
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  async function audio(): Promise<{ ctx: AudioContext; master: GainNode; buffers: Map<number, AudioBuffer> }> {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') await ctx.resume();
    const buffers = await loadSampler(ctx);
    return { ctx, master: master!, buffers };
  }

  async function playChord(chord: Chord, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      const { ctx, master, buffers } = await audio();
      strumChord(ctx, master, buffers, chord, { spread: 0.045 }); // slow roll — hear each string
      setTimeout(() => (btn.disabled = false), 400);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Sound unavailable';
      setTimeout(() => {
        btn.textContent = '🔊 Strum';
        btn.disabled = false;
      }, 1500);
    }
  }

  root.innerHTML = `
    <div class="page chords-page">
      <h1 class="page-title">Chords</h1>
      <div class="mode-toggle" role="tablist">
        <button data-mode="single" aria-pressed="true">Practice</button>
        <button data-mode="compare" aria-pressed="false">Compare</button>
      </div>
      <div class="mode-body"></div>
      <p class="hint muted"></p>
    </div>
  `;

  const body = root.querySelector('.mode-body') as HTMLElement;
  const hint = root.querySelector('.hint') as HTMLElement;

  function setMode(mode: Mode): void {
    lastMode = mode;
    root.querySelectorAll<HTMLButtonElement>('.mode-toggle button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    if (mode === 'single') renderSingle();
    else renderCompare();
  }

  root.querySelectorAll<HTMLButtonElement>('.mode-toggle button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode as Mode));
  });

  function renderSingle(): void {
    body.innerHTML = `
      <div class="chord-single card">
        <div class="chord-cycle">
          <button class="cycle-btn prev" aria-label="Previous chord">‹</button>
          <div class="chord-stage">
            <div class="chord-name"></div>
            <div class="chord-pos"></div>
          </div>
          <button class="cycle-btn next" aria-label="Next chord">›</button>
        </div>
        <button class="strum-sound-btn">🔊 Strum</button>
      </div>
    `;
    hint.textContent = 'Cycle through every chord in your library. Tap Strum to hear how it should sound.';

    const stage = body.querySelector('.chord-stage') as HTMLElement;
    const nameEl = body.querySelector('.chord-name') as HTMLElement;
    const posEl = body.querySelector('.chord-pos') as HTMLElement;
    const diagram = createChordDiagram();
    stage.insertBefore(diagram.svg, posEl);

    function show(): void {
      const chord = chords[lastSingleIdx];
      nameEl.textContent = chord.name;
      diagram.render(chord);
      posEl.textContent = `${lastSingleIdx + 1} of ${chords.length}`;
    }

    (body.querySelector('.prev') as HTMLElement).addEventListener('click', () => {
      lastSingleIdx = (lastSingleIdx - 1 + chords.length) % chords.length;
      show();
    });
    (body.querySelector('.next') as HTMLElement).addEventListener('click', () => {
      lastSingleIdx = (lastSingleIdx + 1) % chords.length;
      show();
    });
    const strumBtn = body.querySelector('.strum-sound-btn') as HTMLButtonElement;
    strumBtn.addEventListener('click', () => void playChord(chords[lastSingleIdx], strumBtn));
    show();
  }

  function renderCompare(): void {
    body.innerHTML = `
      <div class="chord-compare">
        ${[0, 1]
          .map(
            (side) => `
          <div class="compare-panel card" data-side="${side}">
            <select aria-label="Chord ${side + 1}"></select>
            <button class="strum-sound-btn">🔊 Strum</button>
          </div>`,
          )
          .join('')}
      </div>
    `;
    hint.textContent = 'Pick the two chords you’re switching between. Practise moving without looking at your hand.';

    body.querySelectorAll<HTMLElement>('.compare-panel').forEach((panel) => {
      const side = Number(panel.dataset.side) as 0 | 1;
      const select = panel.querySelector('select') as HTMLSelectElement;
      const strumBtn = panel.querySelector('.strum-sound-btn') as HTMLButtonElement;
      select.innerHTML = chords
        .map((c, i) => `<option value="${i}" ${i === lastCompare[side] ? 'selected' : ''}>${c.name}</option>`)
        .join('');
      const diagram = createChordDiagram();
      panel.insertBefore(diagram.svg, strumBtn);
      diagram.render(chords[lastCompare[side]]);
      select.addEventListener('change', () => {
        lastCompare[side] = Number(select.value);
        diagram.render(chords[lastCompare[side]]);
      });
      strumBtn.addEventListener('click', () => void playChord(chords[lastCompare[side]], strumBtn));
    });
  }

  void (async () => {
    chords = await repo.listChords();
    if (disposed || chords.length === 0) return;
    lastSingleIdx = Math.min(lastSingleIdx, chords.length - 1);
    lastCompare = [Math.min(lastCompare[0], chords.length - 1), Math.min(lastCompare[1], chords.length - 1)];
    setMode(lastMode);
  })();

  return () => {
    disposed = true;
    void ctx?.close();
  };
}
