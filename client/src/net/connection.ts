import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import type { ArenaStateView } from "./stateTypes";

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;
const NAME_KEY = "wire-lock.name";

export type ArenaRoom = Room<unknown, ArenaStateView>;

/**
 * The player's name: `?name=` in the URL (remembered), else the remembered one.
 * A proper join screen arrives in M4. The server sanitises it either way.
 */
function playerName(): string | undefined {
  const fromUrl = new URLSearchParams(location.search).get("name") ?? undefined;
  try {
    if (fromUrl) localStorage.setItem(NAME_KEY, fromUrl);
    return fromUrl ?? localStorage.getItem(NAME_KEY) ?? undefined;
  } catch {
    return fromUrl;
  }
}

export async function connect(): Promise<ArenaRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate<ArenaStateView>(ROOM_NAME, { name: playerName() });
}
