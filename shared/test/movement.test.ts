import { describe, expect, it } from "vitest";
import {
  COLLISION_SKIN,
  JUMP_SPEED,
  MAX_SPEED,
  TICK_DT,
  stepPlayer,
  testArena,
  wishDirection,
} from "../src";
import type { MoveInput, PlayerMoveState } from "../src";

const idle: MoveInput = { move: { x: 0, z: 0 }, jump: false, yaw: 0 };
const forward: MoveInput = { move: { x: 0, z: 1 }, jump: false, yaw: 0 };

function grounded(x = 0, z = 12): PlayerMoveState {
  return { pos: { x, y: COLLISION_SKIN, z }, vel: { x: 0, y: 0, z: 0 }, onGround: true };
}

function run(state: PlayerMoveState, input: MoveInput, ticks: number): PlayerMoveState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = stepPlayer(s, input, testArena, TICK_DT);
  return s;
}

describe("wishDirection", () => {
  it("points down -Z for forward at yaw 0", () => {
    const d = wishDirection(forward);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it("points +X for strafe right at yaw 0", () => {
    const d = wishDirection({ ...idle, move: { x: 1, z: 0 } });
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
  });

  it("turns left with positive yaw", () => {
    const d = wishDirection({ ...forward, yaw: Math.PI / 2 });
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
  });

  it("normalises diagonals so they aren't faster", () => {
    const d = wishDirection({ ...idle, move: { x: 1, z: 1 } });
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
});

describe("stepPlayer", () => {
  it("stays still on the ground with no input", () => {
    const s = run(grounded(), idle, 30);
    expect(s.pos.x).toBeCloseTo(0);
    expect(s.pos.y).toBeCloseTo(COLLISION_SKIN);
    expect(s.pos.z).toBeCloseTo(12);
    expect(s.onGround).toBe(true);
  });

  it("accelerates forward up to max speed and no further", () => {
    const s = run(grounded(), forward, 30);
    expect(s.vel.z).toBeLessThan(0);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MAX_SPEED, 1);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
  });

  it("stops quickly once input is released", () => {
    const moving = run(grounded(), forward, 30);
    const stopped = run(moving, idle, 15);
    expect(Math.hypot(stopped.vel.x, stopped.vel.z)).toBe(0);
  });

  it("jumps only from the ground and lands again", () => {
    const jump: MoveInput = { ...idle, jump: true };
    const s1 = stepPlayer(grounded(), jump, testArena, TICK_DT);
    expect(s1.onGround).toBe(false);
    expect(s1.vel.y).toBeGreaterThan(0);
    expect(s1.vel.y).toBeLessThan(JUMP_SPEED);

    // Holding jump in the air doesn't jump again.
    const s2 = stepPlayer(s1, jump, testArena, TICK_DT);
    expect(s2.vel.y).toBeLessThan(s1.vel.y);

    const landed = run(s2, idle, 60);
    expect(landed.onGround).toBe(true);
    expect(landed.pos.y).toBeCloseTo(COLLISION_SKIN);
  });

  it("jumps high enough to climb a 1-unit crate but not the 2-unit platform", () => {
    const peak = (() => {
      let s = stepPlayer(grounded(), { ...idle, jump: true }, testArena, TICK_DT);
      let max = s.pos.y;
      while (s.vel.y > 0) {
        s = stepPlayer(s, idle, testArena, TICK_DT);
        max = Math.max(max, s.pos.y);
      }
      return max;
    })();
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(2);
  });

  it("falls with gravity when in the air", () => {
    const air: PlayerMoveState = { pos: { x: 0, y: 5, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: false };
    const s = run(air, idle, 5);
    expect(s.pos.y).toBeLessThan(5);
    expect(s.vel.y).toBeLessThan(0);
  });

  it("has only limited air control", () => {
    const air: PlayerMoveState = { pos: { x: 0, y: 10, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: false };
    const inAir = run(air, forward, 5);
    const onGround = run(grounded(), forward, 5);
    expect(Math.abs(inAir.vel.z)).toBeLessThan(Math.abs(onGround.vel.z) / 2);
  });

  it("can't walk through the arena wall", () => {
    const nearWall = grounded(0, 18);
    const s = run(nearWall, { ...idle, move: { x: 0, z: -1 } }, 120);
    expect(s.pos.z).toBeLessThan(20);
  });

  it("is deterministic: the same inputs give identical results", () => {
    const inputs: MoveInput[] = Array.from({ length: 200 }, (_, i) => ({
      move: { x: ((i % 3) - 1) as -1 | 0 | 1, z: (i % 7 < 4 ? 1 : -1) as -1 | 1 },
      jump: i % 23 === 0,
      yaw: i * 0.037,
    }));
    const a = inputs.reduce((s, inp) => stepPlayer(s, inp, testArena, TICK_DT), grounded());
    const b = inputs.reduce((s, inp) => stepPlayer(s, inp, testArena, TICK_DT), grounded());
    expect(a).toEqual(b);
  });

  it("does not mutate its input state", () => {
    const s = grounded();
    const copy = JSON.parse(JSON.stringify(s)) as PlayerMoveState;
    stepPlayer(s, forward, testArena, TICK_DT);
    expect(s).toEqual(copy);
  });
});
