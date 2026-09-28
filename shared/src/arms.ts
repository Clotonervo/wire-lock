import { WEAPON_SWITCH_MS } from "./constants";
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

export function createArms(slots: readonly string[]): ArmsState {
  return {
    slots: [...slots],
    current: 0,
    ammo: slots.map((id) => getWeapon(id)?.magazine ?? INFINITE_AMMO),
    cooldownMs: 0,
    reloadMs: 0,
  };
}

export function currentWeapon(arms: ArmsState): WeaponDef | undefined {
  const id = arms.slots[arms.current];
  return id === undefined ? undefined : getWeapon(id);
}

/**
 * One input's worth of weapon handling, in a fixed order: switch, timers,
 * reload request, fire. `canFire` is false between rounds.
 */
export function stepArms(prev: ArmsState, cmd: InputCmd, canFire: boolean): ArmsStepResult {
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
      if (weapon?.magazine !== undefined) arms.ammo[arms.current] = weapon.magazine;
      result.reloadFinished = true;
    }
  }
  if (!weapon) return result;

  const ammo = arms.ammo[arms.current] ?? 0;
  const canReload = weapon.magazine !== undefined && ammo !== INFINITE_AMMO && ammo < weapon.magazine;
  const startReload = () => {
    arms.reloadMs = weapon.reloadMs ?? 0;
    result.reloadStarted = arms.reloadMs > 0;
  };

  if (cmd.reload && arms.reloadMs === 0 && canReload) startReload();

  if (cmd.fire && canFire && arms.cooldownMs <= TIMER_EPSILON && arms.reloadMs === 0) {
    if (ammo === 0) {
      if (canReload) startReload();
    } else {
      result.fired = weapon;
      arms.cooldownMs = weapon.fireIntervalMs;
      if (ammo !== INFINITE_AMMO) {
        arms.ammo[arms.current] = ammo - 1;
        if (ammo - 1 === 0) startReload();
      }
    }
  }
  return result;
}
