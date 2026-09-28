import type { PlayerMoveState } from "@wire-lock/shared";

/**
 * Read-only view of the server's synced state (server/src/schema/ArenaState.ts).
 * The client decodes state by reflection, so these interfaces mirror the schema
 * by hand; keep them in sync.
 */
export interface PlayerView {
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  yaw: number;
  pitch: number;
  lastProcessedSeq: number;
  health: number;
  alive: boolean;
  away: boolean;
  /** Server tick at which a dead player respawns; 0 when not waiting to respawn. */
  respawnTick: number;
  weapon: string;
  kills: number;
  deaths: number;
}

export type RoundPhase = "waiting" | "playing" | "ended";

export interface ArenaStateView {
  mapId: string;
  modeId: string;
  /** Kills that win the round; 0 = none. */
  scoreLimit: number;
  tick: number;
  phase: RoundPhase;
  /** Tick at which the current phase ends; 0 = no timer. */
  phaseEndTick: number;
  /** Session id of the last round's winner, or empty for a draw. */
  winner: string;
  players: {
    get(sessionId: string): PlayerView | undefined;
    forEach(cb: (player: PlayerView, sessionId: string) => void): void;
    readonly size: number;
  };
}

export function readMove(p: PlayerView): PlayerMoveState {
  return { pos: { x: p.x, y: p.y, z: p.z }, vel: { x: p.vx, y: p.vy, z: p.vz }, onGround: p.onGround };
}
