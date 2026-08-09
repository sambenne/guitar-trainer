import './progress.css';
import * as repo from '../storage/repo';
import type { PracticeEntry } from '../types/models';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_DAYS = 14;

function minutes(seconds: number): string {
  const m = seconds / 60;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}

function shiftDate(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number);
  return repo.localDate(new Date(y, m - 1, d + days));
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Consecutive practice days ending today (or yesterday, so a streak survives until tonight). */
function streakLength(practicedDates: Set<string>, today: string): number {
  let start = today;
  if (!practicedDates.has(start)) start = shiftDate(today, -1);
  if (!practicedDates.has(start)) return 0;
  let streak = 0;
  while (practicedDates.has(start)) {
    streak++;
    start = shiftDate(start, -1);
  }
  return streak;
}

function buildChart(byDay: Map<string, number>, today: string): SVGSVGElement {
  const W = 340;
  const H = 110;
  const PAD_BOTTOM = 18;
  const barW = W / CHART_DAYS - 4;
  const days = Array.from({ length: CHART_DAYS }, (_, i) => shiftDate(today, i - (CHART_DAYS - 1)));
  const max = Math.max(60, ...days.map((d) => byDay.get(d) ?? 0)); // floor at 1 min so tiny bars stay tiny

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#f5b301';
  const dim = styles.getPropertyValue('--text-dim').trim() || '#999';
  const border = styles.getPropertyValue('--border').trim() || '#444';

  days.forEach((date, i) => {
    const secs = byDay.get(date) ?? 0;
    const x = (W / CHART_DAYS) * i + 2;
    const h = secs > 0 ? Math.max(3, (secs / max) * (H - PAD_BOTTOM - 8)) : 0;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(H - PAD_BOTTOM - h));
    rect.setAttribute('width', String(barW));
    rect.setAttribute('height', String(Math.max(h, 1.5)));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', secs > 0 ? (date === today ? accent : dim) : border);
    if (secs === 0) rect.setAttribute('opacity', '0.4');
    svg.appendChild(rect);

    // Weekday initial under every other bar
    if (i % 2 === CHART_DAYS % 2) {
      const [y, m, d] = date.split('-').map(Number);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x + barW / 2));
      label.setAttribute('y', String(H - 4));
      label.setAttribute('font-size', '9');
      label.setAttribute('fill', dim);
      label.setAttribute('text-anchor', 'middle');
      label.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
      svg.appendChild(label);
    }
  });
  return svg;
}

export function renderProgressPage(root: HTMLElement): () => void {
  let disposed = false;
  root.innerHTML = `<div class="page progress-page"><h1 class="page-title">Progress</h1><p class="muted">Loading…</p></div>`;

  void (async () => {
    const entries = await repo.getPracticeEntries();
    if (disposed) return;
    const page = root.querySelector('.progress-page') as HTMLElement;

    if (entries.length === 0) {
      page.innerHTML = `
        <h1 class="page-title">Progress</h1>
        <div class="card empty">
          <p style="font-size:34px;margin:0 0 8px">🎸</p>
          <p class="muted">Play any song and your practice time, tempo and loops will show up here automatically.</p>
        </div>`;
      return;
    }

    const today = repo.localDate();
    const byDay = new Map<string, number>();
    const byDayEntries = new Map<string, PracticeEntry[]>();
    let totalSeconds = 0;
    for (const e of entries) {
      byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.seconds);
      const list = byDayEntries.get(e.date) ?? [];
      list.push(e);
      byDayEntries.set(e.date, list);
      totalSeconds += e.seconds;
    }
    const streak = streakLength(new Set(byDay.keys()), today);

    page.innerHTML = `
      <h1 class="page-title">Progress</h1>
      <div class="card streak-card">
        <span class="streak-num">${streak > 0 ? `🔥 ${streak}` : '–'}</span>
        <span class="muted">${streak === 1 ? 'day streak' : 'day streak'}</span>
        <span class="totals">${minutes(totalSeconds)} total<br>${byDay.size} day${byDay.size === 1 ? '' : 's'} practised</span>
      </div>
      <div class="card chart-card"></div>
      <div class="days"></div>
    `;
    (page.querySelector('.chart-card') as HTMLElement).appendChild(buildChart(byDay, today));

    const daysEl = page.querySelector('.days') as HTMLElement;
    const dates = [...byDayEntries.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 14);
    for (const date of dates) {
      const dayEntries = byDayEntries.get(date)!.sort((a, b) => b.seconds - a.seconds);
      const card = document.createElement('div');
      card.className = 'card day-card';
      card.innerHTML = `
        <div class="day-head">
          <span class="day-name"></span>
          <span class="day-mins"></span>
        </div>
      `;
      (card.querySelector('.day-name') as HTMLElement).textContent = dayLabel(date, today);
      (card.querySelector('.day-mins') as HTMLElement).textContent = minutes(byDay.get(date) ?? 0);
      for (const e of dayEntries) {
        const line = document.createElement('div');
        line.className = 'song-line';
        const name = document.createElement('span');
        name.className = 'song-name';
        name.textContent = e.songTitle;
        const stats = document.createElement('span');
        stats.className = 'song-stats';
        const bits = [minutes(e.seconds)];
        if (e.maxPct > 0) bits.push(`best ${e.maxPct}%`);
        if (e.loops > 0) bits.push(`${e.loops} loop${e.loops === 1 ? '' : 's'}`);
        stats.textContent = bits.join(' · ');
        line.append(name, stats);
        card.appendChild(line);
      }
      daysEl.appendChild(card);
    }
  })();

  return () => {
    disposed = true;
  };
}
