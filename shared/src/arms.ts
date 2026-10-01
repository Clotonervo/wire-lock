import { MAX_HEALTH, SPLIT_SHOT_SPREAD, WEAPON_SWITCH_MS } from "./constants";
import { DEFAULT_MODS, type PlayerMods } from "./rewires";
import type { InputCmd } from "./types";
import { getWeapon } from "./weapons";
import type { WeaponDef } from "./weapons";

/** Ammo value meaning "infinite" (a weapon with no magazine). */
export const INFINITE_AMMO = -1;
/** Timers at or below this count as finished; they tick down in steps of TICK_MS, which isn't exact in floats. */
const TIMER_EPSILON = 1e-6;

/**
 * A player's weapons. Pure data, advanced once per applied input by stepArms on
 * both the server and the predicting client, so ammo, cooldowns and reloads
 * are predicted exactly (DESIGN.md §7).
 */
export interface ArmsState {
  /** Weapon ids in slot order (the mode's loadout). */
  slots: string[];
  /** Index into `slots` of the equipped weapon. */
  current: number;
  /** Rounds left per slot; INFINITE_AMMO for weapons without a magazine. */
  ammo: number[];
  /** Time until the equipped weapon can fire again, ms. */
  cooldownMs: number;
  /** Time left on the current reload, ms; 0 = not reloading. */
  reloadMs: number;
}

export interface ArmsStepResult {
  arms: ArmsState;
  /** The weapon that fired this input, if any. */
  fired: WeaponDef | null;
  reloadStarted: boolean;
  reloadFinished: boolean;
  switched: boolean;
}

/** A weapon's magazine size with Rewires applied; undefined for weapons without one. */
export function magazineSize(weapon: WeaponDef, mods: PlayerMods = DEFAULT_MODS): number | undefined {
  return weapon.magazine === undefined ? undefined : Math.max(1, Math.round(weapon.magazine * mods.magazineMul));
}

/** How many rays a hitscan/melee shot fires and how widely they spread, with Rewires applied. */
export function shotPattern(weapon: WeaponDef, mods: PlayerMods = DEFAULT_MODS): { count: number; spread: number } {
  const count = (weapon.pellets ?? 1) + mods.extraPellets;
  const spread = mods.extraPellets > 0 ? Math.max(weapon.spreadRad ?? 0, SPLIT_SHOT_SPREAD) : (weapon.spreadRad ?? 0);
  return { count, spread };
}

/** Max health with Rewires applied. */
export function maxHealth(mods: PlayerMods = DEFAULT_MODS): number {
  return Math.max(1, Math.round((MAX_HEALTH + mods.maxHealthAdd) * mods.maxHealthMul));
}

export function createArms(slots: readonly string[], mods: PlayerMods = DEFAULT_MODS): ArmsState {
  return {
    slots: [...slots],
    current: 0,
    ammo: slots.map((id) => {
      const w = getWeapon(id);
      return (w && magazineSize(w, mods)) ?? INFINITE_AMMO;
    }),
    cooldownMs: 0,
    reloadMs: 0,
  };
}

/** Where a weapon sorts in a loadout: by its number key, keyless weapons last. */
function slotOrder(id: string): number {
  return getWeapon(id)?.slotKey ?? Number.MAX_SAFE_INTEGER;
}

/**
 * A weapon pickup. A new weapon goes into the loadout in number-key order with
 * a full magazine and is switched to; one you already have gets its magazine
 * refilled. Returns null if it would change nothing (so the pickup stays put).
 */
export function giveWeapon(prev: ArmsState, id: string, mods: PlayerMods = DEFAULT_MODS): ArmsState | null {
  const weapon = getWeapon(id);
  if (!weapon) return null;
  const mag = magazineSize(weapon, mods) ?? INFINITE_AMMO;
  const owned = prev.slots.indexOf(id);
  if (owned >= 0) {
    if (mag === INFINITE_AMMO || (prev.ammo[owned] ?? 0) >= mag) return null;
    const ammo = [...prev.ammo];
    ammo[owned] = mag;
    // A refill finishes a reload in progress on that weapon.
    return { ...prev, ammo, reloadMs: owned === prev.current ? 0 : prev.reloadMs };
  }
  let at = prev.slots.findIndex((s) => slotOrder(s) > slotOrder(id));
  if (at < 0) at = prev.slots.length;
  const slots = [...prev.slots];
  const ammo = [...prev.ammo];
  slots.splice(at, 0, id);
  ammo.splice(at, 0, mag);
  return { slots, ammo, current: at, cooldownMs: Math.max(prev.cooldownMs, WEAPON_SWITCH_MS), reloadMs: 0 };
}

/** The slot a number key selects: the weapon with that `slotKey`, if you have it. */
export function slotForKey(arms: ArmsState, key: number): number | undefined {
  const i = arms.slots.findIndex((id) => getWeapon(id)?.slotKey === key);
  return i < 0 ? undefined : i;
}

export function currentWeapon(arms: ArmsState): WeaponDef | undefined {
  const id = arms.slots[arms.current];
  return id === undefined ? undefined : getWeapon(id);
}

/**
 * One input's worth of weapon handling, in a fixed order: switch, timers,
 * reload request, fire. `canFire` is false between rounds.
 */
export function stepArms(prev: ArmsState, cmd: InputCmd, canFire: boolean, mods: PlayerMods = DEFAULT_MODS): ArmsStepResult {
  const arms: ArmsState = { ...prev, slots: prev.slots, ammo: [...prev.ammo] };
  const dtMs = cmd.dt * 1000;
  const result: ArmsStepResult = { arms, fired: null, reloadStarted: false, reloadFinished: false, switched: false };

  const slot = cmd.weaponSlot;
  if (slot !== undefined && slot !== arms.current && slot >= 0 && slot < arms.slots.length) {
    arms.current = slot;
    arms.reloadMs = 0;
    arms.cooldownMs = Math.max(arms.cooldownMs, WEAPON_SWITCH_MS);
    result.switched = true;
  }

  const weapon = currentWeapon(arms);
  arms.cooldownMs = Math.max(0, arms.cooldownMs - dtMs);
  if (arms.reloadMs > 0) {
    arms.reloadMs -= dtMs;
    if (arms.reloadMs <= TIMER_EPSILON) {
      arms.reloadMs = 0;
      const mag = weapon && magazineSize(weapon, mods);
      if (mag !== undefined) arms.ammo[arms.current] = mag;
      result.reloadFinished = true;
    }
  }
  if (!weapon) return result;

  const ammo = arms.ammo[arms.current] ?? 0;
  const mag = magazineSize(weapon, mods);
  const canReload = mag !== undefined && ammo !== INFINITE_AMMO && ammo < mag;
  const startReload = () => {
    arms.reloadMs = (weapon.reloadMs ?? 0) * mods.reloadMul;
    result.reloadStarted = arms.reloadMs > 0;
  };

  if (cmd.reload && arms.reloadMs === 0 && canReload) startReload();

  if (cmd.fire && canFire && arms.cooldownMs <= TIMER_EPSILON && arms.reloadMs === 0) {
    if (ammo === 0) {
      if (canReload) startReload();
    } else {
      result.fired = weapon;
      arms.cooldownMs = weapon.fireIntervalMs * mods.fireIntervalMul;
      if (ammo !== INFINITE_AMMO) {
        arms.ammo[arms.current] = ammo - 1;
        if (ammo - 1 === 0) startReload();
      }
    }
  }
  return result;
}
