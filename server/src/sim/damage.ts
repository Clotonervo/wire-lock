import { EXECUTE_BELOW, LONG_SHOT_RANGE, POINT_BLANK_RANGE } from "@wire-lock/shared";
import type { PlayerMods } from "@wire-lock/shared";

export interface DamageSituation {
  /** Distance from attacker to target. */
  dist: number;
  headshot: boolean;
  targetHealth: number;
  targetMaxHealth: number;
}

/**
 * Damage after Rewire modifiers (DESIGN.md §8b): the attacker's damage,
 * headshot, range and execute bonuses, then the target's damage taken. Pure,
 * so every rule is unit-tested. `attacker` is null for self-damage and the world.
 */
export function scaleDamage(amount: number, attacker: PlayerMods | null, target: PlayerMods, s: DamageSituation): number {
  let d = amount;
  if (attacker) {
    d *= attacker.damageMul;
    if (s.headshot) d *= attacker.headshotMul;
    if (s.dist <= POINT_BLANK_RANGE) d *= attacker.pointBlankMul;
    if (s.dist >= LONG_SHOT_RANGE) d *= attacker.longShotMul;
    if (s.targetHealth < s.targetMaxHealth * EXECUTE_BELOW) d *= attacker.executeMul;
  }
  return d * target.damageTakenMul;
}
