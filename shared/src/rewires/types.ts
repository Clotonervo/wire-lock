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
  /** Bullet magnetism: hitscan/melee rays passing within this angle (radians) of a body hit it. */
  aimAssistRad: number;
  /** Damage multiplier for headshots. */
  headshotMul: number;
  /** Damage multiplier within POINT_BLANK_RANGE. */
  pointBlankMul: number;
  /** Damage multiplier beyond LONG_SHOT_RANGE. */
  longShotMul: number;
  /** Damage multiplier against targets below EXECUTE_BELOW of their max health. */
  executeMul: number;
  /** Scales damage you take. */
  damageTakenMul: number;
  /** Scales your explosions' radius (and so your rocket jumps). */
  splashRadiusMul: number;
  /** Scales gravity while you're falling. */
  fallGravityMul: number;
  /** Alt-fire dashes (0 = no dash). */
  airDashes: number;
  regenPerSec: number;
  /** Times per life a killing hit leaves you at 1 HP instead. */
  secondWinds: number;
  /** Burn damage your hits apply (over AFTERBURN_MS). */
  afterburnDamage: number;
  /** Wall bounces per bullet. */
  ricochets: number;
  /** Rockets also burst into bomblets. */
  clusterBombs: number;
  /** See enemies through walls within this range (client rendering). */
  radarRange: number;
}

/** The narrow API Rewire hooks get on the server (like weapon hooks, DESIGN.md §7). */
export interface RewireApi {
  heal(player: string, amount: number): void;
  refillMagazine(player: string): void;
  /** Speed boost (Adrenaline) for `ms`. */
  boost(player: string, ms: number): void;
  /** Copy one of `from`'s Rewires to `to`, if `to` can take any. */
  copyRewire(to: string, from: string): void;
  /** Give `player` up to `count` random Rewires (respecting stacks and the cap). */
  grantRandom(player: string, count: number): void;
  /** Server-side randomness in [0, 1). */
  random(): number;
  /** An explosion owned by `owner`, using a weapon definition for its splash. */
  explode(owner: string, at: Vec3, weaponId: string): void;
}

export interface KillContext extends RewireApi {
  killer: string;
  victim: string;
}

export interface PickContext extends RewireApi {
  player: string;
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
  /** Server-only: right after this Rewire is picked. */
  onPick?: (ctx: PickContext) => void;
}
