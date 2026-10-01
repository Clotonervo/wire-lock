import type { Vec3 } from "../types";

export type Rarity = "common" | "rare" | "wild";

/**
 * Everything Rewires change in the shared simulation, folded from a player's
 * Rewires (DESIGN.md §8b.2). Multipliers default to 1, additions to 0. Anything
 * that affects movement or firing must live here so prediction stays exact.
 */
export interface PlayerMods {
  moveSpeedMul: number;
  airAccelMul: number;
  /** Extra jumps allowed in mid-air. */
  airJumps: number;
  maxHealthAdd: number;
  maxHealthMul: number;
  /** < 1 = faster firing. */
  fireIntervalMul: number;
  magazineMul: number;
  /** < 1 = faster reloads. */
  reloadMul: number;
  /** Extra rays (hitscan) or projectiles per shot. */
  extraPellets: number;
  /** Scales damage from your own explosions. */
  selfBlastDamageMul: number;
  /** Scales knockback from your own explosions (rocket jumps). */
  selfKnockbackMul: number;
  /** Scales all damage you deal (server-side). */
  damageMul: number;
}

/** The narrow API Rewire hooks get on the server (like weapon hooks, DESIGN.md §7). */
export interface RewireApi {
  heal(player: string, amount: number): void;
  /** An explosion owned by `owner`, using a weapon definition for its splash. */
  explode(owner: string, at: Vec3, weaponId: string): void;
}

export interface KillContext extends RewireApi {
  killer: string;
  victim: string;
}

export interface DeathContext extends RewireApi {
  victim: string;
  pos: Vec3;
}

export interface RewireDef {
  id: string;
  name: string;
  /** One line, shown on the pick card. */
  description: string;
  rarity: Rarity;
  /** How many times it can be picked; default 1. */
  maxStacks?: number;
  /** Applied once per stack. */
  mods?: Partial<PlayerMods>;
  /** Server-only: after this player kills someone. */
  onKill?: (ctx: KillContext) => void;
  /** Server-only: when this player dies. */
  onDeath?: (ctx: DeathContext) => void;
}
