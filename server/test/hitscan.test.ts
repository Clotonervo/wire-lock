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
