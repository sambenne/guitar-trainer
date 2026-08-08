import { getSettings, saveSettings } from '../app/settings';

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
            Strumming panel
            <span class="muted" style="display:block;font-size:12px">Low E at top: downstrokes move down the screen</span>
          </span>
          <select class="orientation">
            <option value="lowTop">Low E at top</option>
            <option value="highTop">High e at top</option>
          </select>
        </label>
      </div>
    </div>
  `;

  const enabled = root.querySelector('.metro-enabled') as HTMLInputElement;
  const volume = root.querySelector('.metro-volume') as HTMLInputElement;
  const orientation = root.querySelector('.orientation') as HTMLSelectElement;

  enabled.checked = settings.metronomeEnabled;
  volume.value = String(settings.metronomeVolume);
  orientation.value = settings.stringOrientation;

  enabled.addEventListener('change', () => saveSettings({ metronomeEnabled: enabled.checked }));
  volume.addEventListener('change', () => saveSettings({ metronomeVolume: Number(volume.value) }));
  orientation.addEventListener('change', () =>
    saveSettings({ stringOrientation: orientation.value as 'lowTop' | 'highTop' }),
  );
}
