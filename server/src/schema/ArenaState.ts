import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A player's synced state. Position and velocity are float64: `t.number()` silently
 * sends floats as float32 when the error is < 1e-4, which is lossy enough to
 * cause constant tiny corrections when the client re-simulates from server state.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    color: t.string(),
    x: t.float64(),
    y: t.float64(),
    z: t.float64(),
    vx: t.float64(),
    vy: t.float64(),
    vz: t.float64(),
    onGround: t.boolean(),
    yaw: t.number(),
    pitch: t.number(),
    lastProcessedSeq: t.number(),
    health: t.uint8(),
    alive: t.boolean(),
    /** Out of the world after AWAY_TIMEOUT_MS without input; back on their next input. */
    away: t.boolean(),
    /** Server tick at which a dead player respawns; 0 when not waiting to respawn. */
    respawnTick: t.number(),
    weapon: t.string(),
    kills: t.uint16(),
    deaths: t.uint16(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export type RoundPhase = "waiting" | "playing" | "ended";

export const ArenaState = schema(
  {
    mapId: t.string(),
    modeId: t.string(),
    /** Kills that win the round (the mode's limit, or the --kill-limit override); 0 = none. */
    scoreLimit: t.uint16(),
    /** Server simulation tick counter. */
    tick: t.number(),
    /** RoundPhase: warm-up until enough players, then playing, then the end-of-round screen. */
    phase: t.string(),
    /** Tick at which the current phase ends (round timer / end screen); 0 = no timer. */
    phaseEndTick: t.number(),
    /** Winner of the last round (session id), or empty for a draw / no round yet. */
    winner: t.string(),
    players: t.map(PlayerState),
  },
  "ArenaState",
);
export type ArenaState = SchemaType<typeof ArenaState>;
