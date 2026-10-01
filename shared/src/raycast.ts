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

export interface RayHit {
  dist: number;
  /** Surface normal where the ray hit, or null if it hit nothing within range. */
  normal: Vec3 | null;
}

/** Like rayBoxes, but also reports the face normal that was hit. */
export function rayBoxesHit(origin: Vec3, dir: Vec3, boxes: readonly Box[], maxDist: number): RayHit {
  let best: RayHit = { dist: maxDist, normal: null };
  for (const b of boxes) {
    let tMin = 0;
    let tMax = best.dist;
    let entryAxis: "x" | "y" | "z" | null = null;
    let ok = true;
    for (const axis of ["x", "y", "z"] as const) {
      const o = origin[axis];
      const d = dir[axis];
      if (d === 0) {
        if (o < b.min[axis] || o > b.max[axis]) {
          ok = false;
          break;
        }
        continue;
      }
      let t1 = (b.min[axis] - o) / d;
      let t2 = (b.max[axis] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tMin) {
        tMin = t1;
        entryAxis = axis;
      }
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        ok = false;
        break;
      }
    }
    if (!ok || entryAxis === null || tMin >= best.dist) continue;
    const normal = { x: 0, y: 0, z: 0 };
    normal[entryAxis] = dir[entryAxis] > 0 ? -1 : 1;
    best = { dist: tMin, normal };
  }
  return best;
}

/** Mirror a direction off a surface. */
export function reflect(dir: Vec3, normal: Vec3): Vec3 {
  const d = dir.x * normal.x + dir.y * normal.y + dir.z * normal.z;
  return { x: dir.x - 2 * d * normal.x, y: dir.y - 2 * d * normal.y, z: dir.z - 2 * d * normal.z };
}
