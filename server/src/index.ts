import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import { log } from "./log";
import { ArenaRoom } from "./rooms/ArenaRoom";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
});

server.define(ROOM_NAME, ArenaRoom);

// `--latency=<ms>` simulates round-trip latency for netcode testing (COLYSEUS_LATENCY also works).
const latencyArg = process.argv.find((a) => a.startsWith("--latency="));
const latencyMs = latencyArg ? Number(latencyArg.split("=")[1]) : 0;
if (latencyMs > 0) {
  server.simulateLatency(latencyMs);
  log("server.latency", { roundTripMs: latencyMs });
}

await server.listen(port);
log("server.listen", { port });
