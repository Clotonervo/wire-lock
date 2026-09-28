import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@wire-lock/shared";

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;

export async function connect(): Promise<Room> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(ROOM_NAME);
}
