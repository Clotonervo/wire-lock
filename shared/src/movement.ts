import { movePlayer } from "./collision";
import {
  AIR_ACCEL,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MAX_SPEED,
  STOP_SPEED,
} from "./constants";
import { DEFAULT_MODS, type PlayerMods } from "./rewires";
import type { InputCmd, MapDef, PlayerMoveState, Vec3 } from "./types";

export type MoveInput = Pick<InputCmd, "move" | "jump" | "yaw">;

/** Unit horizontal direction the player wants to move in, or zero. */
export function wishDirection(input: MoveInput): { x: number; z: number } {
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // Forward is -Z at yaw 0 (Three.js camera convention); right is +X.
  const x = -sin * input.move.z + cos * input.move.x;
  const z = -cos * input.move.z - sin * input.move.x;
  const len = Math.hypot(x, z);
  return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
}

function applyFriction(vel: Vec3, dt: number): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed === 0) return;
  const drop = Math.max(speed, STOP_SPEED) * FRICTION * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  vel.x *= scale;
  vel.z *= scale;
}

function accelerate(vel: Vec3, dir: { x: number; z: number }, wishSpeed: number, accel: number, dt: number): void {
  const current = vel.x * dir.x + vel.z * dir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const accelSpeed = Math.min(accel * wishSpeed * dt, add);
  vel.x += dir.x * accelSpeed;
  vel.z += dir.z * accelSpeed;
}

/**
 * Advances one player by one tick. Pure and deterministic: the client runs it
 * for prediction and the server runs it authoritatively (DESIGN.md §6.3).
 */
export function stepPlayer(
  state: PlayerMoveState,
  input: MoveInput,
  map: MapDef,
  dt: number,
  mods: PlayerMods = DEFAULT_MODS,
): PlayerMoveState {
  const vel = { ...state.vel };
  const dir = wishDirection(input);
  const hasWish = dir.x !== 0 || dir.z !== 0;
  const maxSpeed = MAX_SPEED * mods.moveSpeedMul;
  let airJumpsUsed = state.airJumpsUsed ?? 0;

  if (state.onGround) {
    applyFriction(vel, dt);
    if (hasWish) accelerate(vel, dir, maxSpeed, GROUND_ACCEL, dt);
    if (input.jump) vel.y = JUMP_SPEED;
  } else {
    if (hasWish) accelerate(vel, dir, maxSpeed, AIR_ACCEL * mods.airAccelMul, dt);
    // Mid-air jumps need a fresh press, so holding jump off a ledge doesn't spend them.
    if (input.jump && !state.jumpHeld && airJumpsUsed < mods.airJumps) {
      vel.y = JUMP_SPEED;
      airJumpsUsed++;
    }
  }

  vel.y = Math.max(vel.y - GRAVITY * dt, -MAX_FALL_SPEED);

  const { pos, hit } = movePlayer(state.pos, { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt }, map.boxes);

  if (hit.x) vel.x = 0;
  if (hit.z) vel.z = 0;
  const onGround = hit.y && vel.y < 0;
  if (hit.y) vel.y = 0;
  if (onGround) airJumpsUsed = 0;

  return { pos, vel, onGround, airJumpsUsed, jumpHeld: input.jump };
}
