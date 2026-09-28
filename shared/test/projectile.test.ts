import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, TICK_DT, blastEffect, rocketLauncher, stepProjectile, testArena } from "../src";
import type { Box, Projectile } from "../src";

const rocket = rocketLauncher;
const speed = rocket.projectile?.speed ?? 0;
const radius = rocket.projectile?.radius ?? 0;
const splash = rocket.projectile?.splashRadius ?? 0;
const wall: Box = { min: { x: -5, y: 0, z: -10 }, max: { x: 5, y: 4, z: -9 } };

function flying(z = 0): Projectile {
  return { shotSeq: 1, weapon: rocket.id, pos: { x: 0, y: 1.5, z }, vel: { x: 0, y: 0, z: -speed }, ageMs: 0 };
}

describe("stepProjectile", () => {
  it("flies in a straight line when nothing is in the way", () => {
    const s = stepProjectile(flying(), rocket, [wall], [], TICK_DT);
    expect(s.explodedAt).toBeNull();
    expect(s.projectile.pos.z).toBeCloseTo(-speed * TICK_DT);
  });

  it("explodes on the wall surface, one radius out", () => {
    const s = stepProjectile(flying(-8.5), rocket, [wall], [], TICK_DT);
    expect(s.explodedAt?.z).toBeCloseTo(wall.max.z + radius);
    expect(s.direct).toBeNull();
  });

  it("hits a player directly", () => {
    const s = stepProjectile(flying(-1), rocket, [wall], [{ id: "p", pos: { x: 0, y: 0, z: -1.5 } }], TICK_DT);
    expect(s.direct).toBe("p");
  });

  it("explodes when its lifetime runs out", () => {
    const old = { ...flying(), ageMs: (rocket.projectile?.lifetimeMs ?? 0) - 1 };
    expect(stepProjectile(old, rocket, [], [], TICK_DT).explodedAt).not.toBeNull();
  });
});

describe("blastEffect", () => {
  const standing = { x: 0, y: COLLISION_SKIN, z: 0 };

  it("does full damage and pushes up from an explosion at your feet", () => {
    // An open spot on the test arena's floor.
    const b = blastEffect({ x: 8, y: radius, z: 12 }, { x: 8, y: COLLISION_SKIN, z: 12 }, rocket, testArena.boxes);
    expect(b?.damage).toBeCloseTo(rocket.projectile?.splashDamage ?? 0);
    expect(b?.impulse.y).toBeGreaterThan((rocket.knockback ?? 0) * 0.9);
  });

  it("falls off with distance and stops at the splash radius", () => {
    const near = blastEffect({ x: 1.5, y: 1, z: 0 }, standing, rocket, []);
    const far = blastEffect({ x: splash + 0.5, y: 1, z: 0 }, standing, rocket, []);
    expect(near?.damage).toBeGreaterThan(0);
    expect(near?.damage).toBeLessThan(rocket.projectile?.splashDamage ?? 0);
    expect(near?.impulse.x).toBeLessThan(0);
    expect(far).toBeNull();
  });

  it("is blocked by walls", () => {
    const between: Box = { min: { x: 0.8, y: 0, z: -2 }, max: { x: 1, y: 3, z: 2 } };
    expect(blastEffect({ x: 2, y: 1, z: 0 }, standing, rocket, [between])).toBeNull();
  });
});
