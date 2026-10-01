import { PLAYER_HEIGHT, playerBox, pointAlong, rayBox, rayBoxes } from "@wire-lock/shared";
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

/** Tolerance for "nothing in the way" checks along a line. */
const LOS_EPSILON = 1e-3;
/** Points up the body (fractions of height) that bullet magnetism measures the near miss against: legs, chest, head. */
const ASSIST_HEIGHTS = [0.25, 0.55, 0.85];

/**
 * Resolves one hitscan ray against the map and the given players' AABBs (the
 * caller passes lag-compensated positions, DESIGN.md §5.5). With `assistRad`
 * (Magnetic Rounds), a ray that misses everyone still hits a player if some point
 * up their body (legs, chest or head) is within that angle of the ray and in clear sight.
 */
export function resolveHitscan(
  origin: Vec3,
  dir: Vec3,
  range: number,
  boxes: readonly Box[],
  targets: readonly HitscanTarget[],
  assistRad = 0,
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
  if (target === null && assistRad > 0) {
    // The player closest to the line of fire, within the assist angle.
    let best: HitscanResult | null = null;
    let bestAngle = assistRad;
    for (const t of targets) {
      for (const h of ASSIST_HEIGHTS) {
        const point = { x: t.pos.x, y: t.pos.y + PLAYER_HEIGHT * h, z: t.pos.z };
        const v = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
        const d = Math.hypot(v.x, v.y, v.z);
        if (d === 0 || d > range) continue;
        const unit = { x: v.x / d, y: v.y / d, z: v.z / d };
        const angle = Math.acos(Math.min(1, unit.x * dir.x + unit.y * dir.y + unit.z * dir.z));
        if (angle > bestAngle || rayBoxes(origin, unit, boxes, d) < d - LOS_EPSILON) continue;
        bestAngle = angle;
        best = { target: t.id, dist: d, end: point };
      }
    }
    if (best) return best;
  }
  return { target, dist, end: pointAlong(origin, dir, dist) };
}
