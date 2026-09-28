import { describe, expect, it } from "vitest";
import { aimDirection, rayBox, rayBoxes } from "../src";
import type { Box } from "../src";

const unitBox: Box = { min: { x: -1, y: -1, z: -11 }, max: { x: 1, y: 1, z: -9 } };
const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

describe("aimDirection", () => {
  it("looks down -Z at yaw 0, pitch 0", () => {
    const d = aimDirection(0, 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it("looks up with positive pitch and left with positive yaw", () => {
    expect(aimDirection(0, Math.PI / 2).y).toBeCloseTo(1);
    expect(aimDirection(Math.PI / 2, 0).x).toBeCloseTo(-1);
  });

  it("matches movement's forward direction", () => {
    const d = aimDirection(0.7, 0);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(-Math.sin(0.7));
    expect(d.z).toBeCloseTo(-Math.cos(0.7));
  });
});

describe("rayBox", () => {
  it("returns the entry distance", () => {
    expect(rayBox(origin, forward, unitBox, 100)).toBeCloseTo(9);
  });

  it("misses boxes off to the side or behind", () => {
    expect(rayBox(origin, { x: 1, y: 0, z: 0 }, unitBox, 100)).toBeNull();
    expect(rayBox(origin, { x: 0, y: 0, z: 1 }, unitBox, 100)).toBeNull();
  });

  it("respects max distance", () => {
    expect(rayBox(origin, forward, unitBox, 5)).toBeNull();
  });

  it("hits at 0 when starting inside", () => {
    expect(rayBox({ x: 0, y: 0, z: -10 }, forward, unitBox, 100)).toBe(0);
  });

  it("handles axis-parallel rays that graze past", () => {
    expect(rayBox({ x: 2, y: 0, z: 0 }, forward, unitBox, 100)).toBeNull();
  });
});

describe("rayBoxes", () => {
  it("returns the nearest hit, or max distance", () => {
    const near: Box = { min: { x: -1, y: -1, z: -4 }, max: { x: 1, y: 1, z: -3 } };
    expect(rayBoxes(origin, forward, [unitBox, near], 100)).toBeCloseTo(3);
    expect(rayBoxes(origin, { x: 1, y: 0, z: 0 }, [unitBox, near], 100)).toBe(100);
  });
});
