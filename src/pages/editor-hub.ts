import './editor.css';
import { navigate } from '../app/router';
import * as repo from '../storage/repo';
import { buildSongExport } from '../storage/transfer';
import { PRESET_CHORDS } from '../data/chords';
import { PRESET_PATTERNS } from '../data/patterns';
import type { Chord, Song, StrummingPattern } from '../types/models';

interface Row {
  id: string;
  label: string;
  sub?: string;
  preset: boolean;
  shareable?: boolean;
}

export function renderEditorHub(root: HTMLElement): () => void {
  let disposed = false;

  root.innerHTML = `
    <div class="page">
      <h1 class="page-title">Editor</h1>
      <div class="hub-groups"></div>
    </div>
  `;
  const groupsEl = root.querySelector('.hub-groups') as HTMLElement;

  async function load(): Promise<void> {
    const [userSongs, userChords, userPatterns] = await Promise.all([
      repo.getUserSongs(),
      repo.getUserChords(),
      repo.getUserPatterns(),
    ]);
    if (disposed) return;

    groupsEl.innerHTML = '';
    groupsEl.append(
      group(
        'Songs',
        'song-editor',
        [
          ...userSongs.map((s: Song) => ({ id: s.id, label: s.title, sub: s.artist, preset: false, shareable: true })),
          ...(await repo.getPresetSongs()).map((s) => ({ id: s.id, label: s.title, sub: s.artist, preset: true })),
        ],
        deleteSong,
      ),
      group(
        'Chords',
        'chord-editor',
        [
          ...userChords.map((c: Chord) => ({ id: c.id, label: c.name, preset: false })),
          ...PRESET_CHORD_ROWS,
        ],
        deleteChord,
      ),
      group(
        'Strumming patterns',
        'pattern-editor',
        [
          ...userPatterns.map((p: StrummingPattern) => ({ id: p.id, label: p.name, preset: false })),
          ...PRESET_PATTERN_ROWS,
        ],
        deletePattern,
      ),
    );
  }

  function group(title: string, route: string, rows: Row[], onDelete: (id: string, label: string) => void): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card hub-group';
    card.innerHTML = `
      <div class="hub-group-head">
        <h2>${title}</h2>
        <button class="primary new-btn">+ New</button>
      </div>
      <div class="hub-rows"></div>
    `;
    (card.querySelector('.new-btn') as HTMLElement).addEventListener('click', () => navigate(`/${route}`));

    const rowsEl = card.querySelector('.hub-rows') as HTMLElement;
    if (rows.length === 0) {
      rowsEl.innerHTML = `<p class="muted" style="margin:8px 0">Nothing yet.</p>`;
    }
    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'hub-row';
      el.innerHTML = `
        <span class="hub-row-label"></span>
        <span class="hub-row-sub muted"></span>
        ${
          row.preset
            ? `<span class="badge">preset</span><button class="ghost dup-btn">Duplicate</button>`
            : `${row.shareable ? '<button class="ghost share-btn">Share</button>' : ''}<button class="ghost edit-btn">Edit</button><button class="ghost danger del-btn">Delete</button>`
        }
      `;
      (el.querySelector('.hub-row-label') as HTMLElement).textContent = row.label;
      (el.querySelector('.hub-row-sub') as HTMLElement).textContent = row.sub ?? '';
      el.querySelector('.share-btn')?.addEventListener('click', () => void shareSong(row.id, row.label));
      el.querySelector('.edit-btn')?.addEventListener('click', () => navigate(`/${route}/${encodeURIComponent(row.id)}`));
      el.querySelector('.dup-btn')?.addEventListener('click', () => navigate(`/${route}/${encodeURIComponent(row.id)}?duplicate=1`));
      el.querySelector('.del-btn')?.addEventListener('click', () => onDelete(row.id, row.label));
      rowsEl.appendChild(el);
    }
    return card;
  }

  async function shareSong(id: string, label: string): Promise<void> {
    const song = await repo.getSong(id);
    if (!song) return;
    const [chordMap, patternMap] = await Promise.all([repo.getChordMap(), repo.getPatternMap()]);
    const file = buildSongExport(song, chordMap, patternMap, repo.isPresetChord, repo.isPresetPattern);
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.guitar.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteSong(id: string, label: string): Promise<void> {
    if (!confirm(`Delete song "${label}"?`)) return;
    await repo.deleteSong(id);
    void load();
  }

  async function deleteChord(id: string, label: string): Promise<void> {
    const usedBy = await repo.chordUsage(id);
    if (usedBy.length > 0) {
      alert(`Can't delete "${label}" — it's used by: ${usedBy.join(', ')}`);
      return;
    }
    if (!confirm(`Delete chord "${label}"?`)) return;
    await repo.deleteChord(id);
    void load();
  }

  async function deletePattern(id: string, label: string): Promise<void> {
    const usedBy = await repo.patternUsage(id);
    if (usedBy.length > 0) {
      alert(`Can't delete "${label}" — it's used by: ${usedBy.join(', ')}`);
      return;
    }
    if (!confirm(`Delete pattern "${label}"?`)) return;
    await repo.deletePattern(id);
    void load();
  }

  void load();
  return () => {
    disposed = true;
  };
}

const PRESET_CHORD_ROWS: Row[] = PRESET_CHORDS.map((c) => ({ id: c.id, label: c.name, preset: true }));
const PRESET_PATTERN_ROWS: Row[] = PRESET_PATTERNS.map((p) => ({ id: p.id, label: p.name, preset: true }));
