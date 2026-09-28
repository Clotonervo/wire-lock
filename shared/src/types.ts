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
  /** Switch to this slot (0-based); only sent on the tick the player asks to switch. */
  weaponSlot?: number;
}

/** The part of a player's state that movement reads and writes. `pos` is the centre of the feet. */
export interface PlayerMoveState {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
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

export interface MapDef {
  id: string;
  name: string;
  boxes: Box[];
  spawns: SpawnPoint[];
  pickups?: { pos: Vec3; kind: string }[];
}
