import './player.css';
import type { RouteContext } from '../app/router';
import { navigate } from '../app/router';
import { getSettings } from '../app/settings';
import { compileTimeline, nextChordChangeForPlayback, type Timeline } from '../audio/timeline';
import { createPlayer, type Player } from '../audio/scheduler';
import { loadSampler, strumChord } from '../audio/sampler';
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
  let practiceCtx: AudioContext | null = null;

  async function practiceAudio(): Promise<{ ctx: AudioContext; buffers: Map<number, AudioBuffer> }> {
    if (!practiceCtx) practiceCtx = new AudioContext();
    if (practiceCtx.state === 'suspended') await practiceCtx.resume();
    return { ctx: practiceCtx, buffers: await loadSampler(practiceCtx) };
  }

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
      root.innerHTML = `<div class="page"><p class="muted">This song has a missing or incompatible strumming pattern. Edit the song and choose a pattern that matches its beats per bar.</p></div>`;
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
            <div class="panel-label-row">
              <div class="panel-label">CHORD</div>
              <div class="practice-controls">
                <button class="pc-btn pc-prev" aria-label="Previous chord">‹</button>
                <button class="pc-btn pc-next" aria-label="Next chord">›</button>
                <button class="pc-btn pc-split" aria-label="Show chord change" aria-pressed="false">⇄</button>
                <button class="pc-btn pc-sound" aria-label="Play chord sound">🔊</button>
              </div>
            </div>
            <div class="chord-single-view">
              <div class="chord-name">–</div>
            </div>
            <div class="chord-split-view" hidden>
              <div class="split-half" data-side="0"><div class="split-name"></div></div>
              <div class="split-arrow">→</div>
              <div class="split-half" data-side="1"><div class="split-name"></div></div>
            </div>
          </div>
          <div class="panel strum-panel">
            <div class="panel-label-row">
              <div class="panel-label">STRUMMING</div>
              <div class="practice-controls">
                <button class="pc-btn strum-preview" aria-label="Preview strumming">▶</button>
              </div>
            </div>
          </div>
        </div>

        <div class="next-chord"><span class="muted">Next:</span> <strong>–</strong> <span class="beats-left muted"></span></div>

        <div class="transport">
          <div class="capo-control" title="Capo fret">
            <button class="capo-down" aria-label="Capo down">−</button>
            <div class="capo-value"><strong></strong><span>CAPO</span></div>
            <button class="capo-up" aria-label="Capo up">+</button>
          </div>
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
    $('.chord-single-view').appendChild(chordDiagram.svg);
    const strumDisplay = createStrumDisplay();
    $('.strum-panel').appendChild(strumDisplay.svg);

    // Split-view diagrams (practice: see a chord change side by side)
    const splitDiagrams = [createChordDiagram(), createChordDiagram()];
    root.querySelectorAll<HTMLElement>('.split-half').forEach((half, i) => half.appendChild(splitDiagrams[i].svg));

    // Loop selector: full song (default), each section, or play through once
    loopSelect.replaceChildren();
    loopSelect.add(new Option('Loop: Full song', 'full'));
    timeline.sections.forEach((section, i) => loopSelect.add(new Option(`Loop: ${section.name}`, `sec-${i}`)));
    loopSelect.add(new Option('Play once', 'none'));

    bpmValue.textContent = String(player.getBpm());
    metroBtn.setAttribute('aria-pressed', String(settings.metronomeEnabled));

    // Capo: shapes stay the same, practice sounds ring this many semitones higher
    let capo = song.capo ?? 0;
    const capoValue = $('.capo-value strong');
    function syncCapo(): void {
      capoValue.textContent = capo === 0 ? '–' : String(capo);
    }
    $('.capo-down').addEventListener('click', () => {
      capo = Math.max(0, capo - 1);
      syncCapo();
    });
    $('.capo-up').addEventListener('click', () => {
      capo = Math.min(11, capo + 1);
      syncCapo();
    });
    syncCapo();

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
      const change = nextChordChangeForPlayback(timeline, idx, player?.getLoop() ?? null);
      if (change === null) {
        nextChordName.textContent = '–';
        beatsLeftEl.textContent = '';
        nextChordEl.classList.remove('pulse');
      } else {
        const changeStep = timeline.steps[change.index];
        nextChordName.textContent = chords.get(changeStep.chordId)?.name ?? '?';
        const elapsedBeats = (stepFloat - idx) * step.durationBeats;
        const beatsAway = change.beatsFromStepStart - elapsedBeats;
        nextChordEl.classList.toggle('pulse', beatsAway <= NEXT_CHORD_PULSE_BEATS);
        const n = Math.max(1, Math.ceil(beatsAway));
        beatsLeftEl.textContent = beatsAway <= NEXT_CHORD_PULSE_BEATS ? `${n} beat${n === 1 ? '' : 's'}` : '';
      }
    }

    // ---- Practice mode (while not playing): cycle the song's chords,
    // view its chord changes side by side, and hear chord/pattern sounds ----
    const songChordIds: string[] = [];
    for (const step of timeline.steps) {
      if (!songChordIds.includes(step.chordId)) songChordIds.push(step.chordId);
    }
    const songTransitions: [string, string][] = [];
    for (let i = 1; i < timeline.steps.length; i++) {
      const a = timeline.steps[i - 1].chordId;
      const b = timeline.steps[i].chordId;
      if (a !== b && !songTransitions.some((t) => t[0] === a && t[1] === b)) songTransitions.push([a, b]);
    }

    let practiceIdx = 0;
    let transitionIdx = 0;
    let splitMode = false;

    const singleView = $('.chord-single-view');
    const splitView = $('.chord-split-view');
    const splitNames = [...root.querySelectorAll<HTMLElement>('.split-name')];
    const splitBtn = $<HTMLButtonElement>('.pc-split');
    const soundBtn = $<HTMLButtonElement>('.pc-sound');
    const previewBtn = $<HTMLButtonElement>('.strum-preview');

    function displayedChordId(): string {
      return splitMode ? songTransitions[transitionIdx]?.[0] ?? songChordIds[practiceIdx] : songChordIds[practiceIdx];
    }

    function renderPractice(): void {
      if (splitMode && songTransitions.length > 0) {
        singleView.style.display = 'none';
        splitView.hidden = false;
        const [a, b] = songTransitions[transitionIdx];
        [a, b].forEach((id, i) => {
          const chord = chords.get(id);
          splitNames[i].textContent = chord?.name ?? '?';
          if (chord) splitDiagrams[i].render(chord);
        });
      } else {
        splitView.hidden = true;
        singleView.style.display = '';
        const chord = chords.get(songChordIds[practiceIdx]);
        chordName.textContent = chord?.name ?? '?';
        if (chord) chordDiagram.render(chord);
        shownChordId = null; // force live view to re-render on next play
      }
    }

    function cyclePractice(delta: number): void {
      if (splitMode && songTransitions.length > 0) {
        transitionIdx = (transitionIdx + delta + songTransitions.length) % songTransitions.length;
      } else {
        practiceIdx = (practiceIdx + delta + songChordIds.length) % songChordIds.length;
      }
      renderPractice();
    }

    $('.pc-prev').addEventListener('click', () => cyclePractice(-1));
    $('.pc-next').addEventListener('click', () => cyclePractice(1));

    splitBtn.addEventListener('click', () => {
      splitMode = !splitMode && songTransitions.length > 0;
      splitBtn.setAttribute('aria-pressed', String(splitMode));
      if (splitMode) {
        // start from the transition leaving the currently shown chord, if any
        const from = songChordIds[practiceIdx];
        const idx = songTransitions.findIndex((t) => t[0] === from);
        if (idx >= 0) transitionIdx = idx;
      }
      renderPractice();
    });

    soundBtn.addEventListener('click', async () => {
      soundBtn.disabled = true;
      try {
        const { ctx, buffers } = await practiceAudio();
        if (splitMode && songTransitions.length > 0) {
          const [a, b] = songTransitions[transitionIdx];
          const chordA = chords.get(a);
          const chordB = chords.get(b);
          if (chordA) strumChord(ctx, ctx.destination, buffers, chordA, { spread: 0.045, capo });
          if (chordB) strumChord(ctx, ctx.destination, buffers, chordB, { when: ctx.currentTime + 1.1, spread: 0.045, capo });
        } else {
          const chord = chords.get(displayedChordId());
          if (chord) strumChord(ctx, ctx.destination, buffers, chord, { spread: 0.045, capo });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(() => (soundBtn.disabled = false), 400);
      }
    });

    let previewing = false;
    previewBtn.addEventListener('click', async () => {
      if (previewing || !player) return;
      previewing = true;
      previewBtn.disabled = true;
      try {
        const pattern = shownPatternId ? patterns.get(shownPatternId) : null;
        const chord = chords.get(displayedChordId());
        if (!pattern || !chord) return;
        const { ctx, buffers } = await practiceAudio();
        const stepDur = (60 / player.getBpm()) * (timeline.beatsPerBar / pattern.steps.length);
        const t0 = ctx.currentTime + 0.1;
        pattern.steps.forEach((step, i) => {
          if (step.direction === '-') return;
          strumChord(ctx, ctx.destination, buffers, chord, {
            when: t0 + i * stepDur,
            direction: step.direction,
            spread: 0.01,
            stringMask: pattern.strings,
            capo,
          });
        });
        await new Promise<void>((resolve) => {
          const frame = (): void => {
            if (disposed) return resolve();
            const stepFloat = (ctx.currentTime - t0) / stepDur;
            if (stepFloat >= pattern.steps.length) return resolve();
            strumDisplay.update(Math.max(0, stepFloat));
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        strumDisplay.update(null);
      } catch (err) {
        console.error(err);
      } finally {
        previewing = false;
        previewBtn.disabled = false;
      }
    });

    // Practice controls show only while not actively playing
    function setPracticeVisible(visible: boolean): void {
      root.querySelectorAll<HTMLElement>('.practice-controls').forEach((el) => {
        el.style.display = visible ? '' : 'none';
      });
      if (!visible) {
        splitMode = false;
        splitBtn.setAttribute('aria-pressed', 'false');
        splitView.hidden = true;
        singleView.style.display = '';
      }
    }

    // Initial static view: first step of the song
    showStep(0);
    strumDisplay.update(null);
    renderPractice();

    // ---- rAF loop ----
    let lastCountBeat = 0;
    let lastState = '';
    function frame(): void {
      if (disposed || !player) return;
      const pos = player.getPosition();

      if (pos.state !== lastState) {
        const active = pos.state === 'playing' || pos.state === 'countIn';
        setPracticeVisible(!active);
        if (!active && shownChordId) {
          // Land practice mode on whatever chord playback stopped at
          const idx = songChordIds.indexOf(shownChordId);
          if (idx >= 0) practiceIdx = idx;
        }
        lastState = pos.state;
      }

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
    void practiceCtx?.close();
  };
}
