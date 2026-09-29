import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants";

/** Upper-cases and trims user input; returns null unless it's a well-formed room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
