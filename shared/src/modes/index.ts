/**
 * Mode definitions: the data both sides need (DESIGN.md §8). Server-side rules
 * live in server/src/sim/modes/.
 */
export interface ModeDef {
  id: string;
  name: string;
  /** Short description for the lobby. */
  blurb: string;
  /** Active (not away) players needed before a round starts; below this it's warm-up. */
  minPlayers: number;
  roundTimeSec?: number;
  /** Kills (or points) that win the round. */
  scoreLimit?: number;
  /** Lives per round; undefined = unlimited respawns. */
  lives?: number;
  /** Whether players earn Rewires (DESIGN.md §8b). */
  rewires?: boolean;
  /** Whether the map's weapon pickups are in play (otherwise the mode controls loadouts). */
  weaponPickups?: boolean;
  respawnDelayMs: number;
}

export const deathmatch: ModeDef = {
  id: "deathmatch",
  name: "Deathmatch",
  blurb: "Spawn with a pistol, grab bigger guns on the map. First to 20 kills.",
  minPlayers: 2,
  roundTimeSec: 300,
  scoreLimit: 20,
  respawnDelayMs: 3000,
  rewires: true,
  weaponPickups: true,
};

/** Gun Game's weapons in order, and the kills needed on each before moving up. */
export const GUN_GAME_LADDER: readonly { weapon: string; kills: number }[] = [
  { weapon: "rocket", kills: 2 },
  { weapon: "shotgun", kills: 2 },
  { weapon: "pistol", kills: 2 },
  { weapon: "wrench", kills: 1 },
];

export const GUN_GAME_TOTAL_KILLS = GUN_GAME_LADDER.reduce((n, step) => n + step.kills, 0);

/** Which ladder step a player with `kills` kills is on (the last step once they've won). */
export function gunGameLevel(kills: number): number {
  let left = kills;
  for (let i = 0; i < GUN_GAME_LADDER.length; i++) {
    const need = GUN_GAME_LADDER[i]?.kills ?? 0;
    if (left < need) return i;
    left -= need;
  }
  return GUN_GAME_LADDER.length - 1;
}

export const gunGame: ModeDef = {
  id: "gungame",
  name: "Gun Game",
  blurb: "Kills move you up a weapon. Win with the wrench.",
  minPlayers: 2,
  roundTimeSec: 600,
  scoreLimit: GUN_GAME_TOTAL_KILLS,
  respawnDelayMs: 2000,
};

export const oneInTheChamber: ModeDef = {
  id: "oitc",
  name: "One in the Chamber",
  blurb: "One bullet, one-hit kills, +1 bullet per kill. 3 lives, last one standing.",
  minPlayers: 2,
  roundTimeSec: 300,
  lives: 3,
  respawnDelayMs: 2500,
};

export const MODES: Readonly<Record<string, ModeDef>> = {
  [deathmatch.id]: deathmatch,
  [gunGame.id]: gunGame,
  [oneInTheChamber.id]: oneInTheChamber,
};

export const DEFAULT_MODE_ID = deathmatch.id;

export function getMode(id: string): ModeDef | undefined {
  return MODES[id];
}
