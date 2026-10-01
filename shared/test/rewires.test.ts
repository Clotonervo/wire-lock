import { describe, expect, it } from "vitest";
import {
  COLLISION_SKIN,
  DEFAULT_MODS,
  MAX_PITCH,
  MAX_SPEED,
  REWIRES,
  REWIRE_OFFER_SIZE,
  TICK_DT,
  createArms,
  foldMods,
  magazineSize,
  pistol,
  rollOffer,
  seededRng,
  stepArms,
  stepInput,
  stepPlayer,
  testArena,
} from "../src";
import type { InputCmd, MoveInput, PlayerMoveState, PlayerSim, Projectile } from "../src";

function cmd(seq: number, over: Partial<InputCmd> = {}): InputCmd {
  return { seq, dt: TICK_DT, move: { x: 0, z: 0 }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false, reload: false, ...over };
}

const grounded: PlayerMoveState = { pos: { x: 8, y: COLLISION_SKIN, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: true };

describe("foldMods", () => {
  it("is the defaults with no Rewires", () => {
    expect(foldMods([])).toEqual(DEFAULT_MODS);
  });

  it("multiplies multipliers and adds additions, per stack", () => {
    const m = foldMods(["overclock", "overclock", "plating", "spring-heels"]);
    expect(m.moveSpeedMul).toBeCloseTo(1.25 * 1.25);
    expect(m.maxHealthAdd).toBe(40);
    expect(m.airJumps).toBe(1);
  });

  it("ignores unknown ids", () => {
    expect(foldMods(["not-a-rewire"])).toEqual(DEFAULT_MODS);
  });
});

describe("rollOffer", () => {
  it("offers distinct Rewires", () => {
    const offer = rollOffer([], seededRng(1));
    expect(offer).toHaveLength(REWIRE_OFFER_SIZE);
    expect(new Set(offer).size).toBe(REWIRE_OFFER_SIZE);
  });

  it("never offers something you've maxed out", () => {
    const owned = ["split-shot", "overclock", "overclock"];
    for (let seed = 1; seed < 200; seed++) {
      const offer = rollOffer(owned, seededRng(seed));
      expect(offer).not.toContain("split-shot");
      expect(offer).not.toContain("overclock");
    }
  });

  it("is repeatable for a seed, and favours commons", () => {
    expect(rollOffer([], seededRng(5))).toEqual(rollOffer([], seededRng(5)));
    const counts = { common: 0, rare: 0, wild: 0 };
    for (let seed = 1; seed < 500; seed++) counts[REWIRES[rollOffer([], seededRng(seed))[0]!]!.rarity]++;
    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.wild);
  });
});

describe("movement mods", () => {
  const run = (s: PlayerMoveState, inputs: MoveInput[], mods = DEFAULT_MODS) =>
    inputs.reduce((st, i) => stepPlayer(st, i, testArena, TICK_DT, mods), s);

  it("Overclock raises top speed", () => {
    const fwd: MoveInput = { move: { x: 0, z: 1 }, jump: false, yaw: 0 };
    const s = run(grounded, Array(30).fill(fwd), foldMods(["overclock"]));
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MAX_SPEED * 1.25, 1);
  });

  it("Spring Heels gives one mid-air jump, which needs a fresh press", () => {
    const mods = foldMods(["spring-heels"]);
    const jump: MoveInput = { move: { x: 0, z: 0 }, jump: true, yaw: 0 };
    const idle: MoveInput = { move: { x: 0, z: 0 }, jump: false, yaw: 0 };
    // Holding jump: takes off, but doesn't spend the air jump.
    let s = run(grounded, [jump, jump, jump, jump], mods);
    expect(s.airJumpsUsed).toBe(0);
    // Release then press again in the air: jumps.
    const before = s.vel.y;
    s = run(s, [idle, jump], mods);
    expect(s.airJumpsUsed).toBe(1);
    expect(s.vel.y).toBeGreaterThan(before);
    // No third jump.
    const vy = s.vel.y;
    s = run(s, [idle, jump], mods);
    expect(s.airJumpsUsed).toBe(1);
    expect(s.vel.y).toBeLessThan(vy);
  });

  it("without Spring Heels there's no mid-air jump", () => {
    const jump: MoveInput = { move: { x: 0, z: 0 }, jump: true, yaw: 0 };
    const idle: MoveInput = { move: { x: 0, z: 0 }, jump: false, yaw: 0 };
    const s = run(grounded, [jump, idle, idle, jump]);
    expect(s.airJumpsUsed).toBe(0);
  });
});

describe("weapon mods", () => {
  it("Deep Mags enlarges magazines; Hair Trigger fires faster", () => {
    const mods = foldMods(["deep-mags", "hair-trigger"]);
    expect(magazineSize(pistol, mods)).toBe(18);
    expect(createArms(["pistol"], mods).ammo[0]).toBe(18);
    const r = stepArms(createArms(["pistol"], mods), cmd(0, { fire: true }), true, mods);
    expect(r.arms.cooldownMs).toBeCloseTo(pistol.fireIntervalMs * 0.75);
  });
});

describe("stepInput with Rewires", () => {
  const sim = (ids: string[]): PlayerSim => {
    const mods = foldMods(ids);
    return { move: grounded, arms: createArms(["rocket"], mods), alive: true, mods };
  };

  it("Split Shot fires two rockets with distinct ids, fanned apart", () => {
    const r = stepInput(sim(["split-shot"]), [], cmd(0, { fire: true }), testArena, { canFire: true, targets: [] });
    expect(r.spawned.map((p) => p.sub)).toEqual([0, 1]);
    const [a, b] = r.spawned;
    expect(Math.abs((a?.vel.x ?? 0) - (b?.vel.x ?? 0))).toBeGreaterThan(0.5);
  });

  it("Blast Shield rocket jumps go further", () => {
    const jumpHeight = (ids: string[]) => {
      let s = sim(ids);
      let projectiles: Projectile[] = [];
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        const r = stepInput(s, projectiles, cmd(i, { fire: i === 0, jump: i === 0, pitch: -MAX_PITCH }), testArena, { canFire: true, targets: [] });
        s = r.sim;
        projectiles = r.projectiles;
        peak = Math.max(peak, s.move.pos.y);
      }
      return peak;
    };
    expect(jumpHeight(["blast-shield"])).toBeGreaterThan(jumpHeight([]) * 1.3);
  });

  it("stays deterministic with Rewires", () => {
    const cmds = Array.from({ length: 60 }, (_, i) => cmd(i, { fire: i % 15 === 0, jump: i % 7 === 0, move: { x: 0, z: 1 }, yaw: i * 0.03, pitch: -0.4 }));
    const run = () => {
      let s = sim(["split-shot", "spring-heels", "overclock", "blast-shield"]);
      let p: Projectile[] = [];
      for (const c of cmds) {
        const r = stepInput(s, p, c, testArena, { canFire: true, targets: [] });
        s = r.sim;
        p = r.projectiles;
      }
      return { s, p };
    };
    expect(run()).toEqual(run());
  });
});
