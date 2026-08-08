import { DEFAULT_SETTINGS, type Settings } from '../types/models';

const KEY = 'guitar-trainer-settings';

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (!cached) {
    try {
      const raw = localStorage.getItem(KEY);
      cached = raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
    } catch {
      cached = { ...DEFAULT_SETTINGS };
    }
  }
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cached = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(cached));
  document.dispatchEvent(new CustomEvent('settings-changed'));
  return cached;
}
