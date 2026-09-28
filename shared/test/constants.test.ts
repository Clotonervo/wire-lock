import { describe, expect, it } from "vitest";
import { PATCH_RATE_MS, TICK_MS, TICK_RATE_HZ } from "../src";

describe("constants", () => {
  it("derives the tick duration from the tick rate", () => {
    expect(TICK_MS * TICK_RATE_HZ).toBeCloseTo(1000);
  });

  it("patches no faster than the simulation ticks", () => {
    expect(PATCH_RATE_MS).toBeGreaterThanOrEqual(TICK_MS);
  });
});
