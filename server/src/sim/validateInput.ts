import { MAX_PITCH, TICK_DT, clamp, wrapAngle } from "@wire-lock/shared";
import type { AxisInput, InputCmd } from "@wire-lock/shared";

/** Allowed difference between a client's reported dt and the server tick. */
const DT_TOLERANCE = 1e-6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toAxis(v: unknown): AxisInput | null {
  return v === -1 || v === 0 || v === 1 ? v : null;
}

/**
 * Turns an untrusted input payload into a clean InputCmd, or null if it's
 * malformed (DESIGN.md §5.2, §12). Angles are normalised and clamped rather
 * than rejected; structural problems reject the whole command.
 */
export function sanitizeInput(raw: unknown): InputCmd | null {
  if (!isRecord(raw) || !isRecord(raw.move)) return null;

  const { seq, dt, yaw, pitch } = raw;
  if (!Number.isSafeInteger(seq) || (seq as number) < 0) return null;
  if (!isFiniteNumber(dt) || Math.abs(dt - TICK_DT) > DT_TOLERANCE) return null;
  if (!isFiniteNumber(yaw) || !isFiniteNumber(pitch)) return null;

  const mx = toAxis(raw.move.x);
  const mz = toAxis(raw.move.z);
  if (mx === null || mz === null) return null;

  const cmd: InputCmd = {
    seq: seq as number,
    dt: TICK_DT,
    move: { x: mx, z: mz },
    jump: raw.jump === true,
    yaw: wrapAngle(yaw),
    pitch: clamp(pitch, -MAX_PITCH, MAX_PITCH),
    fire: raw.fire === true,
    altFire: raw.altFire === true,
    reload: raw.reload === true,
  };
  if (Number.isSafeInteger(raw.weaponSlot) && (raw.weaponSlot as number) >= 0) cmd.weaponSlot = raw.weaponSlot as number;
  // Clamped to the rewind window by the room, which knows the current time.
  if (isFiniteNumber(raw.viewTime)) cmd.viewTime = raw.viewTime;
  return cmd;
}
