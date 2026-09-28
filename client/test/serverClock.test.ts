import { describe, expect, it } from "vitest";
import { ServerClock } from "../src/net/serverClock";

describe("ServerClock", () => {
  it("is unknown until the first sample", () => {
    expect(new ServerClock().now(0)).toBeNull();
  });

  it("maps local time onto server time", () => {
    const c = new ServerClock();
    c.sample(1000, 5000);
    expect(c.now(5100)).toBe(1100);
  });

  it("averages out jitter", () => {
    const c = new ServerClock();
    // Server time advances 50 ms per patch; arrivals wobble by ±15 ms around a -4000 ms offset.
    for (let i = 0; i < 200; i++) {
      const server = i * 50;
      const jitter = i % 2 === 0 ? 15 : -15;
      c.sample(server, server + 4000 + jitter);
    }
    const est = c.now(10_000 + 4000) ?? 0;
    expect(Math.abs(est - 10_000)).toBeLessThan(3);
  });

  it("resets after a big jump instead of slowly drifting", () => {
    const c = new ServerClock();
    c.sample(0, 0);
    c.sample(10_000, 1000);
    expect(c.now(1000)).toBe(10_000);
  });
});
