import type { WeaponDef } from "./types";

export const shotgun: WeaponDef = {
  id: "shotgun",
  name: "Shotgun",
  kind: "hitscan",
  fireIntervalMs: 850,
  damage: 9,
  pellets: 8,
  magazine: 6,
  reloadMs: 2000,
  spreadRad: 0.08,
  range: 40,
  knockback: 1.2,
  slotKey: 2,
  view: { model: "shotgun", color: "#6b4a2b", sound: "shotgun" },
};
