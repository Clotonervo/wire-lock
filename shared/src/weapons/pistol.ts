import type { WeaponDef } from "./types";

export const pistol: WeaponDef = {
  id: "pistol",
  name: "Pistol",
  kind: "hitscan",
  fireIntervalMs: 250,
  damage: 25,
  magazine: 12,
  reloadMs: 1100,
  spreadRad: 0.004,
  range: 100,
  slotKey: 1,
  view: { model: "pistol", color: "#2a2a2a", sound: "pistol" },
};
