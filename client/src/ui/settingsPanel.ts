import { SETTING_LIMITS, saveSettings, type Settings } from "../settings";

interface Row {
  key: keyof Settings;
  label: string;
  format: (v: number) => string;
}

const ROWS: Row[] = [
  // Shown relative to the default so it reads like other games' sensitivity numbers.
  { key: "sensitivity", label: "Mouse sensitivity", format: (v) => (v / 0.002).toFixed(2) },
  { key: "volume", label: "Volume", format: (v) => `${Math.round(v * 100)}%` },
  { key: "fov", label: "Field of view", format: (v) => `${Math.round(v)}°` },
];

/**
 * Sliders on the pause screen (DESIGN.md §9.2). Changes apply immediately and are
 * saved. Clicks inside don't count as "click to play".
 */
export class SettingsPanel {
  onChange: (s: Settings) => void = () => {};

  constructor(parent: HTMLElement, private settings: Settings) {
    const panel = document.createElement("div");
    panel.className = "settings-panel";
    for (const ev of ["click", "pointerdown", "mousedown"]) panel.addEventListener(ev, (e) => e.stopPropagation());

    for (const row of ROWS) {
      const label = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = row.label;
      const value = document.createElement("output");
      value.textContent = row.format(settings[row.key]);
      const input = document.createElement("input");
      input.type = "range";
      const lim = SETTING_LIMITS[row.key];
      input.min = String(lim.min);
      input.max = String(lim.max);
      input.step = String(lim.step);
      input.value = String(settings[row.key]);
      input.addEventListener("input", () => {
        this.settings = { ...this.settings, [row.key]: Number(input.value) };
        value.textContent = row.format(this.settings[row.key]);
        saveSettings(this.settings);
        this.onChange(this.settings);
      });
      label.append(name, input, value);
      panel.append(label);
    }
    parent.append(panel);
  }
}
