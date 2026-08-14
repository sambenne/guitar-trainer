import './chords.css';
import { createChordDiagram } from '../components/chord-diagram';
import { bestOfSet, createMicDetector, targetMatches, type DetectorFrame, type MicDetector } from '../audio/chord-detector';
import { loadSampler, strumChord } from '../audio/sampler';
import { getSettings, saveSettings } from '../app/settings';
import * as repo from '../storage/repo';
import type { Chord } from '../types/models';

type Mode = 'single' | 'compare' | 'board';

/** Time counts while the page is visible and within this window of a tap. */
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
/** Keep a board chord lit this long after the last detection, so it doesn't flicker. */
const HIGHLIGHT_HOLD_MS = 700;

let lastMode: Mode = 'single';
let lastSingleIdx = 0;
let lastCompare: [number, number] = [0, 1];

export function renderChordsPage(root: HTMLElement): () => void {
  let disposed = false;
  let chords: Chord[] = [];
  let boardIds: string[] = [];
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  // ---- Practice history: count drilling time (visible + recently tapped) ----
  let lastTapMs = 0; // 0 = clock not started; first tap arms it
  let practiceSeconds = 0;

  const onTap = (): void => {
    lastTapMs = Date.now();
  };
  root.addEventListener('click', onTap, true);
  root.addEventListener('change', onTap, true);

  const tickTimer = setInterval(() => {
    if (lastTapMs && document.visibilityState === 'visible' && Date.now() - lastTapMs < ACTIVE_WINDOW_MS) {
      practiceSeconds++;
    }
  }, 1000);

  function flushPractice(): void {
    if (practiceSeconds < 5) return; // ignore stray taps
    const seconds = practiceSeconds;
    practiceSeconds = 0;
    void repo.logPractice({
      songId: 'chord-practice',
      songTitle: 'Chord practice',
      seconds,
      maxBpm: 0,
      maxPct: 0,
      loops: 0,
    });
  }
  const flushTimer = setInterval(flushPractice, 30000);

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
    const label = btn.textContent;
    btn.disabled = true;
    try {
      const { ctx, master, buffers } = await audio();
      strumChord(ctx, master, buffers, chord, { spread: 0.045 }); // slow roll — hear each string
      setTimeout(() => (btn.disabled = false), 400);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Sound unavailable';
      setTimeout(() => {
        btn.textContent = label;
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
        <button data-mode="board" aria-pressed="false">Board</button>
      </div>
      <div class="listen-row">
        <button class="listen-btn" aria-pressed="false">🎤 Listen</button>
        <span class="listen-status muted"></span>
      </div>
      <div class="mode-body"></div>
      <p class="hint muted"></p>
    </div>
  `;

  // ---- Microphone chord detection (processed on-device, never recorded) ----
  const listenBtn = root.querySelector('.listen-btn') as HTMLButtonElement;
  const listenStatus = root.querySelector('.listen-status') as HTMLElement;
  let detector: MicDetector | null = null;

  function currentTargets(): Chord[] {
    if (lastMode === 'compare') return [chords[lastCompare[0]], chords[lastCompare[1]]].filter(Boolean);
    return chords[lastSingleIdx] ? [chords[lastSingleIdx]] : [];
  }

  // Board mode: light up whichever board chord scores best, held briefly so
  // the highlight survives the gap between strums.
  let heardId: string | null = null;
  let heardAtMs = 0;

  function applyBoardFrame(frame: DetectorFrame | null): void {
    const hit = frame ? bestOfSet(boardIds, frame.scores) : null;
    if (hit) {
      heardId = hit.id;
      heardAtMs = Date.now();
    } else if (heardId && Date.now() - heardAtMs > HIGHLIGHT_HOLD_MS) {
      heardId = null;
    }
    root.querySelectorAll<HTMLElement>('.board-cell').forEach((cell) => {
      cell.classList.toggle('heard', cell.dataset.chordId === heardId);
    });
    const name = heardId ? chords.find((c) => c.id === heardId)?.name : null;
    if (name) {
      listenStatus.textContent = `✓ ${name}`;
      listenStatus.classList.add('match');
    } else {
      listenStatus.textContent = frame?.best ? `Heard: ${frame.best.name} (not on the board)` : 'Listening…';
      listenStatus.classList.remove('match');
    }
  }

  function onDetectorFrame(frame: DetectorFrame | null): void {
    if (disposed) return;
    if (lastMode === 'board') {
      applyBoardFrame(frame);
      return;
    }
    root.querySelectorAll('.compare-panel.heard-match').forEach((p) => p.classList.remove('heard-match'));
    if (!frame) {
      listenStatus.textContent = 'Listening…';
      listenStatus.classList.remove('match');
      return;
    }
    const targets = currentTargets();
    const hit = targets.find((t) => targetMatches(t.id, frame.best, frame.scores));
    if (hit) {
      listenStatus.textContent = `✓ ${hit.name}`;
      listenStatus.classList.add('match');
      if (lastMode === 'compare') {
        const side = chords[lastCompare[0]]?.id === hit.id ? 0 : 1;
        root.querySelector(`.compare-panel[data-side="${side}"]`)?.classList.add('heard-match');
      }
    } else {
      listenStatus.textContent = frame.best ? `Heard: ${frame.best.name}` : 'Listening…';
      listenStatus.classList.remove('match');
    }
  }

  async function toggleListen(): Promise<void> {
    if (detector) {
      detector.stop();
      detector = null;
      listenBtn.setAttribute('aria-pressed', 'false');
      listenStatus.textContent = '';
      listenStatus.classList.remove('match');
      return;
    }
    try {
      listenStatus.textContent = 'Starting microphone…';
      detector = await createMicDetector(chords, onDetectorFrame);
      listenBtn.setAttribute('aria-pressed', 'true');
      listenStatus.textContent = 'Listening…';
    } catch (err) {
      console.error(err);
      listenStatus.textContent = 'Microphone unavailable — check permissions.';
    }
  }
  listenBtn.addEventListener('click', () => void toggleListen());

  const body = root.querySelector('.mode-body') as HTMLElement;
  const hint = root.querySelector('.hint') as HTMLElement;

  function setMode(mode: Mode): void {
    lastMode = mode;
    root.querySelectorAll<HTMLButtonElement>('.mode-toggle button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    heardId = null;
    if (mode === 'single') renderSingle();
    else if (mode === 'compare') renderCompare();
    else renderBoard();
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

  function renderBoard(): void {
    body.innerHTML = `
      <div class="board-controls">
        <select class="board-add" aria-label="Add a chord to the board"></select>
        <select class="board-from-song" aria-label="Load the chords of a song"></select>
      </div>
      <div class="chord-board"></div>
    `;
    hint.textContent =
      'Show the chords of the song you’re learning, turn on Listen, and each one lights up as you play it.';

    const addSelect = body.querySelector('.board-add') as HTMLSelectElement;
    addSelect.add(new Option('+ Add chord…', ''));
    chords
      .filter((c) => !boardIds.includes(c.id))
      .forEach((c) => addSelect.add(new Option(c.name, c.id)));
    addSelect.addEventListener('change', () => {
      if (!addSelect.value) return;
      boardIds = [...boardIds, addSelect.value];
      saveSettings({ chordBoardIds: boardIds });
      renderBoard();
    });

    const songSelect = body.querySelector('.board-from-song') as HTMLSelectElement;
    songSelect.add(new Option('Load from song…', ''));
    void (async () => {
      const songs = await repo.getSongs();
      if (disposed) return;
      songs.forEach((s) => songSelect.add(new Option(s.title, s.id)));
      songSelect.addEventListener('change', async () => {
        const song = songs.find((s) => s.id === songSelect.value);
        if (!song) return;
        const ids: string[] = [];
        for (const section of song.sections) {
          for (const bar of section.bars) {
            if (!ids.includes(bar.chordId)) ids.push(bar.chordId);
            if (bar.split && !ids.includes(bar.split.chordId)) ids.push(bar.split.chordId);
          }
        }
        boardIds = ids.filter((id) => chords.some((c) => c.id === id));
        saveSettings({ chordBoardIds: boardIds });
        renderBoard();
      });
    })();

    const board = body.querySelector('.chord-board') as HTMLElement;
    if (boardIds.length === 0) {
      board.innerHTML = `<p class="muted board-empty">Add chords above, or load them from a song.</p>`;
      return;
    }

    for (const id of boardIds) {
      const chord = chords.find((c) => c.id === id);
      if (!chord) continue;
      const cell = document.createElement('div');
      cell.className = 'board-cell card';
      cell.dataset.chordId = id;
      cell.innerHTML = `
        <div class="board-cell-head">
          <span class="board-chord-name"></span>
          <button class="board-remove ghost" aria-label="Remove from board">✕</button>
        </div>
        <button class="board-strum ghost" aria-label="Hear this chord">🔊</button>
      `;
      (cell.querySelector('.board-chord-name') as HTMLElement).textContent = chord.name;
      const diagram = createChordDiagram();
      cell.insertBefore(diagram.svg, cell.querySelector('.board-strum'));
      diagram.render(chord);
      (cell.querySelector('.board-remove') as HTMLElement).addEventListener('click', () => {
        boardIds = boardIds.filter((x) => x !== id);
        saveSettings({ chordBoardIds: boardIds });
        renderBoard();
      });
      const strumBtn = cell.querySelector('.board-strum') as HTMLButtonElement;
      strumBtn.addEventListener('click', () => void playChord(chord, strumBtn));
      board.appendChild(cell);
    }
  }

  void (async () => {
    chords = await repo.listChords();
    if (disposed || chords.length === 0) return;
    boardIds = getSettings().chordBoardIds.filter((id) => chords.some((c) => c.id === id));
    lastSingleIdx = Math.min(lastSingleIdx, chords.length - 1);
    lastCompare = [Math.min(lastCompare[0], chords.length - 1), Math.min(lastCompare[1], chords.length - 1)];
    setMode(lastMode);
  })();

  return () => {
    disposed = true;
    detector?.stop();
    clearInterval(tickTimer);
    clearInterval(flushTimer);
    root.removeEventListener('click', onTap, true);
    root.removeEventListener('change', onTap, true);
    flushPractice();
    void ctx?.close();
  };
}
