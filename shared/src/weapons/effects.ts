import type { WeaponDef } from "./types";

/** Cluster Bomb's bomblets: small explosions around a rocket's impact. In no loadout. */
export const clusterBomblet: WeaponDef = {
  id: "cluster-bomblet",
  name: "Cluster Bomb",
  kind: "projectile",
  fireIntervalMs: 0,
  damage: 0,
  projectile: { speed: 0, radius: 0, lifetimeMs: 0, splashRadius: 2.2, splashDamage: 30 },
  knockback: 7,
  view: { model: "none" },
};

/** Afterburn's burning damage, so the kill feed can name it. In no loadout. */
export const afterburnFlame: WeaponDef = {
  id: "afterburn",
  name: "Afterburn",
  kind: "hitscan",
  fireIntervalMs: 0,
  damage: 0,
  view: { model: "none" },
};
