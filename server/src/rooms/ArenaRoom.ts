import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS_PER_ROOM, PATCH_RATE_MS } from "@wire-lock/shared";
import { log } from "../log";

/**
 * The game room. Empty for M0: it only accepts connections.
 * Simulation, state and input handling arrive in M1.
 */
export class ArenaRoom extends Room {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override patchRate = PATCH_RATE_MS;

  override onCreate() {
    log("room.create", { roomId: this.roomId });
  }

  override onJoin(client: Client) {
    log("room.join", { roomId: this.roomId, sessionId: client.sessionId });
  }

  override onLeave(client: Client) {
    log("room.leave", { roomId: this.roomId, sessionId: client.sessionId });
  }

  override onDispose() {
    log("room.dispose", { roomId: this.roomId });
  }
}
