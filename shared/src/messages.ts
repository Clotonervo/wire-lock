import type { Vec3 } from "./types";

/**
 * One-off server → client events (DESIGN.md §5.6). Anything that must persist
 * lives in synced state instead.
 */
export interface ServerMessages {
  /** Someone else fired: draw their tracers (one per pellet). Not sent to the shooter, who drew them already. */
  fire: { shooter: string; weapon: string; ends: Vec3[] };
  /** Sent to the shooter when a shot lands, for the hitmarker. */
  hit: { target: string; damage: number; killed: boolean };
  kill: { killer: string; victim: string; weapon: string };
  roundStart: Record<string, never>;
  /** `winner` is a session id, or empty for a draw. */
  roundEnd: { winner: string };
}

export type ServerMessageType = keyof ServerMessages;
