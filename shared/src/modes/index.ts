/**
 * Mode definitions: the data both sides need (DESIGN.md §8). Server-side rules
 * live in server/src/sim/modes/.
 */
export interface ModeDef {
  id: string;
  name: string;
  /** Active (not away) players needed before a round starts; below this it's warm-up. */
  minPlayers: number;
  roundTimeSec?: number;
  /** Kills (or points) that win the round. */
  scoreLimit?: number;
  respawnDelayMs: number;
}

export const deathmatch: ModeDef = {
  id: "deathmatch",
  name: "Deathmatch",
  minPlayers: 2,
  roundTimeSec: 300,
  scoreLimit: 20,
  respawnDelayMs: 3000,
};

export const MODES: Readonly<Record<string, ModeDef>> = {
  [deathmatch.id]: deathmatch,
};

export const DEFAULT_MODE_ID = deathmatch.id;

export function getMode(id: string): ModeDef | undefined {
  return MODES[id];
}
