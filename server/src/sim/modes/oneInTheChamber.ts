import { chamberPistol, oneInTheChamber as def, wrench } from "@wire-lock/shared";
import type { ModeDef } from "@wire-lock/shared";
import { farthestSpawn } from "./deathmatch";
import type { GameMode } from "./types";

/**
 * One in the Chamber: a pistol that kills in one hit, one bullet to start and
 * one more per kill, plus a wrench. Everyone has a few lives; the last player
 * standing wins. People who join mid-round wait for the next one.
 */
export function createOneInTheChamber(overrides: Partial<ModeDef> = {}): GameMode {
  const modeDef: ModeDef = { ...def, ...overrides };
  const lives = modeDef.lives ?? 3;
  return {
    def: modeDef,
    loadout: () => [chamberPistol.id, wrench.id],
    pickSpawn: (room, id) => farthestSpawn(room, id),
    onPlayerJoin(room, id) {
      if (room.phase === "playing") room.api.eliminate(id);
      else room.api.setLives(id, lives);
    },
    onRoundStart(room) {
      for (const p of room.players) room.api.setLives(p.id, lives);
    },
    onKill(room, killer, victim) {
      if (room.phase !== "playing") return;
      if (killer !== victim) room.api.addAmmo(killer, chamberPistol.id, 1);
      const left = (room.players.find((p) => p.id === victim)?.lives ?? 1) - 1;
      room.api.setLives(victim, left);
      if (left <= 0) room.api.eliminate(victim);
    },
    checkWin(room) {
      const standing = room.players.filter((p) => !p.eliminated);
      if (room.players.length >= 2 && standing.length <= 1) return standing[0] ? { winner: standing[0].id } : {};
      if (!room.timeUp) return null;
      // Time's up: most lives left, then most kills.
      const ranked = [...standing].sort((a, b) => b.lives - a.lives || b.kills - a.kills);
      const [first, second] = ranked;
      if (!first) return {};
      return second && second.lives === first.lives && second.kills === first.kills ? {} : { winner: first.id };
    },
  };
}
