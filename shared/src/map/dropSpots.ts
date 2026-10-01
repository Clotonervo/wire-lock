import { boxesOverlap, playerBox } from "../collision";
import { COLLISION_SKIN, DROP_AVOID_PLAYERS, DROP_BOUNDS_MARGIN, DROP_MAX_SURFACE_Y, DROP_SPOT_TRIES } from "../constants";
import { rayBoxes } from "../raycast";
import type { MapDef, Vec3 } from "../types";

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
/** How far below `from` we look for ground. */
const GROUND_SEARCH = 100;
/** Supply drops are aimed from this high, so they land on whatever's on top (platform, bridge). */
const DROP_FROM_Y = 30;

/** Height of the first surface straight down from `from`, or null if there's nothing below. */
export function groundBelow(map: MapDef, from: Vec3): number | null {
  const t = rayBoxes(from, DOWN, map.boxes, GROUND_SEARCH);
  return t >= GROUND_SEARCH ? null : from.y - t;
}

/** Whether a player standing at `pos` fits there and isn't on a jump pad. */
export function standsClear(map: MapDef, pos: Vec3): boolean {
  const body = playerBox({ ...pos, y: pos.y + COLLISION_SKIN });
  return !map.boxes.some((b) => boxesOverlap(body, b)) && !(map.jumpPads ?? []).some((p) => boxesOverlap(body, p));
}

/** The area players can be in: the spawns' bounding box plus a margin. */
function playArea(map: MapDef): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = map.spawns.map((s) => s.pos.x);
  const zs = map.spawns.map((s) => s.pos.z);
  return {
    minX: Math.min(...xs) - DROP_BOUNDS_MARGIN,
    maxX: Math.max(...xs) + DROP_BOUNDS_MARGIN,
    minZ: Math.min(...zs) - DROP_BOUNDS_MARGIN,
    maxZ: Math.max(...zs) + DROP_BOUNDS_MARGIN,
  };
}

/**
 * A random spot for a supply drop: on top of whatever is there (floor, platform,
 * bridge), reachable without a rocket jump, clear of geometry and jump pads, and
 * preferably away from `avoid` (living players), so it's a race rather than a gift.
 */
export function findDropSpot(map: MapDef, random: () => number, avoid: readonly Vec3[] = []): Vec3 | null {
  const area = playArea(map);
  let fallback: Vec3 | null = null;
  for (let i = 0; i < DROP_SPOT_TRIES; i++) {
    const x = area.minX + random() * (area.maxX - area.minX);
    const z = area.minZ + random() * (area.maxZ - area.minZ);
    const y = groundBelow(map, { x, y: DROP_FROM_Y, z });
    if (y === null || y > DROP_MAX_SURFACE_Y) continue;
    const spot = { x, y, z };
    if (!standsClear(map, spot)) continue;
    if (avoid.every((p) => Math.hypot(p.x - x, p.z - z) >= DROP_AVOID_PLAYERS)) return spot;
    fallback ??= spot;
  }
  return fallback;
}
