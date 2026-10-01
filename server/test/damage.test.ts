import { describe, expect, it } from "vitest";
import { DEFAULT_MODS, foldMods } from "@wire-lock/shared";
import { scaleDamage } from "../src/sim/damage";

const mid = { dist: 10, headshot: false, targetHealth: 100, targetMaxHealth: 100 };
const scale = (attacker: string[] | null, target: string[], over: Partial<typeof mid> = {}) =>
  scaleDamage(100, attacker ? foldMods(attacker) : null, foldMods(target), { ...mid, ...over });

describe("scaleDamage", () => {
  it("leaves damage alone with no Rewires", () => {
    expect(scaleDamage(25, DEFAULT_MODS, DEFAULT_MODS, mid)).toBe(25);
  });

  it("Hollow Points and Glass Cannon multiply, and stack", () => {
    expect(scale(["hollow-points"], [])).toBeCloseTo(120);
    expect(scale(["hollow-points", "hollow-points"], [])).toBeCloseTo(144);
    expect(scale(["glass-cannon"], [])).toBeCloseTo(200);
  });

  it("Headhunter only boosts headshots", () => {
    expect(scale(["headhunter"], [])).toBeCloseTo(100);
    expect(scale(["headhunter"], [], { headshot: true })).toBeCloseTo(160);
  });

  it("Point Blank and Long Shot depend on distance", () => {
    expect(scale(["point-blank"], [], { dist: 5 })).toBeCloseTo(140);
    expect(scale(["point-blank"], [], { dist: 7 })).toBeCloseTo(100);
    expect(scale(["long-shot"], [], { dist: 25 })).toBeCloseTo(130);
    expect(scale(["long-shot"], [], { dist: 15 })).toBeCloseTo(100);
  });

  it("Executioner only against weakened targets", () => {
    expect(scale(["executioner"], [], { targetHealth: 30 })).toBeCloseTo(150);
    expect(scale(["executioner"], [], { targetHealth: 60 })).toBeCloseTo(100);
  });

  it("Thick Skin reduces damage taken, even from yourself or the world", () => {
    expect(scale([], ["thick-skin"])).toBeCloseTo(85);
    expect(scale(null, ["thick-skin", "thick-skin"])).toBeCloseTo(72.25);
  });

  it("attacker bonuses don't apply to self-damage", () => {
    expect(scale(null, [], { headshot: true, dist: 0 })).toBe(100);
  });
});
