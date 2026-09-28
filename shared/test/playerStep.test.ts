import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, GRAVITY, JUMP_SPEED, MAX_PITCH, TICK_DT, createArms, stepInput, testArena } from "../src";
import type { InputCmd, PlayerSim, Projectile } from "../src";

function cmd(seq: number, over: Partial<InputCmd> = {}): InputCmd {
  return { seq, dt: TICK_DT, move: { x: 0, z: 0 }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false, reload: false, ...over };
}

function standing(slots = ["rocket"]): PlayerSim {
  return { move: { pos: { x: 8, y: COLLISION_SKIN, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: true }, arms: createArms(slots), alive: true };
}

/** Runs inputs through stepInput, carrying projectiles along. */
function run(sim: PlayerSim, cmds: InputCmd[]) {
  let s = sim;
  let projectiles: Projectile[] = [];
  const log = [];
  for (const c of cmds) {
    const r = stepInput(s, projectiles, c, testArena, { canFire: true, targets: [] });
    s = r.sim;
    projectiles = r.projectiles;
    log.push(r);
  }
  return { sim: s, projectiles, log };
}

describe("stepInput", () => {
  it("fires a rocket that flies and later explodes on a wall", () => {
    const cmds = [cmd(0, { fire: true }), ...Array.from({ length: 60 }, (_, i) => cmd(i + 1))];
    const r = run(standing(), cmds);
    expect(r.log[0]?.spawned?.shotSeq).toBe(0);
    const exploded = r.log.findIndex((l) => l.explosions.length > 0);
    expect(exploded).toBeGreaterThan(0);
    expect(r.projectiles).toHaveLength(0);
  });

  it("rocket jumps: shooting at your feet launches you far higher than a normal jump", () => {
    const lookDown = { pitch: -MAX_PITCH };
    const r = run(standing(), [cmd(0, { fire: true, jump: true, ...lookDown }), ...Array.from({ length: 30 }, (_, i) => cmd(i + 1, lookDown))]);
    const exploded = r.log.findIndex((l) => l.explosions.length > 0);
    expect(exploded).toBeGreaterThanOrEqual(0);
    // The eye starts 1.6 up (a bit more after jumping) and the rocket covers ~0.73 per input.
    expect(exploded).toBeLessThanOrEqual(2);
    const peak = Math.max(...r.log.map((l) => l.sim.move.pos.y));
    const normalJumpPeak = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    expect(peak).toBeGreaterThan(normalJumpPeak * 3);
  });

  it("is deterministic, so the client replays exactly what the server did", () => {
    const cmds = Array.from({ length: 90 }, (_, i) =>
      cmd(i, { fire: i % 20 === 0, pitch: i % 40 < 20 ? -1.2 : -0.2, yaw: i * 0.05, move: { x: 0, z: 1 }, jump: i % 25 === 0 }),
    );
    expect(run(standing(), cmds)).toEqual(run(standing(), cmds));
  });

  it("dead players don't move or fire, but their rockets keep flying", () => {
    const fired = run(standing(), [cmd(0, { fire: true })]);
    const dead = { ...fired.sim, alive: false };
    const r = stepInput(dead, fired.projectiles, cmd(1, { fire: true, move: { x: 0, z: 1 } }), testArena, { canFire: true, targets: [] });
    expect(r.sim.move).toEqual(dead.move);
    expect(r.fired).toBeNull();
    expect(r.projectiles[0]?.pos.z).not.toBe(fired.projectiles[0]?.pos.z);
  });
});
