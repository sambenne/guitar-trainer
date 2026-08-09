import { getSettings, saveSettings } from '../app/settings';
import * as repo from '../storage/repo';
import { buildBackup, parseBackup, prepareImport } from '../storage/transfer';

function download(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function renderSettings(root: HTMLElement): void {
  const settings = getSettings();

  root.innerHTML = `
    <div class="page">
      <h1 class="page-title">Settings</h1>

      <div class="card" style="display:flex;flex-direction:column;gap:18px">
        <label style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>Metronome</span>
          <input type="checkbox" class="metro-enabled" style="width:22px;height:22px;min-height:0" />
        </label>
        <label style="display:flex;flex-direction:column;gap:8px">
          <span>Metronome volume</span>
          <input type="range" class="metro-volume" min="0" max="1" step="0.05" style="min-height:0" />
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>
            Guitar sound
            <span class="muted" style="display:block;font-size:12px">Strum the song's chords during playback</span>
          </span>
          <input type="checkbox" class="strum-enabled" style="width:22px;height:22px;min-height:0" />
        </label>
        <label style="display:flex;flex-direction:column;gap:8px">
          <span>Guitar volume</span>
          <input type="range" class="strum-volume" min="0" max="1" step="0.05" style="min-height:0" />
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>
            Strumming panel
            <span class="muted" style="display:block;font-size:12px">Low E at top: downstrokes move down the screen</span>
          </span>
          <select class="orientation">
            <option value="lowTop">Low E at top</option>
            <option value="highTop">High e at top</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>
            Left-handed
            <span class="muted" style="display:block;font-size:12px">Mirror chord diagrams (low E on the right)</span>
          </span>
          <input type="checkbox" class="left-handed" style="width:22px;height:22px;min-height:0" />
        </label>
      </div>

      <h2 style="font-size:16px;margin:20px 0 10px">Your data</h2>
      <div class="card" style="display:flex;flex-direction:column;gap:12px">
        <p class="muted" style="margin:0;font-size:13px">
          Your songs, chords and patterns live only in this browser. Export a backup before clearing
          browser data or to move them to another device.
        </p>
        <button class="export-btn">Export backup</button>
        <button class="import-btn">Import backup</button>
        <input type="file" class="import-file" accept=".json,application/json" style="display:none" />
        <button class="danger reset-btn">Delete all my data</button>
        <p class="data-status muted" style="margin:0;font-size:13px"></p>
      </div>
    </div>
  `;

  const enabled = root.querySelector('.metro-enabled') as HTMLInputElement;
  const volume = root.querySelector('.metro-volume') as HTMLInputElement;
  const orientation = root.querySelector('.orientation') as HTMLSelectElement;
  const status = root.querySelector('.data-status') as HTMLElement;

  const strumEnabled = root.querySelector('.strum-enabled') as HTMLInputElement;
  const strumVolume = root.querySelector('.strum-volume') as HTMLInputElement;

  enabled.checked = settings.metronomeEnabled;
  volume.value = String(settings.metronomeVolume);
  strumEnabled.checked = settings.strumEnabled;
  strumVolume.value = String(settings.strumVolume);
  orientation.value = settings.stringOrientation;
  const leftHanded = root.querySelector('.left-handed') as HTMLInputElement;
  leftHanded.checked = settings.leftHanded;
  leftHanded.addEventListener('change', () => saveSettings({ leftHanded: leftHanded.checked }));

  enabled.addEventListener('change', () => saveSettings({ metronomeEnabled: enabled.checked }));
  volume.addEventListener('change', () => saveSettings({ metronomeVolume: Number(volume.value) }));
  strumEnabled.addEventListener('change', () => saveSettings({ strumEnabled: strumEnabled.checked }));
  strumVolume.addEventListener('change', () => saveSettings({ strumVolume: Number(strumVolume.value) }));
  orientation.addEventListener('change', () =>
    saveSettings({ stringOrientation: orientation.value as 'lowTop' | 'highTop' }),
  );

  (root.querySelector('.export-btn') as HTMLElement).addEventListener('click', async () => {
    const [songs, chords, patterns] = await Promise.all([
      repo.getUserSongs(),
      repo.getUserChords(),
      repo.getUserPatterns(),
    ]);
    download('guitar-trainer-backup.json', buildBackup(songs, chords, patterns));
    status.textContent = `Exported ${songs.length} songs, ${chords.length} chords, ${patterns.length} patterns.`;
  });

  const fileInput = root.querySelector('.import-file') as HTMLInputElement;
  (root.querySelector('.import-btn') as HTMLElement).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const [chordMap, patternMap, userSongs] = await Promise.all([
        repo.getChordMap(),
        repo.getPatternMap(),
        repo.getUserSongs(),
      ]);
      const existingIds = new Set<string>([
        ...chordMap.keys(),
        ...patternMap.keys(),
        ...userSongs.map((s) => s.id),
        ...(await repo.getPresetSongs()).map((s) => s.id),
      ]);
      const plan = prepareImport(backup, existingIds);
      for (const chord of plan.chords) await repo.saveChord(chord);
      for (const pattern of plan.patterns) await repo.savePattern(pattern);
      for (const song of plan.songs) await repo.saveSong(song);
      const renamed = Object.keys(plan.remapped).length;
      status.textContent =
        `Imported ${plan.songs.length} songs, ${plan.chords.length} chords, ${plan.patterns.length} patterns.` +
        (renamed ? ` ${renamed} item${renamed === 1 ? '' : 's'} renamed to avoid ID clashes.` : '');
    } catch (err) {
      status.textContent = `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
  });

  (root.querySelector('.reset-btn') as HTMLElement).addEventListener('click', async () => {
    if (!confirm('Delete ALL your songs, chords and patterns? Presets are kept. This cannot be undone.')) return;
    await repo.resetUserData();
    status.textContent = 'All user data deleted.';
  });
}
