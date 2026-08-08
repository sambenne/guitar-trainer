import './editor.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import { getSettings } from '../app/settings';
import { loadSampler, strumChord } from '../audio/sampler';
import { createStrumDisplay } from '../components/strum-display';
import { PRESET_CHORDS } from '../data/chords';
import * as repo from '../storage/repo';
import { STRING_NAMES, type StrumDirection, type StrummingPattern } from '../types/models';

const PREVIEW_BPM = 80;
/** Chord used to voice the preview strums. */
const PREVIEW_CHORD = PRESET_CHORDS.find((c) => c.id === 'em')!;

const CYCLE: Record<StrumDirection, StrumDirection> = { D: 'U', U: '-', '-': 'D' };
const MAX_STEPS = 24;
const MIN_STEPS = 4;

export function renderPatternEditor(root: HTMLElement, ctx: RouteContext): () => void {
  let disposed = false;
  let audioCtx: AudioContext | null = null;
  let previewing = false;

  const [id, query] = (ctx.params.id ?? '').split('?');
  const duplicate = query?.includes('duplicate=1') ?? false;

  // Working copy
  let draft: StrummingPattern = {
    id: crypto.randomUUID(),
    name: '',
    steps: Array.from({ length: 8 }, (_, i) => ({ direction: i % 2 === 0 ? ('D' as const) : ('-' as const) })),
    strings: [true, true, true, true, true, true],
  };
  let isNew = true;

  void (async () => {
    if (id) {
      const existing = await repo.getPattern(id);
      if (existing) {
        if (duplicate || repo.isPresetPattern(id)) {
          draft = {
            ...structuredClone(existing),
            id: crypto.randomUUID(),
            name: `${existing.name} (copy)`,
          };
        } else {
          draft = structuredClone(existing);
          isNew = false;
        }
        // Legacy data can have an odd step count, which +/− (whole beats)
        // can never fix — pad to a complete beat so the pattern is saveable.
        if (draft.steps.length % 2 !== 0) draft.steps.push({ direction: '-' });
      }
    }
    if (!disposed) build();
  })();

  function build(): void {
    root.innerHTML = `
      <div class="page">
        <div class="editor-head">
          <button class="ghost cancel-btn">Cancel</button>
          <h1>${isNew ? 'New Pattern' : 'Edit Pattern'}</h1>
          <button class="primary save-btn">Save</button>
        </div>

        <label class="field">
          <span>Pattern name</span>
          <input class="name-input" placeholder="e.g. Campfire" maxlength="40" />
        </label>

        <div class="field">
          <span>Pattern — tap a step to cycle D → U → −</span>
          <div class="step-chips"></div>
          <div class="add-row">
            <button class="remove-step">− Remove beat</button>
            <button class="add-step">+ Add beat</button>
          </div>
        </div>

        <div class="field">
          <span>Strings to strum</span>
          <div class="string-toggles"></div>
        </div>

        <div class="field">
          <span style="display:flex;align-items:center;justify-content:space-between">
            Preview
            <button class="preview-play" style="min-height:38px;padding:6px 14px">▶ Play</button>
          </span>
          <div class="card preview-holder"></div>
        </div>

        <p class="editor-error"></p>
      </div>
    `;

    const nameInput = root.querySelector('.name-input') as HTMLInputElement;
    nameInput.value = draft.name;
    nameInput.addEventListener('input', () => (draft.name = nameInput.value));

    const preview = createStrumDisplay();
    preview.svg.classList.add('pattern-preview');
    (root.querySelector('.preview-holder') as HTMLElement).appendChild(preview.svg);

    const chipsEl = root.querySelector('.step-chips') as HTMLElement;
    const togglesEl = root.querySelector('.string-toggles') as HTMLElement;
    const errorEl = root.querySelector('.editor-error') as HTMLElement;

    function refreshPreview(): void {
      preview.setPattern(draft, getSettings().stringOrientation === 'lowTop');
      preview.update(null);
    }

    function renderChips(): void {
      chipsEl.innerHTML = '';
      draft.steps.forEach((step, i) => {
        const chip = document.createElement('button');
        const cls = step.direction === '-' ? 'none' : step.direction;
        chip.className = `step-chip dir-${cls}`;
        const label = i % 2 === 0 ? String(i / 2 + 1) : '&';
        chip.innerHTML = `${step.direction === '-' ? '−' : step.direction}<small>${label}</small>`;
        chip.addEventListener('click', () => {
          draft.steps[i] = { direction: CYCLE[step.direction] };
          renderChips();
          refreshPreview();
        });
        chipsEl.appendChild(chip);
      });
    }

    function renderToggles(): void {
      togglesEl.innerHTML = '';
      // Show strings in the user's chosen panel order
      const lowTop = getSettings().stringOrientation === 'lowTop';
      const order = lowTop ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
      for (const s of order) {
        const btn = document.createElement('button');
        btn.className = 'string-toggle';
        btn.setAttribute('aria-pressed', String(draft.strings[s]));
        btn.innerHTML = `
          <span class="string-name">${STRING_NAMES[s]}</span>
          <span class="string-line"></span>
          <span class="string-state">${draft.strings[s] ? 'on' : 'off'}</span>
        `;
        btn.addEventListener('click', () => {
          draft.strings[s] = !draft.strings[s];
          renderToggles();
          refreshPreview();
        });
        togglesEl.appendChild(btn);
      }
    }

    (root.querySelector('.add-step') as HTMLElement).addEventListener('click', () => {
      if (draft.steps.length >= MAX_STEPS) return;
      draft.steps.push({ direction: 'D' }, { direction: '-' });
      renderChips();
      refreshPreview();
    });

    (root.querySelector('.remove-step') as HTMLElement).addEventListener('click', () => {
      if (draft.steps.length <= MIN_STEPS) return;
      draft.steps.splice(-2, 2);
      renderChips();
      refreshPreview();
    });

    // One play-through of the pattern with sampled strums (voiced as Em)
    const playBtn = root.querySelector('.preview-play') as HTMLButtonElement;
    playBtn.addEventListener('click', async () => {
      if (previewing) return;
      previewing = true;
      playBtn.disabled = true;
      try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const buffers = await loadSampler(audioCtx);

        const stepDur = 60 / PREVIEW_BPM / 2; // 8th-note grid
        const t0 = audioCtx.currentTime + 0.1;
        draft.steps.forEach((step, i) => {
          if (step.direction === '-') return;
          strumChord(audioCtx!, audioCtx!.destination, buffers, PREVIEW_CHORD, {
            when: t0 + i * stepDur,
            direction: step.direction,
            spread: 0.01,
            stringMask: draft.strings,
          });
        });

        const total = draft.steps.length;
        await new Promise<void>((resolve) => {
          const frame = (): void => {
            if (disposed) return resolve();
            const stepFloat = (audioCtx!.currentTime - t0) / stepDur;
            if (stepFloat >= total) return resolve();
            preview.update(Math.max(0, stepFloat));
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        preview.update(null);
      } catch (err) {
        console.error(err);
      } finally {
        previewing = false;
        playBtn.disabled = false;
      }
    });

    (root.querySelector('.cancel-btn') as HTMLElement).addEventListener('click', () => navigate('/editor'));

    (root.querySelector('.save-btn') as HTMLElement).addEventListener('click', async () => {
      if (!draft.name.trim()) {
        errorEl.textContent = 'Give the pattern a name.';
        return;
      }
      if (!draft.strings.some(Boolean)) {
        errorEl.textContent = 'Enable at least one string.';
        return;
      }
      if (!draft.steps.some((s) => s.direction !== '-')) {
        errorEl.textContent = 'Add at least one D or U stroke.';
        return;
      }
      draft.name = draft.name.trim();
      if (draft.steps.length < MIN_STEPS || draft.steps.length > MAX_STEPS || draft.steps.length % 2 !== 0) {
        errorEl.textContent = 'Patterns must contain 2–12 complete beats (two eighth-note steps per beat).';
        return;
      }

      await repo.savePattern(draft);
      navigate('/editor');
    });

    renderChips();
    renderToggles();
    refreshPreview();
  }

  return () => {
    disposed = true;
    void audioCtx?.close();
  };
}
