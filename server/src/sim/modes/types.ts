import type { MapDef, ModeDef, SpawnPoint, Vec3 } from "@wire-lock/shared";

/** What a mode can see of a player. */
export interface ModePlayer {
  id: string;
  kills: number;
  deaths: number;
  alive: boolean;
  /** Lives left this round; -1 when the mode doesn't use lives. */
  lives: number;
  /** Out of the round (spectating) until the next one. */
  eliminated: boolean;
  pos: Vec3;
}

/**
 * The few things a mode may change (DESIGN.md §8). Like weapon hooks, modes
 * never touch Colyseus state directly.
 */
export interface ModeApi {
  /** Replace a living player's weapons (re-armed with full magazines). No-op if unchanged. */
  setLoadout(playerId: string, weapons: string[]): void;
  addAmmo(playerId: string, weaponId: string, amount: number): void;
  setKills(playerId: string, kills: number): void;
  setLives(playerId: string, lives: number): void;
  /** Take a player out of the round: dead, no respawn until the next round. */
  eliminate(playerId: string): void;
}

export type RoundPhase = "waiting" | "playing" | "paused" | "ended";

/** The room as a mode sees it. Away players are excluded. */
export interface ModeRoom {
  map: MapDef;
  phase: RoundPhase;
  players: readonly ModePlayer[];
  /** True once the round timer has run out. */
  timeUp: boolean;
  api: ModeApi;
}

/** Server-side rules for a game mode (DESIGN.md §8). The room delegates to it. */
export interface GameMode {
  def: ModeDef;
  /** Weapon ids a player spawns with; the first is equipped. */
  loadout(room: ModeRoom, playerId: string): string[];
  onPlayerJoin?(room: ModeRoom, playerId: string): void;
  /** After everyone's scores are reset and they've respawned. */
  onRoundStart?(room: ModeRoom): void;
  /** Called after the room has updated kills/deaths (only counted while playing). */
  onKill?(room: ModeRoom, killer: string, victim: string, weaponId: string): void;
  onTick?(room: ModeRoom, dt: number): void;
  pickSpawn(room: ModeRoom, playerId: string): SpawnPoint;
  /** Null while the round goes on; `{}` for a draw. */
  checkWin(room: ModeRoom): { winner?: string } | null;
}
