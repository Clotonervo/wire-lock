import { describe, expect, it } from "vitest";
import { MAX_EXTRAPOLATION_MS } from "@wire-lock/shared";
import { SnapshotBuffer } from "../src/net/interpolation";

function snap(t: number, x: number, yaw = 0, visible = true) {
  return { t, pos: { x, y: 0, z: 0 }, yaw, pitch: 0, visible };
}

describe("SnapshotBuffer", () => {
  it("returns null when empty", () => {
    expect(new SnapshotBuffer().sample(0)).toBeNull();
  });

  it("interpolates between surrounding snapshots", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0));
    b.push(snap(100, 10));
    expect(b.sample(25)?.pos.x).toBeCloseTo(2.5);
  });

  it("holds the oldest snapshot before the buffer starts", () => {
    const b = new SnapshotBuffer();
    b.push(snap(100, 5));
    b.push(snap(200, 6));
    expect(b.sample(50)?.pos.x).toBe(5);
  });

  it("extrapolates for at most one tick past the newest snapshot, then freezes", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0));
    b.push(snap(100, 10)); // 0.1 units per ms
    const slightly = b.sample(110);
    expect(slightly?.pos.x).toBeCloseTo(11);
    const far = b.sample(10_000);
    expect(far?.pos.x).toBeCloseTo(10 + MAX_EXTRAPOLATION_MS * 0.1);
  });

  it("ignores out-of-order snapshots", () => {
    const b = new SnapshotBuffer();
    b.push(snap(100, 1));
    b.push(snap(50, 99));
    expect(b.size).toBe(1);
  });

  it("holds position instead of sliding across a death or respawn", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0, 0, false));
    b.push(snap(100, 50, 0, true));
    const mid = b.sample(50);
    expect(mid?.pos.x).toBe(0);
    expect(mid?.visible).toBe(false);
    expect(b.sample(100)?.visible).toBe(true);
  });

  it("doesn't extrapolate a hidden player", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0, 0, true));
    b.push(snap(100, 10, 0, false));
    expect(b.sample(130)?.pos.x).toBe(10);
  });

  it("interpolates yaw the short way across ±π", () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, 0, Math.PI - 0.1));
    b.push(snap(100, 0, -Math.PI + 0.1));
    const yaw = b.sample(50)?.yaw ?? 0;
    expect(Math.abs(Math.cos(yaw) + 1)).toBeLessThan(1e-9);
  });
});
