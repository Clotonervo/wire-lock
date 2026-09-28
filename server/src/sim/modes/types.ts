import type { MapDef, ModeDef, SpawnPoint, Vec3 } from "@wire-lock/shared";

/** What a mode can see of a player. */
export interface ModePlayer {
  id: string;
  kills: number;
  deaths: number;
  alive: boolean;
  pos: Vec3;
}

/** The read-only view of the room a mode's rules work from. Away players are excluded. */
export interface ModeRoom {
  map: MapDef;
  players: readonly ModePlayer[];
  /** True once the round timer has run out. */
  timeUp: boolean;
}

/** Server-side rules for a game mode (DESIGN.md §8). The room delegates to it. */
export interface GameMode {
  def: ModeDef;
  /** Weapon ids a player spawns with; the first is equipped. */
  loadout(room: ModeRoom, playerId: string): string[];
  onPlayerJoin?(room: ModeRoom, playerId: string): void;
  onKill?(room: ModeRoom, killer: string, victim: string, weaponId: string): void;
  onTick?(room: ModeRoom, dt: number): void;
  pickSpawn(room: ModeRoom, playerId: string): SpawnPoint;
  /** Null while the round goes on; `{}` for a draw. */
  checkWin(room: ModeRoom): { winner?: string } | null;
}
