import { GUN_GAME_LADDER, gunGame as def, gunGameLevel, wrench } from "@wire-lock/shared";
import type { ModeDef } from "@wire-lock/shared";
import { farthestSpawn } from "./deathmatch";
import type { GameMode, ModeRoom } from "./types";

function weaponFor(kills: number): string {
  return GUN_GAME_LADDER[gunGameLevel(kills)]?.weapon ?? wrench.id;
}

function killsOf(room: ModeRoom, id: string): number {
  return room.players.find((p) => p.id === id)?.kills ?? 0;
}

/**
 * Gun Game: your kills move you up a fixed weapon ladder, and a kill with the
 * last weapon (the wrench) wins. Getting wrenched knocks you back a kill.
 */
export function createGunGame(overrides: Partial<ModeDef> = {}): GameMode {
  const modeDef: ModeDef = { ...def, ...overrides };
  const winAt = modeDef.scoreLimit ?? Infinity;
  return {
    def: modeDef,
    loadout: (room, id) => [weaponFor(killsOf(room, id))],
    pickSpawn: (room, id) => farthestSpawn(room, id),
    onKill(room, killer, victim, weaponId) {
      if (room.phase !== "playing" || killer === victim) return;
      if (weaponId === wrench.id) {
        const v = killsOf(room, victim);
        if (v > 0) room.api.setKills(victim, v - 1);
      }
      room.api.setLoadout(killer, [weaponFor(killsOf(room, killer))]);
    },
    checkWin(room) {
      const winner = room.players.find((p) => p.kills >= winAt);
      if (winner) return { winner: winner.id };
      if (!room.timeUp) return null;
      const top = Math.max(0, ...room.players.map((p) => p.kills));
      const leaders = room.players.filter((p) => p.kills === top);
      return leaders.length === 1 ? { winner: leaders[0]?.id } : {};
    },
  };
}
