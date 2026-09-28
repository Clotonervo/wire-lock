/** Room name registered on the server and joined by the client. */
export const ROOM_NAME = "arena";

/** Default port for the Colyseus server in development. */
export const DEFAULT_SERVER_PORT = 2567;

/** Server simulation rate (DESIGN.md §5.1). */
export const TICK_RATE_HZ = 30;
export const TICK_MS = 1000 / TICK_RATE_HZ;

/** Server state patch interval in ms (20 Hz). */
export const PATCH_RATE_MS = 50;

/** Maximum players per room (DESIGN.md §12). */
export const MAX_PLAYERS_PER_ROOM = 8;
