import './library.css';
import { navigate } from '../app/router';
import * as repo from '../storage/repo';
import type { Song } from '../types/models';

export function renderLibrary(root: HTMLElement): () => void {
  let disposed = false;

  root.innerHTML = `
    <div class="page">
      <div class="library-head">
        <h1 class="page-title">Songs</h1>
        <button class="primary new-song-btn">+ New Song</button>
      </div>
      <div class="song-list"><p class="muted">Loading…</p></div>
      <h2 class="library-subtitle">My Songs</h2>
      <div class="user-song-list"></div>
    </div>
  `;

  (root.querySelector('.new-song-btn') as HTMLElement).addEventListener('click', () => navigate('/song-editor'));

  function songRow(song: Song, user: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'song-row';
    row.innerHTML = `
      <button class="song-open">
        <span class="song-icon">🎸</span>
        <span class="song-meta">
          <span class="song-row-title"></span>
          <span class="song-row-artist muted"></span>
        </span>
        <span class="song-bpm muted"></span>
      </button>
      ${user ? `<button class="ghost song-edit" aria-label="Edit">✎</button>` : ''}
    `;
    (row.querySelector('.song-row-title') as HTMLElement).textContent = song.title;
    (row.querySelector('.song-row-artist') as HTMLElement).textContent = song.artist ?? '';
    (row.querySelector('.song-bpm') as HTMLElement).textContent = `${song.bpm} BPM`;
    (row.querySelector('.song-open') as HTMLElement).addEventListener('click', () =>
      navigate(`/player/${encodeURIComponent(song.id)}`),
    );
    row.querySelector('.song-edit')?.addEventListener('click', () =>
      navigate(`/song-editor/${encodeURIComponent(song.id)}`),
    );
    return row;
  }

  void (async () => {
    const [presets, userSongs] = await Promise.all([repo.getPresetSongs(), repo.getUserSongs()]);
    if (disposed) return;

    const list = root.querySelector('.song-list') as HTMLElement;
    list.innerHTML = '';
    for (const song of presets) list.appendChild(songRow(song, false));

    const userList = root.querySelector('.user-song-list') as HTMLElement;
    if (userSongs.length === 0) {
      userList.innerHTML = `<p class="muted">Nothing yet — tap <b>+ New Song</b> to create one.</p>`;
    } else {
      for (const song of userSongs) userList.appendChild(songRow(song, true));
    }
  })();

  return () => {
    disposed = true;
  };
}
