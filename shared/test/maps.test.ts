import { describe, expect, it } from "vitest";
import { COLLISION_SKIN, MAPS, TICK_DT, boxesOverlap, parseMapDef, playerBox, scaffold, stepPlayer } from "../src";
import type { MoveInput, PlayerMoveState } from "../src";

const idle: MoveInput = { move: { x: 0, z: 0 }, jump: false, yaw: 0 };

describe("parseMapDef", () => {
  const minimal = {
    id: "m",
    name: "M",
    boxes: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }],
    spawns: [{ pos: { x: 0, y: 2, z: 0 }, yaw: 0 }],
  };

  it("accepts a valid map", () => {
    expect(parseMapDef(minimal).id).toBe("m");
  });

  it("rejects broken maps, naming the problem", () => {
    expect(() => parseMapDef({ ...minimal, spawns: [] })).toThrow(/spawns/);
    expect(() => parseMapDef({ ...minimal, boxes: [{ min: { x: 1, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } }] })).toThrow(/boxes\[0\]/);
    expect(() => parseMapDef({ ...minimal, boxes: [{ min: { x: "a", y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }] })).toThrow(/boxes\[0\].min.x/);
    expect(() => parseMapDef({ ...minimal, pickups: [{ pos: { x: 0, y: 0, z: 0 }, kind: "ammo" }] })).toThrow(/unknown/);
  });
});

describe.each(Object.values(MAPS))("map $name", (map) => {
  it("has spawns standing clear of all geometry", () => {
    for (const s of map.spawns) {
      const body = playerBox({ ...s.pos, y: s.pos.y + COLLISION_SKIN });
      expect(map.boxes.some((b) => boxesOverlap(body, b))).toBe(false);
    }
  });

  it("has every spawn standing on something (it doesn't fall far)", () => {
    for (const s of map.spawns) {
      let st: PlayerMoveState = { pos: { ...s.pos }, vel: { x: 0, y: 0, z: 0 }, onGround: false };
      for (let i = 0; i < 30; i++) st = stepPlayer(st, idle, map, TICK_DT);
      expect(st.onGround).toBe(true);
      expect(Math.abs(st.pos.y - s.pos.y)).toBeLessThan(0.1);
    }
  });

  it("has pickups out in the open", () => {
    for (const p of map.pickups ?? []) {
      const probe = playerBox({ ...p.pos, y: p.pos.y + COLLISION_SKIN });
      expect(map.boxes.some((b) => boxesOverlap(probe, b))).toBe(false);
    }
  });
});

describe("Scaffold jump pads", () => {
  it.each(scaffold.jumpPads ?? [])("pad at z=$min.z launches you onto its platform", (pad) => {
    const centre = { x: (pad.min.x + pad.max.x) / 2, y: COLLISION_SKIN, z: (pad.min.z + pad.max.z) / 2 };
    let st: PlayerMoveState = { pos: centre, vel: { x: 0, y: 0, z: 0 }, onGround: true };
    let launched = false;
    for (let i = 0; i < 90; i++) {
      st = stepPlayer(st, idle, scaffold, TICK_DT);
      if (st.vel.y > 10) launched = true;
    }
    expect(launched).toBe(true);
    expect(st.onGround).toBe(true);
    expect(st.pos.y).toBeCloseTo(4, 1); // the platform top
  });
});
