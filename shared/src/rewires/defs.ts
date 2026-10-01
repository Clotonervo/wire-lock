import { ADRENALINE_MS, COPYCAT_CHANCE } from "../constants";
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

// --- v2 (DESIGN.md §8b.3, second set) ---

export const hollowPoints: RewireDef = {
  id: "hollow-points",
  name: "Hollow Points",
  description: "+20% damage.",
  rarity: "common",
  maxStacks: 2,
  mods: { damageMul: 1.2 },
};

export const magneticRounds: RewireDef = {
  id: "magnetic-rounds",
  name: "Magnetic Rounds",
  description: "Near-miss shots bend into enemies (a little aim assist).",
  rarity: "rare",
  // ~3.5°, measured to the body's centre line: about a body-width of forgiveness at 10m, more further out.
  mods: { aimAssistRad: 0.06 },
};

export const headhunter: RewireDef = {
  id: "headhunter",
  name: "Headhunter",
  description: "Headshots deal +60% damage.",
  rarity: "rare",
  mods: { headshotMul: 1.6 },
};

export const pointBlank: RewireDef = {
  id: "point-blank",
  name: "Point Blank",
  description: "+40% damage to enemies within 6m.",
  rarity: "common",
  mods: { pointBlankMul: 1.4 },
};

export const longShot: RewireDef = {
  id: "long-shot",
  name: "Long Shot",
  description: "+30% damage to enemies beyond 20m.",
  rarity: "common",
  mods: { longShotMul: 1.3 },
};

export const executioner: RewireDef = {
  id: "executioner",
  name: "Executioner",
  description: "+50% damage to enemies below 35% health.",
  rarity: "rare",
  mods: { executeMul: 1.5 },
};

export const afterburn: RewireDef = {
  id: "afterburn",
  name: "Afterburn",
  description: "Your hits set enemies burning for 15 damage over 3s.",
  rarity: "rare",
  mods: { afterburnDamage: 15 },
};

export const ricochet: RewireDef = {
  id: "ricochet",
  name: "Ricochet",
  description: "Bullets bounce once off walls (75% damage after the bounce).",
  rarity: "rare",
  mods: { ricochets: 1 },
};

export const bigBoom: RewireDef = {
  id: "big-boom",
  name: "Big Boom",
  description: "+40% explosion radius (rocket jumps too).",
  rarity: "common",
  mods: { splashRadiusMul: 1.4 },
};

export const clusterBomb: RewireDef = {
  id: "cluster-bomb",
  name: "Cluster Bomb",
  description: "Rockets burst into 3 extra bomblets on impact.",
  rarity: "wild",
  mods: { clusterBombs: 1 },
};

export const thickSkin: RewireDef = {
  id: "thick-skin",
  name: "Thick Skin",
  description: "Take 15% less damage.",
  rarity: "common",
  maxStacks: 2,
  mods: { damageTakenMul: 0.85 },
};

export const regenerator: RewireDef = {
  id: "regenerator",
  name: "Regenerator",
  description: "Heal 5 HP/s after 3s without taking damage.",
  rarity: "common",
  mods: { regenPerSec: 5 },
};

export const secondWind: RewireDef = {
  id: "second-wind",
  name: "Second Wind",
  description: "Once per life, a killing hit leaves you at 1 HP.",
  rarity: "rare",
  mods: { secondWinds: 1 },
};

export const featherFall: RewireDef = {
  id: "feather-fall",
  name: "Feather Fall",
  description: "Fall 40% slower.",
  rarity: "common",
  mods: { fallGravityMul: 0.6 },
};

export const airDash: RewireDef = {
  id: "air-dash",
  name: "Air Dash",
  description: "Right-click to dash the way you're moving (3s cooldown).",
  rarity: "rare",
  mods: { airDashes: 1 },
};

export const adrenaline: RewireDef = {
  id: "adrenaline",
  name: "Adrenaline",
  description: "Each kill gives +30% speed for 3s.",
  rarity: "rare",
  onKill: (ctx) => ctx.boost(ctx.killer, ADRENALINE_MS),
};

export const scavenger: RewireDef = {
  id: "scavenger",
  name: "Scavenger",
  description: "Kills refill your current magazine.",
  rarity: "common",
  onKill: (ctx) => ctx.refillMagazine(ctx.killer),
};

export const radar: RewireDef = {
  id: "radar",
  name: "Radar",
  description: "See enemies through walls within 15m.",
  rarity: "rare",
  mods: { radarRange: 15 },
};

export const copycat: RewireDef = {
  id: "copycat",
  name: "Copycat",
  description: "Kills have a 20% chance to copy one of your victim's Rewires.",
  rarity: "rare",
  onKill: (ctx) => {
    if (ctx.random() < COPYCAT_CHANCE) ctx.copyRewire(ctx.killer, ctx.victim);
  },
};

export const gambler: RewireDef = {
  id: "gambler",
  name: "Gambler",
  description: "Immediately gain 2 more random Rewires. Could be anything.",
  rarity: "wild",
  onPick: (ctx) => ctx.grantRandom(ctx.player, 2),
};
