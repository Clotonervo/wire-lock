import { describe, expect, it } from "vitest";
import { testArena } from "@wire-lock/shared";
import { createDeathmatch, farthestSpawn } from "../src/sim/modes/deathmatch";
import type { ModeRoom } from "../src/sim/modes/types";
import { fakePlayer, fakeRoom, type FakePlayer } from "./fakeModeRoom";

function player(id: string, kills: number, pos = { x: 0, y: 0, z: 0 }, alive = true): FakePlayer {
  return fakePlayer(id, { kills, pos, alive });
}

function room(players: FakePlayer[], timeUp = false): ModeRoom {
  return fakeRoom(players, { timeUp });
}

describe("deathmatch.checkWin", () => {
  const dm = createDeathmatch({ scoreLimit: 3 });

  it("keeps going below the score limit", () => {
    expect(dm.checkWin(room([player("a", 2), player("b", 1)]))).toBeNull();
  });

  it("ends when someone reaches the score limit", () => {
    expect(dm.checkWin(room([player("a", 1), player("b", 3)]))).toEqual({ winner: "b" });
  });

  it("gives the round to the leader when time runs out", () => {
    expect(dm.checkWin(room([player("a", 2), player("b", 1)], true))).toEqual({ winner: "a" });
  });

  it("draws on a tie when time runs out", () => {
    expect(dm.checkWin(room([player("a", 1), player("b", 1)], true))).toEqual({});
  });

  it("uses the shared definition by default", () => {
    expect(createDeathmatch().def.scoreLimit).toBe(20);
  });
});

describe("farthestSpawn", () => {
  it("avoids spawning next to a living enemy", () => {
    const enemyAtFirstSpawn = testArena.spawns[0]!.pos;
    const r = room([player("enemy", 0, enemyAtFirstSpawn), player("me", 0)]);
    for (let i = 0; i < 20; i++) {
      const s = farthestSpawn(r, "me", () => i / 20);
      const d = Math.hypot(s.pos.x - enemyAtFirstSpawn.x, s.pos.z - enemyAtFirstSpawn.z);
      expect(d).toBeGreaterThan(20);
    }
  });

  it("ignores dead players and itself", () => {
    const r = room([player("me", 0, testArena.spawns[0]!.pos), player("dead", 0, testArena.spawns[1]!.pos, false)]);
    expect(testArena.spawns).toContain(farthestSpawn(r, "me", () => 0));
  });
});
