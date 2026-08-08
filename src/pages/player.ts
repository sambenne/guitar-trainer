import './player.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import { getSettings } from '../app/settings';
import { compileTimeline, nextChordChange, type Timeline } from '../audio/timeline';
import { createPlayer, type Player } from '../audio/scheduler';
import { createChordDiagram } from '../components/chord-diagram';
import { createStrumDisplay } from '../components/strum-display';
import { getChordMap, getPatternMap, getSong } from '../storage/repo';
import type { Chord, StrummingPattern } from '../types/models';

const NEXT_CHORD_PULSE_BEATS = 2;

export function renderPlayer(root: HTMLElement, ctx: RouteContext): () => void {
  let disposed = false;
  let raf = 0;
  let player: Player | null = null;
  let wakeLock: WakeLockSentinel | null = null;

  root.innerHTML = `<div class="player"><p class="muted" style="padding:16px">Loading…</p></div>`;

  async function acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch {
      /* not critical — e.g. battery saver mode */
    }
  }

  function releaseWakeLock(): void {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  async function onVisibility(): Promise<void> {
    if (document.visibilityState === 'visible' && player) {
      const { state } = player.getPosition();
      if (state === 'playing' || state === 'countIn') await acquireWakeLock();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  void setup();

  async function setup(): Promise<void> {
    const song = await getSong(ctx.params.id);
    const chords = await getChordMap();
    const patterns = await getPatternMap();
    if (disposed) return;

    if (!song) {
      root.innerHTML = `<div class="page"><p class="muted">Song not found.</p></div>`;
      return;
    }

    let timeline: Timeline;
    try {
      timeline = compileTimeline(song, patterns);
    } catch (err) {
      root.innerHTML = `<div class="page"><p class="muted">This song references a missing pattern and can't be played.</p></div>`;
      console.error(err);
      return;
    }
    if (timeline.steps.length === 0) {
      root.innerHTML = `<div class="page"><p class="muted">This song has no bars yet.</p></div>`;
      return;
    }

    const settings = getSettings();
    player = createPlayer(timeline, song.bpm);
    player.setMetronome(settings.metronomeEnabled, settings.metronomeVolume);

    // ---- DOM ----
    root.innerHTML = `
      <div class="player">
        <div class="player-header">
          <button class="ghost back-btn" aria-label="Back">←</button>
          <div class="titles">
            <div class="song-title"></div>
            <div class="song-artist"></div>
          </div>
          <div class="bpm-control">
            <button class="bpm-down" aria-label="Slower">−</button>
            <div class="bpm-value"><strong></strong><span>BPM</span></div>
            <button class="bpm-up" aria-label="Faster">+</button>
          </div>
          <button class="metro-btn" aria-label="Metronome" aria-pressed="false">🔊</button>
        </div>

        <div class="player-panels">
          <div class="panel chord-panel">
            <div class="panel-label">CHORD</div>
            <div class="chord-name">–</div>
          </div>
          <div class="panel strum-panel">
            <div class="panel-label">STRUMMING</div>
          </div>
        </div>

        <div class="next-chord"><span class="muted">Next:</span> <strong>–</strong> <span class="beats-left muted"></span></div>

        <div class="transport">
          <select class="loop-select" aria-label="Loop"></select>
          <button class="restart-btn" aria-label="Restart">⏮</button>
          <button class="play-btn primary" aria-label="Play">▶</button>
        </div>
      </div>
      <div class="count-in-overlay"><div class="count"></div></div>
    `;

    const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    $('.song-title').textContent = song.title;
    $('.song-artist').textContent = song.artist ?? '';

    const bpmValue = $('.bpm-value strong');
    const chordName = $('.chord-name');
    const nextChordEl = $('.next-chord');
    const nextChordName = nextChordEl.querySelector('strong') as HTMLElement;
    const beatsLeftEl = nextChordEl.querySelector('.beats-left') as HTMLElement;
    const playBtn = $<HTMLButtonElement>('.play-btn');
    const metroBtn = $<HTMLButtonElement>('.metro-btn');
    const loopSelect = $<HTMLSelectElement>('.loop-select');
    const overlay = $('.count-in-overlay');
    const countEl = overlay.querySelector('.count') as HTMLElement;

    const chordDiagram = createChordDiagram();
    $('.chord-panel').appendChild(chordDiagram.svg);
    const strumDisplay = createStrumDisplay();
    $('.strum-panel').appendChild(strumDisplay.svg);

    // Loop selector: full song (default), each section, or play through once
    loopSelect.innerHTML =
      `<option value="full">Loop: Full song</option>` +
      timeline.sections.map((s, i) => `<option value="sec-${i}">Loop: ${s.name}</option>`).join('') +
      `<option value="none">Play once</option>`;

    bpmValue.textContent = String(player.getBpm());
    metroBtn.setAttribute('aria-pressed', String(settings.metronomeEnabled));

    // ---- State applied per-frame ----
    let shownChordId: string | null = null;
    let shownPatternId: string | null = null;
    const lowTop = settings.stringOrientation === 'lowTop';

    function showStep(stepFloat: number): void {
      const idx = Math.min(Math.floor(stepFloat), timeline.steps.length - 1);
      const step = timeline.steps[idx];

      if (step.chordId !== shownChordId) {
        const chord: Chord | undefined = chords.get(step.chordId);
        chordName.textContent = chord?.name ?? '?';
        if (chord) chordDiagram.render(chord);
        shownChordId = step.chordId;
      }
      if (step.patternId !== shownPatternId) {
        const pattern: StrummingPattern | undefined = patterns.get(step.patternId);
        if (pattern) strumDisplay.setPattern(pattern, lowTop);
        shownPatternId = step.patternId;
      }

      strumDisplay.update(step.stepIdx + (stepFloat - idx));

      // Next chord + pulse
      const changeIdx = nextChordChange(timeline, idx);
      if (changeIdx === null) {
        nextChordName.textContent = '–';
        beatsLeftEl.textContent = '';
        nextChordEl.classList.remove('pulse');
      } else {
        const changeStep = timeline.steps[changeIdx];
        nextChordName.textContent = chords.get(changeStep.chordId)?.name ?? '?';
        const currentBeat = step.atBeat + (stepFloat - idx) * step.durationBeats;
        const beatsAway = changeStep.atBeat - currentBeat;
        nextChordEl.classList.toggle('pulse', beatsAway <= NEXT_CHORD_PULSE_BEATS);
        const n = Math.max(1, Math.ceil(beatsAway));
        beatsLeftEl.textContent = beatsAway <= NEXT_CHORD_PULSE_BEATS ? `${n} beat${n === 1 ? '' : 's'}` : '';
      }
    }

    // Initial static view: first step of the song
    showStep(0);
    strumDisplay.update(null);

    // ---- rAF loop ----
    let lastCountBeat = 0;
    function frame(): void {
      if (disposed || !player) return;
      const pos = player.getPosition();

      if (pos.state === 'countIn' && pos.countInBeat !== null) {
        overlay.classList.add('visible');
        if (pos.countInBeat !== lastCountBeat) {
          countEl.textContent = String(pos.countInBeat);
          lastCountBeat = pos.countInBeat;
        }
      } else {
        overlay.classList.remove('visible');
        lastCountBeat = 0;
      }

      if (pos.state === 'playing' && pos.stepFloat !== null) {
        showStep(pos.stepFloat);
      } else if (pos.state === 'ended') {
        playBtn.textContent = '▶';
        strumDisplay.update(null);
        releaseWakeLock();
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ---- Controls ----
    $('.back-btn').addEventListener('click', () => navigate('/library'));

    playBtn.addEventListener('click', async () => {
      if (!player) return;
      const { state } = player.getPosition();
      if (state === 'playing' || state === 'countIn') {
        await player.pause();
        playBtn.textContent = '▶';
        releaseWakeLock();
      } else {
        await player.play();
        playBtn.textContent = '⏸';
        await acquireWakeLock();
      }
    });

    $('.restart-btn').addEventListener('click', async () => {
      if (!player) return;
      const wasActive = player.getPosition().state !== 'stopped';
      await player.stop();
      shownChordId = null;
      shownPatternId = null;
      showStep(player.getLoop()?.start ?? 0);
      strumDisplay.update(null);
      if (wasActive) {
        await player.play();
        playBtn.textContent = '⏸';
      }
    });

    function changeBpm(delta: number): void {
      if (!player) return;
      player.setBpm(player.getBpm() + delta);
      bpmValue.textContent = String(player.getBpm());
    }
    $('.bpm-down').addEventListener('click', () => changeBpm(-5));
    $('.bpm-up').addEventListener('click', () => changeBpm(5));

    metroBtn.addEventListener('click', () => {
      const enabled = metroBtn.getAttribute('aria-pressed') !== 'true';
      metroBtn.setAttribute('aria-pressed', String(enabled));
      player?.setMetronome(enabled, getSettings().metronomeVolume);
    });

    loopSelect.addEventListener('change', () => {
      if (!player) return;
      const v = loopSelect.value;
      if (v === 'full') player.setLoop({ start: 0, end: timeline.steps.length });
      else if (v === 'none') player.setLoop(null);
      else {
        const sec = timeline.sections[Number(v.slice(4))];
        if (sec) player.setLoop({ start: sec.stepStart, end: sec.stepEnd });
      }
    });
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    releaseWakeLock();
    void player?.dispose();
  };
}
