import { playerBox } from "./collision";
import { PLAYER_HEIGHT } from "./constants";
import { pointAlong, rayBox, rayBoxes } from "./raycast";
import type { Box, Vec3 } from "./types";
import type { WeaponDef } from "./weapons";

/** A projectile, owned by the player whose input fired it. Pure data. */
export interface Projectile {
  /** The owner's input seq that fired it; unique per owner. */
  shotSeq: number;
  weapon: string;
  pos: Vec3;
  vel: Vec3;
  ageMs: number;
}

export interface ProjectileTarget {
  id: string;
  pos: Vec3;
}

export interface ProjectileStep {
  projectile: Projectile;
  /** Set when it hit something (or expired) this step. */
  explodedAt: Vec3 | null;
  /** Player hit directly, if any. */
  direct: string | null;
}

/** Tolerance so explosions register when the target is just touching the blast. */
const BLAST_LOS_EPSILON = 1e-3;

function expand(b: Box, r: number): Box {
  return {
    min: { x: b.min.x - r, y: b.min.y - r, z: b.min.z - r },
    max: { x: b.max.x + r, y: b.max.y + r, z: b.max.z + r },
  };
}

/**
 * Moves a projectile one step, sweeping it (as a sphere) against the map and
 * the given players. Deterministic: the owner's client runs it to predict its
 * own rockets (DESIGN.md §5.5).
 */
export function stepProjectile(
  p: Projectile,
  weapon: WeaponDef,
  boxes: readonly Box[],
  targets: readonly ProjectileTarget[],
  dt: number,
): ProjectileStep {
  const def = weapon.projectile;
  const vel = { ...p.vel };
  if (def?.gravity) vel.y -= def.gravity * dt;
  const radius = def?.radius ?? 0;
  const ageMs = p.ageMs + dt * 1000;

  const delta = { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt };
  const len = Math.hypot(delta.x, delta.y, delta.z);
  const dir = len > 0 ? { x: delta.x / len, y: delta.y / len, z: delta.z / len } : { x: 0, y: 0, z: -1 };

  let hitDist = len;
  let hit = false;
  let direct: string | null = null;
  for (const b of boxes) {
    const t = rayBox(p.pos, dir, expand(b, radius), hitDist);
    if (t !== null && (t < hitDist || !hit)) {
      hitDist = t;
      hit = true;
    }
  }
  for (const target of targets) {
    const t = rayBox(p.pos, dir, expand(playerBox(target.pos), radius), hitDist);
    if (t !== null && (t < hitDist || !hit)) {
      hitDist = t;
      hit = true;
      direct = target.id;
    }
  }

  if (hit) {
    const at = pointAlong(p.pos, dir, hitDist);
    return { projectile: { ...p, pos: at, vel, ageMs }, explodedAt: at, direct };
  }
  const pos = { x: p.pos.x + delta.x, y: p.pos.y + delta.y, z: p.pos.z + delta.z };
  const expired = ageMs >= (def?.lifetimeMs ?? 0);
  return { projectile: { ...p, pos, vel, ageMs }, explodedAt: expired ? pos : null, direct: null };
}

export interface BlastEffect {
  damage: number;
  impulse: Vec3;
}

/**
 * What an explosion at `center` does to a player standing at `pos`: damage and
 * knockback fall off linearly with distance to the player's box, and walls
 * block it. Null when out of range or out of sight.
 */
export function blastEffect(center: Vec3, pos: Vec3, weapon: WeaponDef, boxes: readonly Box[]): BlastEffect | null {
  const radius = weapon.projectile?.splashRadius ?? 0;
  if (radius <= 0) return null;

  const box = playerBox(pos);
  const closest = {
    x: Math.min(Math.max(center.x, box.min.x), box.max.x),
    y: Math.min(Math.max(center.y, box.min.y), box.max.y),
    z: Math.min(Math.max(center.z, box.min.z), box.max.z),
  };
  const d = Math.hypot(closest.x - center.x, closest.y - center.y, closest.z - center.z);
  if (d > radius) return null;

  const body = { x: pos.x, y: pos.y + PLAYER_HEIGHT / 2, z: pos.z };
  const toBody = { x: body.x - center.x, y: body.y - center.y, z: body.z - center.z };
  const bodyDist = Math.hypot(toBody.x, toBody.y, toBody.z);
  const dir = bodyDist > 0 ? { x: toBody.x / bodyDist, y: toBody.y / bodyDist, z: toBody.z / bodyDist } : { x: 0, y: 1, z: 0 };
  if (bodyDist > 0 && rayBoxes(center, dir, boxes, bodyDist) < bodyDist - BLAST_LOS_EPSILON) return null;

  const f = 1 - d / radius;
  const k = (weapon.knockback ?? 0) * f;
  return {
    damage: (weapon.projectile?.splashDamage ?? 0) * f,
    impulse: { x: dir.x * k, y: dir.y * k, z: dir.z * k },
  };
}
