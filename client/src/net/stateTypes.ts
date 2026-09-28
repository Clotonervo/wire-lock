import type { PlayerMoveState } from "@wire-lock/shared";

/**
 * Read-only view of the server's synced state (server/src/schema/ArenaState.ts).
 * The client decodes state by reflection, so these interfaces mirror the schema
 * by hand; keep them in sync.
 */
export interface PlayerView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  yaw: number;
  pitch: number;
  color: string;
  lastProcessedSeq: number;
}

export interface ArenaStateView {
  mapId: string;
  tick: number;
  players: {
    get(sessionId: string): PlayerView | undefined;
    forEach(cb: (player: PlayerView, sessionId: string) => void): void;
    readonly size: number;
  };
}

export function readMove(p: PlayerView): PlayerMoveState {
  return { pos: { x: p.x, y: p.y, z: p.z }, vel: { x: p.vx, y: p.vy, z: p.vz }, onGround: p.onGround };
}
