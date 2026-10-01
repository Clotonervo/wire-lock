import type { WeaponDef } from "./types";

/**
 * One in the Chamber's pistol: every hit kills, and there's no reloading.
 * Players start with one bullet and earn one per kill (the mode grants it).
 */
export const chamberPistol: WeaponDef = {
  id: "chamber-pistol",
  name: "Chamber Pistol",
  kind: "hitscan",
  fireIntervalMs: 400,
  damage: 200,
  magazine: 1,
  spreadRad: 0.002,
  range: 100,
  slotKey: 1,
  view: { model: "pistol", color: "#b8860b", sound: "pistol" },
};
