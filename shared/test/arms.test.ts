import { describe, expect, it } from "vitest";
import { INFINITE_AMMO, TICK_DT, TICK_MS, WEAPON_SWITCH_MS, createArms, pistol, shotgun, stepArms } from "../src";
import type { ArmsState, InputCmd } from "../src";

function cmd(over: Partial<InputCmd> = {}): InputCmd {
  return { seq: 0, dt: TICK_DT, move: { x: 0, z: 0 }, jump: false, yaw: 0, pitch: 0, fire: false, altFire: false, reload: false, ...over };
}

/** Runs n inputs, returning the final state and how many shots fired. */
function run(arms: ArmsState, n: number, over: Partial<InputCmd> = {}, canFire = true) {
  let a = arms;
  let shots = 0;
  for (let i = 0; i < n; i++) {
    const r = stepArms(a, cmd(over), canFire);
    a = r.arms;
    if (r.fired) shots++;
  }
  return { arms: a, shots };
}

describe("stepArms", () => {
  it("starts with full magazines", () => {
    const a = createArms(["pistol", "shotgun"]);
    expect(a.ammo).toEqual([pistol.magazine, shotgun.magazine]);
    expect(a.current).toBe(0);
  });

  it("fires at the weapon's rate and uses ammo", () => {
    const seconds = 2;
    const { arms, shots } = run(createArms(["pistol"]), Math.round(seconds * 1000 / TICK_MS), { fire: true });
    // One shot per ceil(250 / 33.3) = 8 inputs.
    expect(shots).toBe(Math.ceil((seconds * 1000) / (8 * TICK_MS)));
    expect(arms.ammo[0]).toBe((pistol.magazine ?? 0) - shots);
  });

  it("won't fire between rounds", () => {
    expect(run(createArms(["pistol"]), 30, { fire: true }, false).shots).toBe(0);
  });

  it("auto-reloads when the magazine empties, then refills", () => {
    let a = createArms(["shotgun"]);
    a = { ...a, ammo: [1] };
    const first = stepArms(a, cmd({ fire: true }), true);
    expect(first.fired).toBe(shotgun);
    expect(first.reloadStarted).toBe(true);
    expect(first.arms.ammo[0]).toBe(0);

    const reloadInputs = Math.ceil((shotgun.reloadMs ?? 0) / TICK_MS);
    const almost = run(first.arms, reloadInputs - 1).arms;
    expect(almost.ammo[0]).toBe(0);
    const done = run(almost, 1).arms;
    expect(done.ammo[0]).toBe(shotgun.magazine);
    expect(done.reloadMs).toBe(0);
  });

  it("can't fire while reloading", () => {
    const a = { ...createArms(["pistol"]), ammo: [5] };
    const r = stepArms(a, cmd({ reload: true, fire: true }), true);
    expect(r.reloadStarted).toBe(true);
    expect(r.fired).toBeNull();
  });

  it("ignores reload with a full magazine", () => {
    expect(stepArms(createArms(["pistol"]), cmd({ reload: true }), true).reloadStarted).toBe(false);
  });

  it("switches weapons, cancelling reloads and adding a short delay", () => {
    const a = { ...createArms(["pistol", "shotgun"]), ammo: [3, 6], reloadMs: 500 };
    const r = stepArms(a, cmd({ weaponSlot: 1, fire: true }), true);
    expect(r.switched).toBe(true);
    expect(r.arms.current).toBe(1);
    expect(r.arms.reloadMs).toBe(0);
    expect(r.fired).toBeNull();
    expect(r.arms.cooldownMs).toBeCloseTo(WEAPON_SWITCH_MS - TICK_MS);
  });

  it("ignores invalid slots", () => {
    const r = stepArms(createArms(["pistol"]), cmd({ weaponSlot: 5 }), true);
    expect(r.switched).toBe(false);
    expect(r.arms.current).toBe(0);
  });

  it("never runs out with infinite ammo", () => {
    const a = { ...createArms(["pistol"]), ammo: [INFINITE_AMMO] };
    const r = run(a, 100, { fire: true });
    expect(r.shots).toBeGreaterThan(10);
    expect(r.arms.ammo[0]).toBe(INFINITE_AMMO);
  });

  it("does not mutate its input", () => {
    const a = createArms(["pistol"]);
    const copy = JSON.parse(JSON.stringify(a)) as ArmsState;
    stepArms(a, cmd({ fire: true }), true);
    expect(a).toEqual(copy);
  });
});
