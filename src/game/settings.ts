import type { Settings } from '../types/game';

const SETTINGS_STORAGE_KEY = 'neon-drift-survivor:settings';

export const defaultSettings: Settings = {
  volume: 0.5,
  screenShake: true,
  highContrast: false,
};

export function loadSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: clamp(typeof parsed.volume === 'number' ? parsed.volume : defaultSettings.volume, 0, 1),
      screenShake:
        typeof parsed.screenShake === 'boolean' ? parsed.screenShake : defaultSettings.screenShake,
      highContrast:
        typeof parsed.highContrast === 'boolean'
          ? parsed.highContrast
          : defaultSettings.highContrast,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
