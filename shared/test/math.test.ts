import { describe, expect, it } from "vitest";
import { lerpAngle, wrapAngle } from "../src";

describe("wrapAngle", () => {
  it("wraps into (-π, π]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });
});

describe("lerpAngle", () => {
  it("takes the short way round across ±π", () => {
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(wrapAngle(mid))).toBeCloseTo(Math.PI);
  });
});
