import './editor.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import { getSettings } from '../app/settings';
import { createStrumLimiter, loadSampler, strumChord } from '../audio/sampler';
import { createStrumDisplay, stepLabel } from '../components/strum-display';
import { PRESET_CHORDS } from '../data/chords';
import * as repo from '../storage/repo';
import {
  STRING_NAMES,
  patternStepsPerBeat,
  type StrumDirection,
  type StrummingPattern,
} from '../types/models';

const PREVIEW_BPM = 80;
/** Chord used to voice the preview strums. */
const PREVIEW_CHORD = PRESET_CHORDS.find((c) => c.id === 'em')!;

const CYCLE: Record<StrumDirection, StrumDirection> = { D: 'U', U: '-', '-': 'D' };
/** Patterns are sized in whole beats; the step count follows the grid resolution. */
const MIN_BEATS = 2;
const MAX_BEATS = 12;

export function renderPatternEditor(root: HTMLElement, ctx: RouteContext): () => void {
  let disposed = false;
  let audioCtx: AudioContext | null = null;
  let audioOut: AudioNode | null = null;
  let previewing = false;

  const [id, query] = (ctx.params.id ?? '').split('?');
  const duplicate = query?.includes('duplicate=1') ?? false;

  // Working copy
  let draft: StrummingPattern = {
    id: crypto.randomUUID(),
    name: '',
    stepsPerBeat: 2,
    steps: Array.from({ length: 8 }, (_, i) => ({ direction: i % 2 === 0 ? ('D' as const) : ('-' as const) })),
    strings: [true, true, true, true, true, true],
  };
  let isNew = true;

  const spb = (): number => patternStepsPerBeat(draft);
  const beats = (): number => draft.steps.length / spb();

  /**
   * Switch grid resolution, keeping the rhythm: 8ths → 16ths puts each existing
   * stroke on the beat/offbeat it already occupied and fills the new gaps with
   * ghost steps; 16ths → 8ths keeps the stroke that starts each eighth.
   */
  function setStepsPerBeat(next: 2 | 4): void {
    const current = spb();
    if (next === current) return;
    if (next === 4) {
      draft.steps = draft.steps.flatMap((step) => [step, { direction: '-' as const }]);
    } else {
      draft.steps = draft.steps.filter((_, i) => i % 2 === 0);
    }
    draft.stepsPerBeat = next;
  }

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
        // Legacy data can hold a part-beat, which +/− (whole beats) can never
        // fix — pad up to a complete beat so the pattern stays saveable.
        while (draft.steps.length % patternStepsPerBeat(draft) !== 0) draft.steps.push({ direction: '-' });
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
          <span>Feel</span>
          <div class="mode-toggle subdivision-toggle" role="tablist">
            <button data-spb="2" aria-pressed="false">♪ Eighths<span>1 &amp; 2 &amp;</span></button>
            <button data-spb="4" aria-pressed="false">♬ Sixteenths<span>1 e &amp; a</span></button>
          </div>
        </div>

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
      const stepsPerBeat = spb();
      // Group chips a beat at a time so a 16-chip bar still reads as 4 beats
      let group: HTMLElement | null = null;
      draft.steps.forEach((step, i) => {
        if (i % stepsPerBeat === 0) {
          group = document.createElement('div');
          group.className = 'chip-beat';
          chipsEl.appendChild(group);
        }
        const chip = document.createElement('button');
        const cls = step.direction === '-' ? 'none' : step.direction;
        chip.className = `step-chip dir-${cls}`;
        chip.innerHTML = `${step.direction === '-' ? '−' : step.direction}<small>${stepLabel(i, stepsPerBeat)}</small>`;
        chip.addEventListener('click', () => {
          draft.steps[i] = { direction: CYCLE[step.direction] };
          renderChips();
          refreshPreview();
        });
        group!.appendChild(chip);
      });
    }

    function renderSubdivision(): void {
      root.querySelectorAll<HTMLButtonElement>('.subdivision-toggle button').forEach((btn) => {
        btn.setAttribute('aria-pressed', String(Number(btn.dataset.spb) === spb()));
      });
    }

    root.querySelectorAll<HTMLButtonElement>('.subdivision-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        setStepsPerBeat(Number(btn.dataset.spb) as 2 | 4);
        renderSubdivision();
        renderChips();
        refreshPreview();
      });
    });

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

    // +/− work in whole beats, so they add or drop a full beat's worth of steps
    (root.querySelector('.add-step') as HTMLElement).addEventListener('click', () => {
      if (beats() >= MAX_BEATS) return;
      const stepsPerBeat = spb();
      draft.steps.push({ direction: 'D' });
      for (let i = 1; i < stepsPerBeat; i++) draft.steps.push({ direction: '-' });
      renderChips();
      refreshPreview();
    });

    (root.querySelector('.remove-step') as HTMLElement).addEventListener('click', () => {
      if (beats() <= MIN_BEATS) return;
      draft.steps.splice(-spb(), spb());
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
        if (!audioCtx) {
          audioCtx = new AudioContext();
          const limiter = createStrumLimiter(audioCtx);
          limiter.connect(audioCtx.destination);
          audioOut = limiter;
        }
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const buffers = await loadSampler(audioCtx);

        const stepDur = 60 / PREVIEW_BPM / spb();
        const t0 = audioCtx.currentTime + 0.1;
        draft.steps.forEach((step, i) => {
          if (step.direction === '-') return;
          strumChord(audioCtx!, audioOut!, buffers, PREVIEW_CHORD, {
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
      if (draft.steps.length % spb() !== 0 || beats() < MIN_BEATS || beats() > MAX_BEATS) {
        errorEl.textContent = `Patterns must contain ${MIN_BEATS}–${MAX_BEATS} complete beats.`;
        return;
      }

      await repo.savePattern(draft);
      navigate('/editor');
    });

    renderSubdivision();
    renderChips();
    renderToggles();
    refreshPreview();
  }

  return () => {
    disposed = true;
    void audioCtx?.close();
  };
}
