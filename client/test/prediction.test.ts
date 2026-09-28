import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, TICK_DT, stepPlayer, testArena } from "@wire-lock/shared";
import type { InputCmd, PlayerMoveState } from "@wire-lock/shared";
import { Predictor } from "../src/net/prediction";

const start: PlayerMoveState = { pos: { x: 0, y: COLLISION_SKIN, z: 12 }, vel: { x: 0, y: 0, z: 0 }, onGround: true };

function cmd(seq: number, z: -1 | 0 | 1 = 1): InputCmd {
  return { seq, dt: TICK_DT, move: { x: 0, z }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false };
}

/** What the server would have after processing the given commands. */
function serverAfter(cmds: InputCmd[]): PlayerMoveState {
  return cmds.reduce((s, c) => stepPlayer(s, c, testArena, c.dt), start);
}

describe("Predictor", () => {
  it("applies inputs immediately and keeps them pending", () => {
    const p = new Predictor(start, testArena);
    p.apply(cmd(0));
    p.apply(cmd(1));
    expect(p.pending).toHaveLength(2);
    expect(p.state.pos.z).toBeLessThan(start.pos.z);
  });

  it("reconciles with zero error when the server agrees", () => {
    const p = new Predictor(start, testArena);
    const cmds = Array.from({ length: 10 }, (_, i) => cmd(i));
    cmds.forEach((c) => p.apply(c));
    const predicted = p.state;

    // Server has processed the first 6.
    const err = p.reconcile(serverAfter(cmds.slice(0, 6)), 5);
    expect(err).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.pending.map((c) => c.seq)).toEqual([6, 7, 8, 9]);
    expect(p.state).toEqual(predicted);
  });

  it("rebases on the server and replays pending inputs when they disagree", () => {
    const p = new Predictor(start, testArena);
    const cmds = Array.from({ length: 6 }, (_, i) => cmd(i));
    cmds.forEach((c) => p.apply(c));

    // The server says we were shoved 0.5 units sideways after seq 2.
    const shoved = serverAfter(cmds.slice(0, 3));
    shoved.pos = { ...shoved.pos, x: 0.5 };
    const err = p.reconcile(shoved, 2);

    expect(err.x).toBeCloseTo(-0.5);
    expect(p.state.pos.x).toBeCloseTo(0.5);
    const expected = cmds.slice(3).reduce((s, c) => stepPlayer(s, c, testArena, c.dt), shoved);
    expect(p.state).toEqual(expected);
  });

  it("doesn't move while dead, but still tracks pending inputs", () => {
    const p = new Predictor(start, testArena);
    p.alive = false;
    p.apply(cmd(0));
    expect(p.state).toEqual(start);
    expect(p.pending).toHaveLength(1);

    const err = p.reconcile(start, -1, false);
    expect(err).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.state).toEqual(start);
  });

  it("drops everything once the server has caught up", () => {
    const p = new Predictor(start, testArena);
    const cmds = [cmd(0), cmd(1)];
    cmds.forEach((c) => p.apply(c));
    p.reconcile(serverAfter(cmds), 1);
    expect(p.pending).toHaveLength(0);
  });
});
