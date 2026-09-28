import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, PLAYER_HEIGHT, PLAYER_WIDTH, boxesOverlap, movePlayer, playerBox } from "../src";
import type { Box } from "../src";

const floor: Box = { min: { x: -10, y: -1, z: -10 }, max: { x: 10, y: 0, z: 10 } };
const wall: Box = { min: { x: 2, y: 0, z: -10 }, max: { x: 2.1, y: 3, z: 10 } };
const half = PLAYER_WIDTH / 2;

describe("playerBox", () => {
  it("builds an AABB around the feet position", () => {
    const b = playerBox({ x: 1, y: 2, z: 3 });
    expect(b.min).toEqual({ x: 1 - half, y: 2, z: 3 - half });
    expect(b.max).toEqual({ x: 1 + half, y: 2 + PLAYER_HEIGHT, z: 3 + half });
  });
});

describe("movePlayer", () => {
  it("moves freely when nothing is in the way", () => {
    const r = movePlayer({ x: 0, y: 1, z: 0 }, { x: 0.5, y: 0, z: -0.25 }, [floor]);
    expect(r.pos).toEqual({ x: 0.5, y: 1, z: -0.25 });
    expect(r.hit).toEqual({ x: false, y: false, z: false });
  });

  it("stops on the floor when falling", () => {
    const r = movePlayer({ x: 0, y: 0.1, z: 0 }, { x: 0, y: -0.5, z: 0 }, [floor]);
    expect(r.pos.y).toBeCloseTo(COLLISION_SKIN);
    expect(r.hit.y).toBe(true);
  });

  it("stays put when already resting on the floor", () => {
    const r = movePlayer({ x: 0, y: COLLISION_SKIN, z: 0 }, { x: 0, y: -0.02, z: 0 }, [floor]);
    expect(r.pos.y).toBeCloseTo(COLLISION_SKIN);
    expect(r.hit.y).toBe(true);
  });

  it("blocks at a wall without tunnelling, even at huge speed", () => {
    const start = { x: 0, y: COLLISION_SKIN, z: 0 };
    const r = movePlayer(start, { x: 50, y: 0, z: 0 }, [floor, wall]);
    expect(r.pos.x).toBeCloseTo(wall.min.x - half - COLLISION_SKIN);
    expect(r.hit.x).toBe(true);
    expect(boxesOverlap(playerBox(r.pos), wall)).toBe(false);
  });

  it("slides along a wall: the blocked axis stops, the other keeps going", () => {
    const start = { x: 1.5, y: COLLISION_SKIN, z: 0 };
    const r = movePlayer(start, { x: 1, y: 0, z: 1 }, [floor, wall]);
    expect(r.hit.x).toBe(true);
    expect(r.hit.z).toBe(false);
    expect(r.pos.z).toBeCloseTo(1);
  });

  it("lets a player that starts inside a box move out of it", () => {
    const r = movePlayer({ x: 2, y: COLLISION_SKIN, z: 0 }, { x: -1, y: 0, z: 0 }, [floor, wall]);
    expect(r.pos.x).toBeCloseTo(1);
    expect(r.hit.x).toBe(false);
  });

  it("walks under an overhang that is higher than the player", () => {
    const overhang: Box = { min: { x: 1, y: PLAYER_HEIGHT + 0.1, z: -1 }, max: { x: 3, y: 3, z: 1 } };
    const r = movePlayer({ x: 0, y: COLLISION_SKIN, z: 0 }, { x: 2, y: 0, z: 0 }, [floor, overhang]);
    expect(r.pos.x).toBeCloseTo(2);
  });
});
