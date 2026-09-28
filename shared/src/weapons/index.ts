import { pistol } from "./pistol";
import type { WeaponDef } from "./types";

export type * from "./types";

/** Every weapon, by id. Adding a weapon = one file + one line here (DESIGN.md §7). */
export const WEAPONS: Readonly<Record<string, WeaponDef>> = {
  [pistol.id]: pistol,
};

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}
