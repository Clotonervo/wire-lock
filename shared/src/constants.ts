/** Room name registered on the server and joined by the client. */
export const ROOM_NAME = "arena";

/** Default port for the Colyseus server in development. */
export const DEFAULT_SERVER_PORT = 2567;

// --- Networking (DESIGN.md §5) ---

/** Server simulation rate (DESIGN.md §5.1). */
export const TICK_RATE_HZ = 30;
export const TICK_MS = 1000 / TICK_RATE_HZ;
/** Tick duration in seconds, as used by the simulation. */
export const TICK_DT = 1 / TICK_RATE_HZ;

/** Server state patch interval in ms (20 Hz). */
export const PATCH_RATE_MS = 50;

/** Maximum players per room (DESIGN.md §12). */
export const MAX_PLAYERS_PER_ROOM = 8;
/** Maximum rooms one server hosts at once (DESIGN.md §12). */
export const MAX_ROOMS = 20;

/** Room codes: short, upper-case, and without look-alike letters (no I or O). */
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Remote players are rendered this far in the past (DESIGN.md §5.4). */
export const INTERP_DELAY_MS = 100;
/** How long a remote player may be extrapolated past its last snapshot before freezing. */
export const MAX_EXTRAPOLATION_MS = TICK_MS;

/** Prediction errors are smoothed out over this long (DESIGN.md §5.3). */
export const CORRECTION_SMOOTH_MS = 100;
/** Prediction errors larger than this (units) snap instead of smoothing. */
export const CORRECTION_SNAP_DISTANCE = 1;

/** Most input commands a client may send in one message. */
export const MAX_INPUT_BATCH = 10;
/** Most messages a client may send per second before being disconnected. */
export const MAX_MESSAGES_PER_SECOND = 60;
/** Inputs buffered per player on the server; the oldest are dropped beyond this. */
export const MAX_INPUT_QUEUE = 30;
/**
 * The server applies one input per player per tick, which smooths out bursty
 * clients (e.g. one sending two inputs per frame at 15 fps). Once more than
 * this many are queued, it catches up at MAX_INPUTS_PER_TICK instead.
 */
export const INPUT_BACKLOG = 3;
/** Inputs applied per tick while catching up; also caps how fast a speed hack can move. */
export const MAX_INPUTS_PER_TICK = 2;

// --- Player (DESIGN.md §6.1) ---

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;

/** Max horizontal speed from input, units/s. */
export const MAX_SPEED = 7;
/** Ground acceleration factor (Quake-style: accel * wishSpeed * dt). */
export const GROUND_ACCEL = 10;
/** Air acceleration factor; small, for a little air control. */
export const AIR_ACCEL = 1.5;
/** Ground friction factor. */
export const FRICTION = 8;
/** Below this speed, friction acts as if moving at this speed, so players stop crisply. */
export const STOP_SPEED = 2;
export const GRAVITY = 20;
export const JUMP_SPEED = 7;
export const MAX_FALL_SPEED = 40;

/** Pitch is clamped to just short of straight up/down (radians). */
export const MAX_PITCH = Math.PI / 2 - 0.01;

/** Players falling below this height are respawned. */
export const KILL_Y = -20;

export const MAX_HEALTH = 100;
/** Splash damage from your own explosions is scaled by this (rocket jumps cost some health, not all of it). */
export const SELF_BLAST_DAMAGE_SCALE = 0.4;
/** Delay before a newly selected weapon can fire. */
export const WEAPON_SWITCH_MS = 200;

// --- Rounds and players (DESIGN.md §5.2, §8, §12) ---

/** A player with no applied input for this long is marked away and taken out of the world. */
export const AWAY_TIMEOUT_MS = 8000;
/** How long the end-of-round screen shows before the next round starts. */
export const ROUND_END_DELAY_MS = 8000;
export const MAX_NAME_LENGTH = 16;

// --- Collision ---

/** Gap kept between a player and the surfaces they touch, to avoid float-precision snagging. */
export const COLLISION_SKIN = 1e-3;
