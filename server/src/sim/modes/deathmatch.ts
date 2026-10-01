import { deathmatch as def } from "@wire-lock/shared";
import type { ModeDef, SpawnPoint } from "@wire-lock/shared";
import type { GameMode, ModeRoom } from "./types";

/** Spawn among this many of the spawns farthest from other players, so spawns don't become predictable. */
const SPAWN_CHOICES = 3;

/** Picks a spawn far from the other living players. */
export function farthestSpawn(room: ModeRoom, playerId: string, random: () => number = Math.random): SpawnPoint {
  const others = room.players.filter((p) => p.alive && p.id !== playerId);
  const scored = room.map.spawns.map((s) => ({
    spawn: s,
    dist: others.length === 0 ? 0 : Math.min(...others.map((o) => Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z))),
  }));
  scored.sort((a, b) => b.dist - a.dist);
  const pool = others.length === 0 ? scored : scored.slice(0, SPAWN_CHOICES);
  const pick = pool[Math.floor(random() * pool.length)] ?? scored[0];
  if (!pick) throw new Error(`map ${room.map.id} has no spawns`);
  return pick.spawn;
}

/** Free-for-all: first to the score limit, or most kills when time runs out (ties draw). */
export function createDeathmatch(overrides: Partial<ModeDef> = {}): GameMode {
  const modeDef: ModeDef = { ...def, ...overrides };
  return {
    def: modeDef,
    // Everything else is picked up on the map (weapon pickups).
    loadout: () => ["pistol"],
    pickSpawn: (room, playerId) => farthestSpawn(room, playerId),
    checkWin(room) {
      const top = Math.max(0, ...room.players.map((p) => p.kills));
      const leaders = room.players.filter((p) => p.kills === top);
      if (modeDef.scoreLimit !== undefined && top >= modeDef.scoreLimit) return { winner: leaders[0]?.id };
      if (room.timeUp) return leaders.length === 1 ? { winner: leaders[0]?.id } : {};
      return null;
    },
  };
}
