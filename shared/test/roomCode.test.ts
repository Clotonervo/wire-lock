import { describe, expect, it } from "vitest";
import { normalizeRoomCode } from "../src";

describe("normalizeRoomCode", () => {
  it("accepts codes in any case, with surrounding spaces", () => {
    expect(normalizeRoomCode(" kqzx ")).toBe("KQZX");
  });

  it("rejects wrong lengths and look-alike or non-letter characters", () => {
    expect(normalizeRoomCode("KQZ")).toBeNull();
    expect(normalizeRoomCode("KQZXY")).toBeNull();
    expect(normalizeRoomCode("KQZO")).toBeNull();
    expect(normalizeRoomCode("KQ1X")).toBeNull();
  });
});
