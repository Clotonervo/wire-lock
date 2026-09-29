import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import { config } from "./config";
import { log } from "./log";
import { ArenaRoom } from "./rooms/ArenaRoom";
import { activeRoomCount } from "./rooms/roomCodes";

const port = config.port ?? DEFAULT_SERVER_PORT;
const allowed = config.allowedOrigins;

function originAllowed(origin: string | null): boolean {
  return !allowed || (origin !== null && allowed.includes(origin));
}

// Only our own client may connect (DESIGN.md §12). Browsers always send Origin on WebSocket
// upgrades; this stops other websites embedding the game server, not determined non-browser clients.
const transport = new WebSocketTransport({
  beforeUpgrade: (request) => {
    const origin = request.headers.get("origin");
    if (originAllowed(origin)) return;
    log("server.reject_origin", { origin: origin ?? "none" });
    return new Response("Forbidden", { status: 403 });
  },
});

// Matchmaking is plain HTTP: only let allowed origins read its responses.
matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get("origin");
  return { "Access-Control-Allow-Origin": originAllowed(origin) ? (origin ?? "*") : (allowed?.[0] ?? "*") };
};

const server = new Server({
  transport,
  greet: false,
  express: (app) => {
    // Render's health check, and what the client polls while a sleeping free instance wakes up.
    app.get("/health", (_req, res) => {
      res.json({ ok: true, rooms: activeRoomCount() });
    });
  },
});

server.define(ROOM_NAME, ArenaRoom);

if (config.latencyMs) {
  server.simulateLatency(config.latencyMs);
  log("server.latency", { roundTripMs: config.latencyMs });
}

await server.listen(port);
log("server.listen", { port, allowedOrigins: allowed?.join(" ") ?? "any" });
