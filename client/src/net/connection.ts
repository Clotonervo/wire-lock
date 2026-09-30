import { Client, ErrorCode, type Room } from "@colyseus/sdk";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import type { ArenaStateView } from "./stateTypes";

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;

export type ArenaRoom = Room<unknown, ArenaStateView>;

const client = new Client(SERVER_URL);

/**
 * One health check. A sleeping free-tier server wakes up on the first request, so keep asking.
 * - "ok": the server answered and allows this page's origin.
 * - "blocked": something answered, but the browser wouldn't let us read it: usually the server's
 *   ALLOWED_ORIGINS doesn't include this address (or its proxy is still waking up).
 * - "down": nothing answered in time.
 */
export async function pingServer(timeoutMs: number): Promise<"ok" | "blocked" | "down"> {
  const url = `${SERVER_URL.replace(/^ws/, "http")}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? "ok" : "down";
  } catch {
    try {
      // An opaque no-cors request succeeds whenever the server responds at all.
      await fetch(url, { mode: "no-cors", signal: AbortSignal.timeout(timeoutMs) });
      return "blocked";
    } catch {
      return "down";
    }
  }
}

export function createRoom(name: string, mode: string): Promise<ArenaRoom> {
  return client.create<ArenaStateView>(ROOM_NAME, { name, mode });
}

export function joinRoom(code: string, name: string): Promise<ArenaRoom> {
  return client.joinById<ArenaStateView>(code, { name });
}

/** A short, human message for a failed create/join. */
export function describeJoinError(err: unknown): string {
  const code = (err as { code?: number } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID || /not found/i.test(message)) return "No room with that code. Check it and try again.";
  if (/locked|full/i.test(message)) return "That room is full.";
  if (/failed to fetch|networkerror|load failed/i.test(message))
    return `Couldn't reach the game server from ${location.origin}. It may not allow this address.`;
  return message || "Couldn't connect. Try again.";
}
