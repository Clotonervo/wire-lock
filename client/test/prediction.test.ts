import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, MAX_PITCH, TICK_DT, createArms, stepInput, testArena } from "@wire-lock/shared";
import type { InputCmd, PlayerSim, Projectile } from "@wire-lock/shared";
import { Predictor } from "../src/net/prediction";

const start: PlayerSim = {
  move: { pos: { x: 8, y: COLLISION_SKIN, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: true },
  arms: createArms(["pistol", "shotgun", "rocket"]),
  alive: true,
};

function cmd(seq: number, over: Partial<InputCmd> = {}): InputCmd {
  return { seq, dt: TICK_DT, move: { x: 0, z: 1 }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false, reload: false, ...over };
}

/** What the server would have after processing the given commands (no other players around). */
function serverAfter(cmds: InputCmd[], from: PlayerSim = start): { sim: PlayerSim; projectiles: Projectile[] } {
  let sim = from;
  let projectiles: Projectile[] = [];
  for (const c of cmds) {
    const r = stepInput(sim, projectiles, c, testArena, { canFire: true, targets: [] });
    sim = r.sim;
    projectiles = r.projectiles;
  }
  return { sim, projectiles };
}

describe("Predictor", () => {
  it("applies inputs immediately and keeps them pending", () => {
    const p = new Predictor(start, [], testArena);
    p.apply(cmd(0), true);
    p.apply(cmd(1), true);
    expect(p.pending).toHaveLength(2);
    expect(p.state.pos.z).toBeLessThan(start.move.pos.z);
  });

  it("reconciles with zero error when the server agrees, including rockets in flight", () => {
    const p = new Predictor(start, [], testArena);
    const cmds = [cmd(0, { weaponSlot: 2 }), ...Array.from({ length: 8 }, (_, i) => cmd(i + 1)), cmd(9, { fire: true, pitch: -0.3 }), cmd(10), cmd(11)];
    cmds.forEach((c) => p.apply(c, true));
    const predicted = { sim: p.sim, projectiles: p.projectiles };
    expect(predicted.projectiles).toHaveLength(1);

    // Server has processed up to seq 10: the rocket is in its state, seq 11 is still pending.
    const server = serverAfter(cmds.slice(0, 11));
    const err = p.reconcile(server.sim, server.projectiles, 10, true);
    expect(err).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.pending.map((c) => c.seq)).toEqual([11]);
    expect({ sim: p.sim, projectiles: p.projectiles }).toEqual(predicted);
  });

  it("predicts a rocket jump exactly", () => {
    const p = new Predictor(start, [], testArena);
    const down = { pitch: -MAX_PITCH, move: { x: 0 as const, z: 0 as const } };
    const cmds = [cmd(0, { weaponSlot: 2, ...down }), ...Array.from({ length: 7 }, (_, i) => cmd(i + 1, down)), cmd(8, { fire: true, jump: true, ...down }), ...Array.from({ length: 10 }, (_, i) => cmd(i + 9, down))];
    const results = cmds.map((c) => p.apply(c, true));
    expect(results.some((r) => r.explosions.length > 0)).toBe(true);
    expect(p.state.pos.y).toBeGreaterThan(3);

    const server = serverAfter(cmds);
    expect(p.reconcile(server.sim, server.projectiles, cmds.length - 1, true)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("rebases on the server and replays pending inputs when they disagree", () => {
    const p = new Predictor(start, [], testArena);
    const cmds = Array.from({ length: 6 }, (_, i) => cmd(i));
    cmds.forEach((c) => p.apply(c, true));

    // The server says we were shoved 0.5 units sideways after seq 2.
    const shoved = serverAfter(cmds.slice(0, 3));
    shoved.sim = { ...shoved.sim, move: { ...shoved.sim.move, pos: { ...shoved.sim.move.pos, x: shoved.sim.move.pos.x + 0.5 } } };
    const err = p.reconcile(shoved.sim, shoved.projectiles, 2, true);

    expect(err.x).toBeCloseTo(-0.5);
    expect(p.sim).toEqual(serverAfter(cmds.slice(3), shoved.sim).sim);
  });

  it("doesn't move while dead, but still tracks pending inputs", () => {
    const dead = { ...start, alive: false };
    const p = new Predictor(dead, [], testArena);
    p.apply(cmd(0), true);
    expect(p.state).toEqual(start.move);
    expect(p.pending).toHaveLength(1);
    expect(p.reconcile(dead, [], -1, true)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("drops everything once the server has caught up", () => {
    const p = new Predictor(start, [], testArena);
    const cmds = [cmd(0), cmd(1)];
    cmds.forEach((c) => p.apply(c, true));
    const server = serverAfter(cmds);
    p.reconcile(server.sim, server.projectiles, 1, true);
    expect(p.pending).toHaveLength(0);
  });
});
