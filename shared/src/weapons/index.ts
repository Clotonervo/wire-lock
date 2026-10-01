import { chamberPistol } from "./chamberPistol";
import { deadMansSwitchBlast } from "./deadMansSwitch";
import { pistol } from "./pistol";
import { rocketLauncher } from "./rocketLauncher";
import { shotgun } from "./shotgun";
import type { WeaponDef } from "./types";
import { wrench } from "./wrench";

export type * from "./types";
export { chamberPistol, pistol, rocketLauncher, shotgun, wrench };

/** Every weapon, by id. Adding a weapon = one file + one line here (DESIGN.md §7). */
export const WEAPONS: Readonly<Record<string, WeaponDef>> = {
  [pistol.id]: pistol,
  [shotgun.id]: shotgun,
  [rocketLauncher.id]: rocketLauncher,
  [wrench.id]: wrench,
  [chamberPistol.id]: chamberPistol,
  [deadMansSwitchBlast.id]: deadMansSwitchBlast,
};

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}
