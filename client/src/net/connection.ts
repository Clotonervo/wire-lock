import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";
import type { ArenaStateView } from "./stateTypes";

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;

export type ArenaRoom = Room<unknown, ArenaStateView>;

export async function connect(): Promise<ArenaRoom> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate<ArenaStateView>(ROOM_NAME);
}
