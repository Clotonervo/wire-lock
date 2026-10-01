import { REWIRE_OFFER_SIZE, REWIRE_RARITY_WEIGHTS } from "../constants";
import type { Rng } from "../random";
import * as defs from "./defs";
import type { PlayerMods, RewireDef } from "./types";

export type * from "./types";
export * from "./defs";

/** Every Rewire, by id (DESIGN.md §8b). */
export const REWIRES: Readonly<Record<string, RewireDef>> = Object.fromEntries(
  [
    defs.overclock,
    defs.plating,
    defs.hairTrigger,
    defs.deepMags,
    defs.splitShot,
    defs.springHeels,
    defs.blastShield,
    defs.vampire,
    defs.glassCannon,
    defs.deadMansSwitch,
  ].map((r) => [r.id, r]),
);

export function getRewire(id: string): RewireDef | undefined {
  return REWIRES[id];
}

export const DEFAULT_MODS: Readonly<PlayerMods> = {
  moveSpeedMul: 1,
  airAccelMul: 1,
  airJumps: 0,
  maxHealthAdd: 0,
  maxHealthMul: 1,
  fireIntervalMul: 1,
  magazineMul: 1,
  reloadMul: 1,
  extraPellets: 0,
  selfBlastDamageMul: 1,
  selfKnockbackMul: 1,
  damageMul: 1,
};

/** Additive fields; everything else multiplies. */
const ADDITIVE: ReadonlySet<keyof PlayerMods> = new Set(["airJumps", "maxHealthAdd", "extraPellets"]);

/** Folds a player's Rewires (in pick order; repeats are stacks) into one set of mods. */
export function foldMods(rewireIds: readonly string[]): PlayerMods {
  const mods: PlayerMods = { ...DEFAULT_MODS };
  for (const id of rewireIds) {
    const m = getRewire(id)?.mods;
    if (!m) continue;
    for (const [k, v] of Object.entries(m) as [keyof PlayerMods, number][]) {
      mods[k] = ADDITIVE.has(k) ? mods[k] + v : mods[k] * v;
    }
  }
  return mods;
}

export function stacksOf(owned: readonly string[], id: string): number {
  return owned.filter((o) => o === id).length;
}

/**
 * Rolls a pick: REWIRE_OFFER_SIZE distinct Rewires the player can still take,
 * weighted by rarity. Server-side (seeded RNG passed in), so clients can't fish.
 */
export function rollOffer(owned: readonly string[], rng: Rng): string[] {
  const pool = Object.values(REWIRES).filter((r) => stacksOf(owned, r.id) < (r.maxStacks ?? 1));
  const offer: string[] = [];
  while (offer.length < REWIRE_OFFER_SIZE && pool.length > 0) {
    const total = pool.reduce((n, r) => n + REWIRE_RARITY_WEIGHTS[r.rarity], 0);
    let roll = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      roll -= REWIRE_RARITY_WEIGHTS[pool[i]!.rarity];
      if (roll < 0) break;
    }
    offer.push(pool[i]!.id);
    pool.splice(i, 1);
  }
  return offer;
}
