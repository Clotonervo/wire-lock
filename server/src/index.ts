import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import { config } from "./config";
import { log } from "./log";
import { ArenaRoom } from "./rooms/ArenaRoom";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
});

server.define(ROOM_NAME, ArenaRoom);

if (config.latencyMs) {
  server.simulateLatency(config.latencyMs);
  log("server.latency", { roundTripMs: config.latencyMs });
}

await server.listen(port);
log("server.listen", { port });
