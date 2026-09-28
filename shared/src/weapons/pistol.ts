import type { WeaponDef } from "./types";

export const pistol: WeaponDef = {
  id: "pistol",
  name: "Pistol",
  kind: "hitscan",
  fireIntervalMs: 250,
  damage: 25,
  spreadRad: 0.004,
  range: 100,
  view: { model: "pistol", color: "#2a2a2a" },
};
