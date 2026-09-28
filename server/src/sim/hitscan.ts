import { playerBox, pointAlong, rayBox, rayBoxes } from "@wire-lock/shared";
import type { Box, Vec3 } from "@wire-lock/shared";

export interface HitscanTarget {
  id: string;
  pos: Vec3;
}

export interface HitscanResult {
  /** Session id of the player hit, or null if the shot hit the map or nothing. */
  target: string | null;
  dist: number;
  end: Vec3;
}

/**
 * Resolves one hitscan ray against the map and the given players' AABBs, at
 * their current server positions (no lag compensation in v1, DESIGN.md §5.5).
 */
export function resolveHitscan(
  origin: Vec3,
  dir: Vec3,
  range: number,
  boxes: readonly Box[],
  targets: readonly HitscanTarget[],
): HitscanResult {
  let dist = rayBoxes(origin, dir, boxes, range);
  let target: string | null = null;
  for (const t of targets) {
    const d = rayBox(origin, dir, playerBox(t.pos), dist);
    if (d !== null && d < dist) {
      dist = d;
      target = t.id;
    }
  }
  return { target, dist, end: pointAlong(origin, dir, dist) };
}
