import { describe, expect, it } from "vitest";
import { applySpread, seededRng } from "../src";

describe("seededRng", () => {
  it("is repeatable for the same seed and differs for others", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it("stays in [0, 1)", () => {
    const r = seededRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("applySpread", () => {
  const dir = { x: 0, y: 0, z: -1 };

  it("leaves the direction alone with no spread", () => {
    expect(applySpread(dir, 0, seededRng(1))).toEqual(dir);
  });

  it("stays unit length and within the cone", () => {
    const r = seededRng(7);
    const spread = 0.1;
    for (let i = 0; i < 500; i++) {
      const d = applySpread(dir, spread, r);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
      const angle = Math.acos(-d.z);
      expect(angle).toBeLessThanOrEqual(spread + 1e-9);
    }
  });

  it("works when aiming straight up", () => {
    const d = applySpread({ x: 0, y: 1, z: 0 }, 0.05, seededRng(3));
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(d.y).toBeGreaterThan(0.99);
  });
});
