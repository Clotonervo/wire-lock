import type { Box, JumpPad, MapDef, PickupDef, SpawnPoint, Vec3 } from "../types";
import { getWeapon } from "../weapons";

const PICKUP_KINDS: ReadonlySet<string> = new Set(["health", "weapon"]);

function fail(path: string, what: string): never {
  throw new Error(`invalid map: ${path} ${what}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "should be an object");
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "should be a number");
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) fail(path, "should be a non-empty string");
  return v;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "should be an array");
  return v;
}

function vec(v: unknown, path: string): Vec3 {
  const o = obj(v, path);
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`), z: num(o.z, `${path}.z`) };
}

function box(v: unknown, path: string): Box {
  const o = obj(v, path);
  const min = vec(o.min, `${path}.min`);
  const max = vec(o.max, `${path}.max`);
  if (min.x >= max.x || min.y >= max.y || min.z >= max.z) fail(path, "has min >= max");
  const b: Box = { min, max };
  if (o.color !== undefined) b.color = str(o.color, `${path}.color`);
  if (o.invisible !== undefined) b.invisible = o.invisible === true;
  return b;
}

/**
 * Validates a map loaded from JSON (DESIGN.md §6.2) and returns it typed. Throws
 * with the path of the first problem, so a broken map fails loudly at start-up.
 */
export function parseMapDef(raw: unknown): MapDef {
  const o = obj(raw, "map");
  const boxes = arr(o.boxes, "boxes").map((b, i) => box(b, `boxes[${i}]`));
  const spawns: SpawnPoint[] = arr(o.spawns, "spawns").map((s, i) => {
    const so = obj(s, `spawns[${i}]`);
    return { pos: vec(so.pos, `spawns[${i}].pos`), yaw: num(so.yaw, `spawns[${i}].yaw`) };
  });
  if (spawns.length === 0) fail("spawns", "should not be empty");
  const map: MapDef = { id: str(o.id, "id"), name: str(o.name, "name"), boxes, spawns };
  if (o.jumpPads !== undefined) {
    map.jumpPads = arr(o.jumpPads, "jumpPads").map((p, i): JumpPad => {
      const b = box(p, `jumpPads[${i}]`);
      return { min: b.min, max: b.max, launch: vec(obj(p, `jumpPads[${i}]`).launch, `jumpPads[${i}].launch`) };
    });
  }
  if (o.pickups !== undefined) {
    map.pickups = arr(o.pickups, "pickups").map((p, i): PickupDef => {
      const po = obj(p, `pickups[${i}]`);
      const kind = str(po.kind, `pickups[${i}].kind`);
      if (!PICKUP_KINDS.has(kind)) fail(`pickups[${i}].kind`, `is unknown ("${kind}")`);
      const pickup: PickupDef = { pos: vec(po.pos, `pickups[${i}].pos`), kind: kind as PickupDef["kind"] };
      if (kind === "weapon") {
        const weapon = str(po.weapon, `pickups[${i}].weapon`);
        if (!getWeapon(weapon)) fail(`pickups[${i}].weapon`, `is unknown ("${weapon}")`);
        pickup.weapon = weapon;
      }
      return pickup;
    });
  }
  return map;
}
