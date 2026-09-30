import { describe, expect, it } from "vitest";
import { chamberPistol } from "@wire-lock/shared";
import { createOneInTheChamber } from "../src/sim/modes/oneInTheChamber";
import { fakePlayer, fakeRoom } from "./fakeModeRoom";

const armed = () => ({ weapons: [chamberPistol.id, "wrench"], ammo: [0, -1], lives: 3 });

describe("One in the Chamber", () => {
  const oitc = createOneInTheChamber();

  it("gives everyone 3 lives at round start", () => {
    const players = [fakePlayer("a"), fakePlayer("b")];
    oitc.onRoundStart?.(fakeRoom(players));
    expect(players.map((p) => p.lives)).toEqual([3, 3]);
  });

  it("rewards a kill with a bullet and costs the victim a life", () => {
    const a = fakePlayer("a", armed());
    const b = fakePlayer("b", armed());
    oitc.onKill?.(fakeRoom([a, b]), "a", "b", chamberPistol.id);
    expect(a.ammo[0]).toBe(1);
    expect(b.lives).toBe(2);
    expect(b.eliminated).toBe(false);
  });

  it("eliminates a player who runs out of lives", () => {
    const b = fakePlayer("b", { ...armed(), lives: 1 });
    oitc.onKill?.(fakeRoom([fakePlayer("a", armed()), b]), "a", "b", "wrench");
    expect(b.eliminated).toBe(true);
  });

  it("makes mid-round joiners wait for the next round", () => {
    const c = fakePlayer("c");
    oitc.onPlayerJoin?.(fakeRoom([fakePlayer("a"), fakePlayer("b"), c]), "c");
    expect(c.eliminated).toBe(true);
  });

  it("ends when one player is left standing", () => {
    const players = [fakePlayer("a", armed()), fakePlayer("b", { ...armed(), eliminated: true }), fakePlayer("c", { ...armed(), eliminated: true })];
    expect(oitc.checkWin(fakeRoom(players))).toEqual({ winner: "a" });
    expect(oitc.checkWin(fakeRoom([fakePlayer("a", armed()), fakePlayer("b", armed())]))).toBeNull();
  });

  it("gives the round to whoever has most lives when time runs out", () => {
    const players = [fakePlayer("a", { ...armed(), lives: 1 }), fakePlayer("b", { ...armed(), lives: 2 })];
    expect(oitc.checkWin(fakeRoom(players, { timeUp: true }))).toEqual({ winner: "b" });
  });
});
