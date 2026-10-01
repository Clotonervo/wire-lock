/** Player settings (DESIGN.md §9.2), kept in localStorage. Every access is wrapped: storage can be unavailable. */
export interface Settings {
  /** Radians of turn per pixel of mouse movement. */
  sensitivity: number;
  /** Master volume, 0–1. */
  volume: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

export const SETTING_LIMITS = {
  sensitivity: { min: 0.0005, max: 0.006, step: 0.0001 },
  volume: { min: 0, max: 1, step: 0.05 },
  fov: { min: 60, max: 110, step: 1 },
} as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = { sensitivity: 0.002, volume: 0.5, fov: 75 };

const KEY = "wire-lock.settings";
/** Where sensitivity lived before the settings menu, migrated on first load. */
const OLD_SENSITIVITY_KEY = "wire-lock.sensitivity";

function clampSetting<K extends keyof Settings>(key: K, value: unknown): number {
  const { min, max } = SETTING_LIMITS[key];
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_SETTINGS[key];
}

export function loadSettings(): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as typeof raw;
    const old = localStorage.getItem(OLD_SENSITIVITY_KEY);
    if (raw.sensitivity === undefined && old !== null) raw.sensitivity = old;
  } catch {
    // Unavailable or corrupt: defaults.
  }
  return {
    sensitivity: raw.sensitivity === undefined ? DEFAULT_SETTINGS.sensitivity : clampSetting("sensitivity", raw.sensitivity),
    volume: raw.volume === undefined ? DEFAULT_SETTINGS.volume : clampSetting("volume", raw.volume),
    fov: raw.fov === undefined ? DEFAULT_SETTINGS.fov : clampSetting("fov", raw.fov),
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not persisted; fine.
  }
}
