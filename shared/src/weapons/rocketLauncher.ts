import type { WeaponDef } from "./types";

/** `damage` is the extra for a direct hit; everyone in the blast (including the shooter) takes splash. */
export const rocketLauncher: WeaponDef = {
  id: "rocket",
  name: "Rocket Launcher",
  kind: "projectile",
  fireIntervalMs: 800,
  damage: 20,
  magazine: 4,
  reloadMs: 2200,
  projectile: {
    speed: 22,
    radius: 0.15,
    lifetimeMs: 4000,
    splashRadius: 3.5,
    splashDamage: 70,
  },
  knockback: 14,
  slotKey: 3,
  view: { model: "rocket", color: "#556b2f", sound: "rocket" },
};
