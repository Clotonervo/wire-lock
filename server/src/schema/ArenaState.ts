import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A player's synced state. Position and velocity are float64: `t.number()` silently
 * sends floats as float32 when the error is < 1e-4, which is lossy enough to
 * cause constant tiny corrections when the client re-simulates from server state.
 */
export const PlayerState = schema(
  {
    x: t.float64(),
    y: t.float64(),
    z: t.float64(),
    vx: t.float64(),
    vy: t.float64(),
    vz: t.float64(),
    onGround: t.boolean(),
    yaw: t.number(),
    pitch: t.number(),
    color: t.string(),
    lastProcessedSeq: t.number(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ArenaState = schema(
  {
    mapId: t.string(),
    /** Server simulation tick counter. */
    tick: t.number(),
    players: t.map(PlayerState),
  },
  "ArenaState",
);
export type ArenaState = SchemaType<typeof ArenaState>;
