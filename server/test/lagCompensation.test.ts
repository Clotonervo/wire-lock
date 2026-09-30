import { describe, expect, it } from "vitest";
import { MAX_REWIND_MS, TICK_MS } from "@wire-lock/shared";
import { PositionHistory, rewindTime } from "../src/sim/lagCompensation";

function history(): PositionHistory {
  const h = new PositionHistory();
  // A player walking along x at one unit per tick, from tick 10 to 30.
  for (let tick = 10; tick <= 30; tick++) h.record(tick, "p", { x: tick, y: 0, z: 0 }, true);
  return h;
}

describe("PositionHistory", () => {
  it("returns where the player was at a past time, between ticks", () => {
    expect(history().at("p", 20.5 * TICK_MS)?.x).toBeCloseTo(20.5);
  });

  it("clamps to the oldest and newest samples it has", () => {
    const h = history();
    expect(h.at("p", 100 * TICK_MS)?.x).toBe(30);
    expect(h.at("p", 0)?.x).toBeGreaterThanOrEqual(10);
  });

  it("isn't hittable while it was dead in that part of the timeline", () => {
    const h = new PositionHistory();
    h.record(1, "p", { x: 0, y: 0, z: 0 }, false);
    h.record(2, "p", { x: 5, y: 0, z: 0 }, true);
    h.record(3, "p", { x: 5, y: 0, z: 0 }, true);
    expect(h.at("p", 1.5 * TICK_MS)).toBeNull();
    expect(h.at("p", 2.5 * TICK_MS)?.x).toBe(5);
  });

  it("forgets players who leave, and only keeps a short window", () => {
    const h = history();
    h.remove("p");
    expect(h.at("p", 20 * TICK_MS)).toBeNull();

    const long = new PositionHistory();
    for (let tick = 0; tick < 200; tick++) long.record(tick, "p", { x: tick, y: 0, z: 0 }, true);
    // Asking for tick 0 gives the oldest kept sample, well after it.
    expect(long.at("p", 0)?.x).toBeGreaterThan(200 - MAX_REWIND_MS / TICK_MS - 5);
  });
});

describe("rewindTime", () => {
  it("uses the client's view time inside the window", () => {
    expect(rewindTime(900, 1000)).toBe(900);
  });

  it("never rewinds further than the limit, or into the future", () => {
    expect(rewindTime(0, 1000)).toBe(1000 - MAX_REWIND_MS);
    expect(rewindTime(5000, 1000)).toBe(1000);
  });

  it("uses the present when the client sent nothing", () => {
    expect(rewindTime(undefined, 1000)).toBe(1000);
  });
});
