import './editor.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import * as repo from '../storage/repo';
import type { Chord, Song, SongSection, StrummingPattern } from '../types/models';

export function renderSongEditor(root: HTMLElement, ctx: RouteContext): () => void {
  let disposed = false;

  const [id, query] = (ctx.params.id ?? '').split('?');
  const duplicate = query?.includes('duplicate=1') ?? false;

  let draft: Song = {
    id: crypto.randomUUID(),
    title: '',
    artist: '',
    bpm: 90,
    timeSignature: { beats: 4, noteValue: 4 },
    sections: [
      {
        id: crypto.randomUUID(),
        name: 'Verse',
        repeat: 1,
        bars: [],
      },
    ],
  };
  let isNew = true;
  let chords: Chord[] = [];
  let patterns: StrummingPattern[] = [];

  void (async () => {
    [chords, patterns] = await Promise.all([repo.listChords(), repo.listPatterns()]);
    if (id) {
      const existing = await repo.getSong(id);
      if (existing) {
        if (duplicate || repo.isPresetSong(id)) {
          draft = { ...structuredClone(existing), id: crypto.randomUUID(), title: `${existing.title} (copy)` };
        } else {
          draft = structuredClone(existing);
          isNew = false;
        }
      }
    }
    if (!disposed) build();
  })();

  function defaultBar(): { chordId: string; patternId: string } {
    const compatiblePattern = patterns.find((pattern) => pattern.steps.length === draft.timeSignature.beats * 2);
    return { chordId: chords[0]?.id ?? '', patternId: compatiblePattern?.id ?? '' };
  }

  function build(): void {
    root.innerHTML = `
      <div class="page">
        <div class="editor-head">
          <button class="ghost cancel-btn">Cancel</button>
          <h1>${isNew ? 'New Song' : 'Edit Song'}</h1>
          <button class="primary save-btn">Save</button>
        </div>

        <label class="field">
          <span>Title</span>
          <input class="title-input" placeholder="Song title" maxlength="80" />
        </label>

        <label class="field">
          <span>Artist (optional)</span>
          <input class="artist-input" placeholder="Artist" maxlength="80" />
        </label>

        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div class="field">
            <span>BPM</span>
            <div class="stepper">
              <button class="bpm-down">−</button>
              <span class="stepper-value bpm-value"></span>
              <button class="bpm-up">+</button>
            </div>
          </div>
          <div class="field">
            <span>Beats per bar</span>
            <div class="stepper">
              <button class="beats-down">−</button>
              <span class="stepper-value beats-value"></span>
              <button class="beats-up">+</button>
            </div>
          </div>
        </div>

        <div class="sections"></div>
        <button class="add-section" style="width:100%">+ Add Section</button>

        <p class="editor-error"></p>
      </div>
    `;

    const titleInput = root.querySelector('.title-input') as HTMLInputElement;
    const artistInput = root.querySelector('.artist-input') as HTMLInputElement;
    titleInput.value = draft.title;
    artistInput.value = draft.artist ?? '';
    titleInput.addEventListener('input', () => (draft.title = titleInput.value));
    artistInput.addEventListener('input', () => (draft.artist = artistInput.value));

    const bpmValue = root.querySelector('.bpm-value') as HTMLElement;
    const beatsValue = root.querySelector('.beats-value') as HTMLElement;
    const sectionsEl = root.querySelector('.sections') as HTMLElement;
    const errorEl = root.querySelector('.editor-error') as HTMLElement;

    function syncSteppers(): void {
      bpmValue.textContent = String(draft.bpm);
      beatsValue.textContent = String(draft.timeSignature.beats);
    }
    (root.querySelector('.bpm-down') as HTMLElement).addEventListener('click', () => {
      draft.bpm = Math.max(20, draft.bpm - 5);
      syncSteppers();
    });
    (root.querySelector('.bpm-up') as HTMLElement).addEventListener('click', () => {
      draft.bpm = Math.min(300, draft.bpm + 5);
      syncSteppers();
    });
    (root.querySelector('.beats-down') as HTMLElement).addEventListener('click', () => {
      draft.timeSignature.beats = Math.max(2, draft.timeSignature.beats - 1);
      syncSteppers();
      renderSections();
    });
    (root.querySelector('.beats-up') as HTMLElement).addEventListener('click', () => {
      draft.timeSignature.beats = Math.min(12, draft.timeSignature.beats + 1);
      syncSteppers();
      renderSections();
    });
    syncSteppers();

    function populateChordOptions(select: HTMLSelectElement, selected: string): void {
      for (const chord of chords) {
        const option = document.createElement('option');
        option.value = chord.id;
        option.textContent = chord.name;
        option.selected = chord.id === selected;
        select.appendChild(option);
      }
    }
    function populatePatternOptions(select: HTMLSelectElement, selected: string): void {
      const requiredSteps = draft.timeSignature.beats * 2;
      const compatible = patterns.filter((pattern) => pattern.steps.length === requiredSteps);
      const selectedPattern = patterns.find((pattern) => pattern.id === selected);

      if (selectedPattern && selectedPattern.steps.length !== requiredSteps) {
        const warning = document.createElement('option');
        warning.value = selectedPattern.id;
        warning.textContent = `Warning: ${selectedPattern.name} (${selectedPattern.steps.length / 2} beats)`;
        warning.selected = true;
        warning.disabled = true;
        select.appendChild(warning);
      }

      if (compatible.length === 0) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = `Create a ${draft.timeSignature.beats}-beat pattern first`;
        empty.selected = !selectedPattern;
        empty.disabled = true;
        select.appendChild(empty);
        return;
      }

      for (const pattern of compatible) {
        const option = document.createElement('option');
        option.value = pattern.id;
        option.textContent = pattern.name;
        option.selected = pattern.id === selected;
        select.appendChild(option);
      }
    }

    function renderSections(): void {
      sectionsEl.innerHTML = '';
      draft.sections.forEach((section, si) => {
        const card = document.createElement('div');
        card.className = 'card section-card';
        card.innerHTML = `
          <div class="section-head">
            <input class="section-name" placeholder="Section name" maxlength="40" />
            <div class="stepper" title="Repeat count">
              <button class="rep-down">−</button>
              <span class="stepper-value">×${section.repeat}</span>
              <button class="rep-up">+</button>
            </div>
            <button class="ghost danger del-section" aria-label="Delete section">✕</button>
          </div>
          <div class="bars"></div>
          <div class="add-row"><button class="add-bar" style="flex:1">+ Add Bar</button></div>
        `;

        const nameInput = card.querySelector('.section-name') as HTMLInputElement;
        nameInput.value = section.name;
        nameInput.addEventListener('input', () => (section.name = nameInput.value));

        (card.querySelector('.rep-down') as HTMLElement).addEventListener('click', () => {
          section.repeat = Math.max(1, section.repeat - 1);
          renderSections();
        });
        (card.querySelector('.rep-up') as HTMLElement).addEventListener('click', () => {
          section.repeat = Math.min(16, section.repeat + 1);
          renderSections();
        });
        (card.querySelector('.del-section') as HTMLElement).addEventListener('click', () => {
          if (draft.sections.length === 1) {
            errorEl.textContent = 'A song needs at least one section.';
            return;
          }
          if (!confirm(`Delete section "${section.name}"?`)) return;
          draft.sections.splice(si, 1);
          renderSections();
        });

        const barsEl = card.querySelector('.bars') as HTMLElement;
        section.bars.forEach((bar, bi) => {
          const row = document.createElement('div');
          row.className = 'bar-row';
          row.innerHTML = `
            <span class="bar-num">${bi + 1}</span>
            <select class="bar-chord" aria-label="Chord"></select>
            <select class="bar-pattern" aria-label="Pattern"></select>
            <div class="bar-actions">
              <button class="bar-up" aria-label="Move up" ${bi === 0 ? 'disabled' : ''}>↑</button>
              <button class="bar-down" aria-label="Move down" ${bi === section.bars.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="bar-dup" aria-label="Duplicate">⧉</button>
              <button class="bar-del danger" aria-label="Delete">✕</button>
            </div>
          `;
          const chordSelect = row.querySelector('.bar-chord') as HTMLSelectElement;
          const patternSelect = row.querySelector('.bar-pattern') as HTMLSelectElement;
          populateChordOptions(chordSelect, bar.chordId);
          populatePatternOptions(patternSelect, bar.patternId);

          chordSelect.addEventListener('change', (e) => {
            bar.chordId = (e.target as HTMLSelectElement).value;
          });
          patternSelect.addEventListener('change', (e) => {
            bar.patternId = (e.target as HTMLSelectElement).value;
          });
          (row.querySelector('.bar-up') as HTMLElement).addEventListener('click', () => {
            [section.bars[bi - 1], section.bars[bi]] = [section.bars[bi], section.bars[bi - 1]];
            renderSections();
          });
          (row.querySelector('.bar-down') as HTMLElement).addEventListener('click', () => {
            [section.bars[bi + 1], section.bars[bi]] = [section.bars[bi], section.bars[bi + 1]];
            renderSections();
          });
          (row.querySelector('.bar-dup') as HTMLElement).addEventListener('click', () => {
            section.bars.splice(bi + 1, 0, { ...bar });
            renderSections();
          });
          (row.querySelector('.bar-del') as HTMLElement).addEventListener('click', () => {
            section.bars.splice(bi, 1);
            renderSections();
          });
          barsEl.appendChild(row);
        });

        (card.querySelector('.add-bar') as HTMLElement).addEventListener('click', () => {
          section.bars.push(section.bars.length > 0 ? { ...section.bars[section.bars.length - 1] } : defaultBar());
          renderSections();
        });

        sectionsEl.appendChild(card);
      });
    }

    (root.querySelector('.add-section') as HTMLElement).addEventListener('click', () => {
      const next: SongSection = { id: crypto.randomUUID(), name: `Section ${draft.sections.length + 1}`, repeat: 1, bars: [] };
      draft.sections.push(next);
      renderSections();
    });

    (root.querySelector('.cancel-btn') as HTMLElement).addEventListener('click', () => navigate('/editor'));
    (root.querySelector('.save-btn') as HTMLElement).addEventListener('click', async () => {
      if (!draft.title.trim()) {
        errorEl.textContent = 'Give the song a title.';
        return;
      }
      if (!draft.sections.some((s) => s.bars.length > 0)) {
        errorEl.textContent = 'Add at least one bar.';
        return;
      }
      draft.title = draft.title.trim();
      draft.artist = draft.artist?.trim() || undefined;
      draft.sections.forEach((s) => (s.name = s.name.trim() || 'Section'));
      const requiredSteps = draft.timeSignature.beats * 2;
      const patternMap = new Map(patterns.map((pattern) => [pattern.id, pattern]));
      const hasIncompatiblePattern = draft.sections.some((section) =>
        section.bars.some((bar) => patternMap.get(bar.patternId)?.steps.length !== requiredSteps),
      );
      if (hasIncompatiblePattern) {
        errorEl.textContent =
          `Every bar needs a ${draft.timeSignature.beats}-beat pattern with ${requiredSteps} eighth-note steps.`;
        return;
      }

      await repo.saveSong(draft);
      navigate('/library');
    });

    renderSections();
  }

  return () => {
    disposed = true;
  };
}
