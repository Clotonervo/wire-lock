import { describe, expect, it } from "vitest";
import {
  ADRENALINE_SPEED_MUL,
  CLUSTER_COUNT,
  COLLISION_SKIN,
  DASH_COOLDOWN_MS,
  DASH_SPEED,
  MAX_PITCH,
  MAX_SPEED,
  REWIRES,
  TICK_DT,
  TICK_MS,
  blastEffect,
  createArms,
  foldMods,
  rayBoxesHit,
  reflect,
  rocketLauncher,
  stepInput,
  stepPlayer,
  testArena,
} from "../src";
import type { Box, InputCmd, MoveInput, PlayerMoveState, PlayerSim } from "../src";

const grounded: PlayerMoveState = { pos: { x: 8, y: COLLISION_SKIN, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: true };
const idle: MoveInput = { move: { x: 0, z: 0 }, jump: false, yaw: 0 };
const step = (s: PlayerMoveState, i: MoveInput, ids: string[] = []) => stepPlayer(s, i, testArena, TICK_DT, foldMods(ids));

describe("v2 registry", () => {
  it("has all 30 Rewires with unique ids", () => {
    expect(Object.keys(REWIRES)).toHaveLength(30);
  });
});

describe("Feather Fall", () => {
  it("falls slower, but jumps just as high on the way up", () => {
    const air: PlayerMoveState = { pos: { x: 8, y: 10, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: false };
    let normal = air;
    let feather = air;
    for (let i = 0; i < 15; i++) {
      normal = step(normal, idle);
      feather = step(feather, idle, ["feather-fall"]);
    }
    expect(feather.pos.y).toBeGreaterThan(normal.pos.y);
    const up = { ...air, vel: { x: 0, y: 5, z: 0 } };
    expect(step(up, idle, ["feather-fall"]).vel.y).toBeCloseTo(step(up, idle).vel.y);
  });
});

describe("Air Dash", () => {
  const dash: MoveInput = { ...idle, altFire: true };

  it("does nothing without the Rewire", () => {
    expect(step(grounded, dash).vel.z).toBe(0);
  });

  it("dashes forward on a fresh press, then cools down", () => {
    let s = step(grounded, dash, ["air-dash"]);
    expect(s.vel.z).toBeCloseTo(-DASH_SPEED);
    expect(s.dashCooldownMs).toBe(DASH_COOLDOWN_MS);
    // Holding doesn't re-dash; a fresh press during cooldown doesn't either.
    s = step({ ...s, vel: { x: 0, y: 0, z: 0 } }, dash, ["air-dash"]);
    s = step(s, idle, ["air-dash"]);
    s = step(s, dash, ["air-dash"]);
    expect(Math.abs(s.vel.z)).toBeLessThan(DASH_SPEED / 2);
    // After the cooldown it works again.
    for (let i = 0; i < Math.ceil(DASH_COOLDOWN_MS / TICK_MS); i++) s = step(s, idle, ["air-dash"]);
    expect(step(s, dash, ["air-dash"]).vel.z).toBeCloseTo(-DASH_SPEED);
  });
});

describe("Adrenaline boost", () => {
  it("raises top speed while it lasts, then wears off", () => {
    const fwd: MoveInput = { move: { x: 0, z: 1 }, jump: false, yaw: 0 };
    let s: PlayerMoveState = { ...grounded, boostMs: 10_000 };
    for (let i = 0; i < 40; i++) s = step(s, fwd);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MAX_SPEED * ADRENALINE_SPEED_MUL, 1);
    s = { ...s, boostMs: 0 };
    for (let i = 0; i < 40; i++) s = step(s, fwd);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MAX_SPEED, 1);
  });
});

describe("explosion Rewires", () => {
  const cmd = (seq: number, over: Partial<InputCmd> = {}): InputCmd => ({
    seq, dt: TICK_DT, move: { x: 0, z: 0 }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false, reload: false, ...over,
  });
  const sim = (ids: string[]): PlayerSim => {
    const mods = foldMods(ids);
    return { move: grounded, arms: createArms(["rocket"], mods), alive: true, mods };
  };

  it("Big Boom reaches further", () => {
    const far = { x: 8 + 4, y: 1, z: 12 };
    expect(blastEffect(far, grounded.pos, rocketLauncher, [])).toBeNull();
    expect(blastEffect(far, grounded.pos, rocketLauncher, [], 1.4)).not.toBeNull();
  });

  it("Cluster Bomb adds bomblets around each rocket explosion, and rocket jumps stay deterministic", () => {
    const run = () => {
      let s = sim(["cluster-bomb"]);
      let p = [] as ReturnType<typeof stepInput>["projectiles"];
      let bursts = 0;
      for (let i = 0; i < 20; i++) {
        const r = stepInput(s, p, cmd(i, { fire: i === 0, pitch: -MAX_PITCH }), testArena, { canFire: true, targets: [] });
        s = r.sim;
        p = r.projectiles;
        bursts += r.explosions.length;
      }
      return { s, bursts };
    };
    const a = run();
    expect(a.bursts).toBe(1 + CLUSTER_COUNT);
    expect(run()).toEqual(a);
  });
});

describe("ricochet geometry", () => {
  const wall: Box = { min: { x: -5, y: 0, z: -10 }, max: { x: 5, y: 4, z: -9 } };

  it("reports the face normal it hit, and reflects off it", () => {
    // Angled so it reaches the wall's face (x stays within the wall's width).
    const len = Math.hypot(0.3, 0.95);
    const dir = { x: 0.3 / len, y: 0, z: -0.95 / len };
    const hit = rayBoxesHit({ x: 0, y: 1, z: 0 }, dir, [wall], 100);
    expect(hit.normal).toEqual({ x: 0, y: 0, z: 1 });
    const out = reflect(dir, hit.normal!);
    expect(out.x).toBeCloseTo(dir.x);
    expect(out.z).toBeCloseTo(-dir.z);
  });

  it("has no normal when nothing is hit", () => {
    expect(rayBoxesHit({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [wall], 100).normal).toBeNull();
  });
});
