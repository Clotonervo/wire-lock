import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@wire-lock/shared";

/** Codes of rooms that currently exist, so new ones are unique. */
const active = new Set<string>();

export function activeRoomCount(): number {
  return active.size;
}

/** Reserves a fresh random room code. */
export function claimRoomCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    if (!active.has(code)) {
      active.add(code);
      return code;
    }
  }
}

export function releaseRoomCode(code: string): void {
  active.delete(code);
}
