import type { WeaponDef } from "./types";

/** Melee: one hit, arm's reach. Gun Game's final weapon and One in the Chamber's backup. */
export const wrench: WeaponDef = {
  id: "wrench",
  name: "Wrench",
  kind: "melee",
  fireIntervalMs: 500,
  damage: 100,
  range: 2.2,
  knockback: 3,
  view: { model: "wrench", color: "#9aa3ad", sound: "melee" },
};
