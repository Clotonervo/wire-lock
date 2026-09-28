import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH } from "@wire-lock/shared";
import { sanitizeName } from "../src/sim/names";

describe("sanitizeName", () => {
  it("keeps a normal name", () => {
    expect(sanitizeName("Sam", "x")).toBe("Sam");
  });

  it("trims and collapses whitespace", () => {
    expect(sanitizeName("   big    sam  ", "x")).toBe("big sam");
  });

  it("strips control, zero-width and bidi characters", () => {
    const nasty = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(0x200b) + "c" + String.fromCharCode(0x202e) + "d";
    expect(sanitizeName(nasty, "x")).toBe("abcd");
  });

  it("limits length without splitting emoji", () => {
    const long = "😀".repeat(MAX_NAME_LENGTH + 5);
    const out = sanitizeName(long, "x");
    expect(Array.from(out)).toHaveLength(MAX_NAME_LENGTH);
    expect(out).toBe("😀".repeat(MAX_NAME_LENGTH));
  });

  it("falls back for non-strings and empty results", () => {
    expect(sanitizeName(undefined, "Player 1")).toBe("Player 1");
    expect(sanitizeName(42, "Player 1")).toBe("Player 1");
    expect(sanitizeName("   ", "Player 1")).toBe("Player 1");
  });
});
