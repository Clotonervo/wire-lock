import { PLAYER_EYE_HEIGHT } from "./constants";
import type { Box, Vec3 } from "./types";

/** Unit look direction for a yaw/pitch (Three.js camera convention: yaw 0, pitch 0 looks down -Z). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Eye position for a feet-centre player position. */
export function eyePosition(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y + PLAYER_EYE_HEIGHT, z: pos.z };
}

export function pointAlong(origin: Vec3, dir: Vec3, dist: number): Vec3 {
  return { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist };
}

/**
 * Distance along the ray to where it enters `box`, or null if it misses within
 * `maxDist`. A ray starting inside the box hits at 0. `dir` must be normalised.
 */
export function rayBox(origin: Vec3, dir: Vec3, box: Box, maxDist: number): number | null {
  let tMin = 0;
  let tMax = maxDist;
  for (const axis of ["x", "y", "z"] as const) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (d === 0) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Distance to the nearest box the ray hits, or `maxDist` if it hits nothing. */
export function rayBoxes(origin: Vec3, dir: Vec3, boxes: readonly Box[], maxDist: number): number {
  let nearest = maxDist;
  for (const b of boxes) {
    const t = rayBox(origin, dir, b, nearest);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}
