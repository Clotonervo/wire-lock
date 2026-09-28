import { MAX_NAME_LENGTH } from "@wire-lock/shared";

/** Control characters, zero-width characters and bidi overrides. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/**
 * Cleans a player-supplied name (DESIGN.md §12): strips control and invisible
 * characters, collapses whitespace, trims and length-limits it. Clients must
 * still render names as text only.
 */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
  const limited = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("").trim();
  return limited.length > 0 ? limited : fallback;
}
