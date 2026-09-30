import { describe, expect, it } from "vitest";
import { GUN_GAME_TOTAL_KILLS } from "@wire-lock/shared";
import { createGunGame } from "../src/sim/modes/gunGame";
import { fakePlayer, fakeRoom } from "./fakeModeRoom";

describe("Gun Game", () => {
  const gg = createGunGame();

  it("starts everyone on the rocket launcher", () => {
    const room = fakeRoom([fakePlayer("a")]);
    expect(gg.loadout(room, "a")).toEqual(["rocket"]);
  });

  it("moves the killer up the ladder after enough kills", () => {
    // The room has already counted the kill when onKill runs.
    const a = fakePlayer("a", { kills: 2, weapons: ["rocket"] });
    const room = fakeRoom([a, fakePlayer("b")]);
    gg.onKill?.(room, "a", "b", "rocket");
    expect(a.weapons).toEqual(["shotgun"]);
  });

  it("stays on the same weapon mid-step", () => {
    const a = fakePlayer("a", { kills: 1, weapons: ["rocket"] });
    gg.onKill?.(fakeRoom([a, fakePlayer("b")]), "a", "b", "rocket");
    expect(a.weapons).toEqual(["rocket"]);
  });

  it("knocks the victim back a kill when they're wrenched", () => {
    const b = fakePlayer("b", { kills: 3 });
    gg.onKill?.(fakeRoom([fakePlayer("a", { kills: 6 }), b]), "a", "b", "wrench");
    expect(b.kills).toBe(2);
  });

  it("ignores kills outside a round", () => {
    const a = fakePlayer("a", { kills: 2, weapons: ["rocket"] });
    gg.onKill?.(fakeRoom([a, fakePlayer("b")], { phase: "waiting" }), "a", "b", "rocket");
    expect(a.weapons).toEqual(["rocket"]);
  });

  it("is won by completing the ladder", () => {
    expect(gg.checkWin(fakeRoom([fakePlayer("a", { kills: GUN_GAME_TOTAL_KILLS - 1 }), fakePlayer("b")]))).toBeNull();
    expect(gg.checkWin(fakeRoom([fakePlayer("a", { kills: GUN_GAME_TOTAL_KILLS }), fakePlayer("b")]))).toEqual({ winner: "a" });
  });
});
