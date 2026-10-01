import type { RewireDef } from "./types";

// The v1 set (DESIGN.md §8b.3). One entry per Rewire; add new ones here and to the registry.

export const overclock: RewireDef = {
  id: "overclock",
  name: "Overclock",
  description: "+25% move speed.",
  rarity: "common",
  maxStacks: 2,
  mods: { moveSpeedMul: 1.25 },
};

export const plating: RewireDef = {
  id: "plating",
  name: "Plating",
  description: "+40 max health.",
  rarity: "common",
  maxStacks: 2,
  mods: { maxHealthAdd: 40 },
};

export const hairTrigger: RewireDef = {
  id: "hair-trigger",
  name: "Hair Trigger",
  description: "Weapons fire 25% faster.",
  rarity: "common",
  maxStacks: 2,
  mods: { fireIntervalMul: 0.75 },
};

export const deepMags: RewireDef = {
  id: "deep-mags",
  name: "Deep Mags",
  description: "+50% magazine size, reload 25% faster.",
  rarity: "common",
  mods: { magazineMul: 1.5, reloadMul: 0.75 },
};

export const splitShot: RewireDef = {
  id: "split-shot",
  name: "Split Shot",
  description: "+1 bullet (or rocket) per shot, slightly spread.",
  rarity: "rare",
  mods: { extraPellets: 1 },
};

export const springHeels: RewireDef = {
  id: "spring-heels",
  name: "Spring Heels",
  description: "Jump again in mid-air.",
  rarity: "rare",
  mods: { airJumps: 1, airAccelMul: 1.5 },
};

export const blastShield: RewireDef = {
  id: "blast-shield",
  name: "Blast Shield",
  description: "Your own explosions don't hurt you, and rocket jumps go 50% further.",
  rarity: "rare",
  mods: { selfBlastDamageMul: 0, selfKnockbackMul: 1.5 },
};

export const VAMPIRE_HEAL = 25;

export const vampire: RewireDef = {
  id: "vampire",
  name: "Vampire",
  description: `Heal ${VAMPIRE_HEAL} on every kill.`,
  rarity: "rare",
  onKill: (ctx) => ctx.heal(ctx.killer, VAMPIRE_HEAL),
};

export const glassCannon: RewireDef = {
  id: "glass-cannon",
  name: "Glass Cannon",
  description: "Deal double damage. Half max health.",
  rarity: "wild",
  mods: { damageMul: 2, maxHealthMul: 0.5 },
};

/** The explosion Dead Man's Switch sets off, defined as a hidden weapon so splash rules are shared. */
export const DEAD_MANS_SWITCH_WEAPON = "dead-mans-switch";

export const deadMansSwitch: RewireDef = {
  id: "dead-mans-switch",
  name: "Dead Man's Switch",
  description: "Explode when you die, hurting anyone nearby.",
  rarity: "wild",
  onDeath: (ctx) => ctx.explode(ctx.victim, ctx.pos, DEAD_MANS_SWITCH_WEAPON),
};
