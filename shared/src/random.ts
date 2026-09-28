import type { Vec3 } from "./types";

export type Rng = () => number;

/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tilts a unit direction by a random angle up to `spreadRad`, uniformly over the
 * cone's area. The caller supplies the RNG so shared code stays deterministic
 * (DESIGN.md §6.3).
 */
export function applySpread(dir: Vec3, spreadRad: number, rng: Rng): Vec3 {
  if (spreadRad <= 0) return { ...dir };
  const angle = spreadRad * Math.sqrt(rng());
  const around = 2 * Math.PI * rng();

  // Any unit vector perpendicular to dir, then a second one to complete the basis.
  const ref = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(dir, ref));
  const v = cross(dir, u);

  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const cu = Math.cos(around) * s;
  const cv = Math.sin(around) * s;
  return normalize({
    x: dir.x * c + u.x * cu + v.x * cv,
    y: dir.y * c + u.y * cu + v.y * cv,
    z: dir.z * c + u.z * cu + v.z * cv,
  });
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
