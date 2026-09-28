import { pistol } from "./pistol";
import { rocketLauncher } from "./rocketLauncher";
import { shotgun } from "./shotgun";
import type { WeaponDef } from "./types";

export type * from "./types";
export { pistol, rocketLauncher, shotgun };

/** Every weapon, by id. Adding a weapon = one file + one line here (DESIGN.md §7). */
export const WEAPONS: Readonly<Record<string, WeaponDef>> = {
  [pistol.id]: pistol,
  [shotgun.id]: shotgun,
  [rocketLauncher.id]: rocketLauncher,
};

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}
