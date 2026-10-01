import type { WeaponDef } from "./types";

/**
 * Not a real weapon: the explosion the Dead Man's Switch Rewire sets off when
 * its owner dies. Defined here so splash, knockback, the kill-feed name and the
 * effects reuse the normal rules. It's in no loadout.
 */
export const deadMansSwitchBlast: WeaponDef = {
  id: "dead-mans-switch",
  name: "Dead Man's Switch",
  kind: "projectile",
  fireIntervalMs: 0,
  damage: 0,
  projectile: { speed: 0, radius: 0, lifetimeMs: 0, splashRadius: 4, splashDamage: 80 },
  knockback: 16,
  view: { model: "none" },
};
