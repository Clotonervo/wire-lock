import { Client, ErrorCode, type Room } from "@colyseus/sdk";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import type { ArenaStateView } from "./stateTypes";

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;

export type ArenaRoom = Room<unknown, ArenaStateView>;

const client = new Client(SERVER_URL);

/** One health check. A sleeping free-tier server wakes up on the first request, so keep asking. */
export async function pingServer(timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL.replace(/^ws/, "http")}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
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
  return message || "Couldn't connect. Try again.";
}
