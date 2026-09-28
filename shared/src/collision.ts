import { COLLISION_SKIN, PLAYER_HEIGHT, PLAYER_WIDTH } from "./constants";
import type { Box, Vec3 } from "./types";

type Axis = "x" | "y" | "z";
const OTHER_AXES: Record<Axis, [Axis, Axis]> = { x: ["y", "z"], y: ["x", "z"], z: ["x", "y"] };
/** Y first so landing is resolved before horizontal movement. */
const AXIS_ORDER: readonly Axis[] = ["y", "x", "z"];

/** The player's AABB for a feet-centre position. */
export function playerBox(pos: Vec3): Box {
  const half = PLAYER_WIDTH / 2;
  return {
    min: { x: pos.x - half, y: pos.y, z: pos.z - half },
    max: { x: pos.x + half, y: pos.y + PLAYER_HEIGHT, z: pos.z + half },
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

export interface MoveResult {
  pos: Vec3;
  /** Which axes were blocked by a box. */
  hit: { x: boolean; y: boolean; z: boolean };
}

/**
 * Moves a player AABB by `delta` through the map, resolving one axis at a time.
 * Each axis move is swept (clamped against every box ahead of it), so fast
 * movement can't tunnel through thin walls. Boxes the player already overlaps
 * are ignored, so a stuck player can always move out.
 */
export function movePlayer(pos: Vec3, delta: Vec3, boxes: readonly Box[]): MoveResult {
  const p = { ...pos };
  const hit = { x: false, y: false, z: false };

  for (const axis of AXIS_ORDER) {
    let d = delta[axis];
    if (d === 0) continue;
    const self = playerBox(p);
    const [o1, o2] = OTHER_AXES[axis];

    for (const b of boxes) {
      const overlapsOthers =
        self.min[o1] < b.max[o1] && self.max[o1] > b.min[o1] &&
        self.min[o2] < b.max[o2] && self.max[o2] > b.min[o2];
      if (!overlapsOthers) continue;

      if (d > 0 && self.max[axis] <= b.min[axis]) {
        const allowed = Math.max(0, b.min[axis] - self.max[axis] - COLLISION_SKIN);
        if (allowed < d) {
          d = allowed;
          hit[axis] = true;
        }
      } else if (d < 0 && self.min[axis] >= b.max[axis]) {
        const allowed = Math.min(0, b.max[axis] - self.min[axis] + COLLISION_SKIN);
        if (allowed > d) {
          d = allowed;
          hit[axis] = true;
        }
      }
    }
    p[axis] += d;
  }

  return { pos: p, hit };
}
