import './library.css';
import { navigate } from '../app/router';
import { getSongs } from '../storage/repo';

export function renderLibrary(root: HTMLElement): () => void {
  let disposed = false;

  root.innerHTML = `
    <div class="page">
      <h1 class="page-title">Songs</h1>
      <div class="song-list"><p class="muted">Loading…</p></div>
    </div>
  `;

  void (async () => {
    const songs = await getSongs();
    if (disposed) return;
    const list = root.querySelector('.song-list') as HTMLElement;
    list.innerHTML = '';

    for (const song of songs) {
      const btn = document.createElement('button');
      btn.className = 'song-row';
      btn.innerHTML = `
        <span class="song-icon">🎸</span>
        <span class="song-meta">
          <span class="song-row-title"></span>
          <span class="song-row-artist muted"></span>
        </span>
        <span class="song-bpm muted"></span>
      `;
      (btn.querySelector('.song-row-title') as HTMLElement).textContent = song.title;
      (btn.querySelector('.song-row-artist') as HTMLElement).textContent = song.artist ?? '';
      (btn.querySelector('.song-bpm') as HTMLElement).textContent = `${song.bpm} BPM`;
      btn.addEventListener('click', () => navigate(`/player/${encodeURIComponent(song.id)}`));
      list.appendChild(btn);
    }
  })();

  return () => {
    disposed = true;
  };
}
