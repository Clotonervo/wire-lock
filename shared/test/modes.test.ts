import { describe, expect, it } from "vitest";
import { GUN_GAME_LADDER, GUN_GAME_TOTAL_KILLS, gunGameLevel, stepArms, createArms, TICK_DT, chamberPistol } from "../src";

describe("gunGameLevel", () => {
  it("moves up a step after each step's kills", () => {
    expect(gunGameLevel(0)).toBe(0);
    expect(gunGameLevel(1)).toBe(0);
    expect(gunGameLevel(2)).toBe(1);
    expect(gunGameLevel(4)).toBe(2);
    expect(gunGameLevel(6)).toBe(3);
  });

  it("stays on the last step once the round is won", () => {
    expect(gunGameLevel(GUN_GAME_TOTAL_KILLS)).toBe(GUN_GAME_LADDER.length - 1);
    expect(GUN_GAME_LADDER[GUN_GAME_LADDER.length - 1]?.weapon).toBe("wrench");
  });
});

describe("chamber pistol", () => {
  it("has one bullet and never reloads", () => {
    const cmd = { seq: 0, dt: TICK_DT, move: { x: 0, z: 0 } as const, jump: false, yaw: 0, pitch: 0, fire: true, altFire: false, reload: false };
    let arms = createArms([chamberPistol.id]);
    expect(arms.ammo[0]).toBe(1);
    const shot = stepArms(arms, cmd, true);
    expect(shot.fired).toBe(chamberPistol);
    arms = shot.arms;
    for (let i = 0; i < 200; i++) arms = stepArms(arms, { ...cmd, reload: true }, true).arms;
    expect(arms.ammo[0]).toBe(0);
    expect(arms.reloadMs).toBe(0);
  });
});
