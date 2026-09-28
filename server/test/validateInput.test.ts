import { describe, expect, it } from "vitest";
import { MAX_PITCH, TICK_DT } from "@wire-lock/shared";
import { sanitizeInput } from "../src/sim/validateInput";

const valid = {
  seq: 5,
  dt: TICK_DT,
  move: { x: 1, z: -1 },
  jump: true,
  yaw: 0.5,
  pitch: -0.2,
  fire: false,
  altFire: false,
};

describe("sanitizeInput", () => {
  it("accepts a well-formed command", () => {
    expect(sanitizeInput(valid)).toEqual(valid);
  });

  it.each([
    ["non-object", 42],
    ["null", null],
    ["missing move", { ...valid, move: undefined }],
    ["fractional seq", { ...valid, seq: 1.5 }],
    ["negative seq", { ...valid, seq: -1 }],
    ["wrong dt", { ...valid, dt: 0.5 }],
    ["NaN yaw", { ...valid, yaw: Number.NaN }],
    ["infinite pitch", { ...valid, pitch: Infinity }],
    ["move out of range", { ...valid, move: { x: 2, z: 0 } }],
    ["move as string", { ...valid, move: { x: "1", z: 0 } }],
  ])("rejects %s", (_, raw) => {
    expect(sanitizeInput(raw)).toBeNull();
  });

  it("clamps pitch and wraps yaw", () => {
    const cmd = sanitizeInput({ ...valid, pitch: 5, yaw: 3 * Math.PI });
    expect(cmd?.pitch).toBe(MAX_PITCH);
    expect(cmd?.yaw).toBeCloseTo(Math.PI);
  });

  it("treats non-boolean flags as false and drops unknown fields", () => {
    const cmd = sanitizeInput({ ...valid, jump: "yes", fire: 1, extra: "nope" });
    expect(cmd?.jump).toBe(false);
    expect(cmd?.fire).toBe(false);
    expect(cmd).not.toHaveProperty("extra");
  });
});
