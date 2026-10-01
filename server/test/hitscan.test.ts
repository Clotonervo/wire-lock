import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, PLAYER_WIDTH } from "@wire-lock/shared";
import type { Box } from "@wire-lock/shared";
import { resolveHitscan } from "../src/sim/hitscan";

const eye = { x: 0, y: 1.6, z: 0 };
const forward = { x: 0, y: 0, z: -1 };
const wall: Box = { min: { x: -5, y: 0, z: -10 }, max: { x: 5, y: 4, z: -9 } };

describe("resolveHitscan", () => {
  it("hits the nearest player in front of the wall", () => {
    const r = resolveHitscan(eye, forward, 100, [wall], [
      { id: "far", pos: { x: 0, y: COLLISION_SKIN, z: -8 } },
      { id: "near", pos: { x: 0, y: COLLISION_SKIN, z: -4 } },
    ]);
    expect(r.target).toBe("near");
    expect(r.dist).toBeCloseTo(4 - PLAYER_WIDTH / 2);
  });

  it("is blocked by the wall", () => {
    const r = resolveHitscan(eye, forward, 100, [wall], [{ id: "behind", pos: { x: 0, y: 0, z: -12 } }]);
    expect(r.target).toBeNull();
    expect(r.dist).toBeCloseTo(9);
    expect(r.end.z).toBeCloseTo(-9);
  });

  it("misses players off to the side and stops at max range", () => {
    const r = resolveHitscan(eye, forward, 5, [], [{ id: "side", pos: { x: 3, y: 0, z: -3 } }]);
    expect(r.target).toBeNull();
    expect(r.dist).toBe(5);
  });

  it("shoots over a low wall at a player behind it", () => {
    const lowWall: Box = { min: { x: -5, y: 0, z: -3 }, max: { x: 5, y: 1, z: -2.5 } };
    const r = resolveHitscan(eye, forward, 100, [lowWall], [{ id: "p", pos: { x: 0, y: 0, z: -6 } }]);
    expect(r.target).toBe("p");
  });
});

describe("resolveHitscan with Magnetic Rounds", () => {
  const nearMiss = { x: 0.06, y: 0, z: -1 }; // ~3.4° off to the side of a target 6 units ahead
  const len = Math.hypot(nearMiss.x, nearMiss.z);
  const dir = { x: nearMiss.x / len, y: 0, z: nearMiss.z / len };
  const target = [{ id: "p", pos: { x: -0.35, y: 0, z: -6 } }];

  it("misses without assist", () => {
    expect(resolveHitscan(eye, dir, 100, [], target).target).toBeNull();
  });

  it("bends a near miss at head height into the closest player within the angle", () => {
    const r = resolveHitscan(eye, dir, 100, [], [...target, { id: "far", pos: { x: 3, y: 0, z: -6 } }], 0.12);
    expect(r.target).toBe("p");
  });

  it("won't bend through walls", () => {
    const between: Box = { min: { x: -2, y: 0, z: -4 }, max: { x: -0.1, y: 4, z: -3.5 } };
    expect(resolveHitscan(eye, dir, 100, [between], target, 0.12).target).toBeNull();
  });
});
