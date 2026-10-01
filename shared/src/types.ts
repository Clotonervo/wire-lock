export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type AxisInput = -1 | 0 | 1;

/** One tick of player input, sent client → server (DESIGN.md §5.2). */
export interface InputCmd {
  /** Monotonically increasing per client. */
  seq: number;
  /** Tick duration used, in seconds (fixed; sent for sanity checks). */
  dt: number;
  /** x = strafe (+1 right), z = forward (+1 forward). */
  move: { x: AxisInput; z: AxisInput };
  jump: boolean;
  /** Radians. 0 looks down -Z; positive turns left, matching a Three.js camera's rotation.y. */
  yaw: number;
  /** Radians, clamped to ±MAX_PITCH. Positive looks up. */
  pitch: number;
  fire: boolean;
  altFire: boolean;
  reload: boolean;
  /**
   * Server time (ms) of the world the player was looking at when this input was
   * sampled: remote players are drawn INTERP_DELAY_MS behind. Sent with shots so
   * the server can rewind targets to what the shooter saw (lag compensation).
   */
  viewTime?: number;
  /** Switch to this slot (0-based); only sent on the tick the player asks to switch. */
  weaponSlot?: number;
}

/** The part of a player's state that movement reads and writes. `pos` is the centre of the feet. */
export interface PlayerMoveState {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  /** Mid-air jumps used since last touching the ground (Spring Heels). */
  airJumpsUsed?: number;
  /** Whether jump was held last tick, so mid-air jumps need a fresh press. */
  jumpHeld?: boolean;
  /** Air Dash cooldown left, ms. */
  dashCooldownMs?: number;
  /** Whether alt-fire was held last tick, so dashes need a fresh press. */
  altHeld?: boolean;
  /** Adrenaline speed boost left, ms. */
  boostMs?: number;
}

export interface Box {
  min: Vec3;
  max: Vec3;
  color?: string;
  /** Collides but isn't drawn (e.g. clip walls that stop rocket jumps leaving the map). */
  invisible?: boolean;
}

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
  team?: string;
}

/** A pad that launches whoever steps on it (DESIGN.md §6.2). */
export interface JumpPad {
  min: Vec3;
  max: Vec3;
  /** Velocity it gives you, units/s. */
  launch: Vec3;
}

export type PickupKind = "health";

export interface PickupDef {
  pos: Vec3;
  kind: PickupKind;
}

export interface MapDef {
  id: string;
  name: string;
  boxes: Box[];
  spawns: SpawnPoint[];
  jumpPads?: JumpPad[];
  pickups?: PickupDef[];
}
