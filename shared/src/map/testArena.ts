import type { Box, MapDef, SpawnPoint } from "../types";

const FLOOR = "#5b6470";
const WALL = "#3d434c";
const CRATE = "#b07a3c";
const PLATFORM = "#4f7a9a";

const HALF = 20;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 1;
/** Invisible walls continue up to here, so rocket jumps can't clear the visible ones. */
const CLIP_HEIGHT = 60;
const SPAWN_INSET = 16;

function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, color: string): Box {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, color };
}

function clip(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Box {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, invisible: true };
}

/** A spawn on the floor, facing the centre of the arena. */
function spawnFacingCentre(x: number, z: number): SpawnPoint {
  return { pos: { x, y: 0, z }, yaw: Math.atan2(x, z) };
}

/** A small walled square with crates and a raised platform to climb onto. */
export const testArena: MapDef = {
  id: "test-arena",
  name: "Test Arena",
  boxes: [
    // Floor
    box(-HALF, -1, -HALF, HALF, 0, HALF, FLOOR),
    // Outer walls
    box(-HALF - WALL_THICKNESS, 0, -HALF - WALL_THICKNESS, HALF + WALL_THICKNESS, WALL_HEIGHT, -HALF, WALL),
    box(-HALF - WALL_THICKNESS, 0, HALF, HALF + WALL_THICKNESS, WALL_HEIGHT, HALF + WALL_THICKNESS, WALL),
    box(-HALF - WALL_THICKNESS, 0, -HALF, -HALF, WALL_HEIGHT, HALF, WALL),
    box(HALF, 0, -HALF, HALF + WALL_THICKNESS, WALL_HEIGHT, HALF, WALL),
    // Clip walls above them
    clip(-HALF - WALL_THICKNESS, WALL_HEIGHT, -HALF - WALL_THICKNESS, HALF + WALL_THICKNESS, CLIP_HEIGHT, -HALF),
    clip(-HALF - WALL_THICKNESS, WALL_HEIGHT, HALF, HALF + WALL_THICKNESS, CLIP_HEIGHT, HALF + WALL_THICKNESS),
    clip(-HALF - WALL_THICKNESS, WALL_HEIGHT, -HALF, -HALF, CLIP_HEIGHT, HALF),
    clip(HALF, WALL_HEIGHT, -HALF, HALF + WALL_THICKNESS, CLIP_HEIGHT, HALF),
    // Crates
    box(-6, 0, -6, -4, 1, -4, CRATE),
    box(4, 0, 4, 6, 1, 6, CRATE),
    box(-12, 0, 8, -10, 2, 10, CRATE),
    box(10, 0, -10, 12, 1, -8, CRATE),
    // Stepped platform in the middle: crate (1 high) up to platform (2 high)
    box(-2, 0, 3, 2, 1, 5, CRATE),
    box(-3, 0, -3, 3, 2, 3, PLATFORM),
    // A long low wall to hide behind
    box(-15, 0, -1, -9, 1.5, 0, WALL),
  ],
  spawns: [
    spawnFacingCentre(-SPAWN_INSET, -SPAWN_INSET),
    spawnFacingCentre(SPAWN_INSET, SPAWN_INSET),
    spawnFacingCentre(SPAWN_INSET, -SPAWN_INSET),
    spawnFacingCentre(-SPAWN_INSET, SPAWN_INSET),
    spawnFacingCentre(0, -SPAWN_INSET),
    spawnFacingCentre(0, SPAWN_INSET),
    spawnFacingCentre(-SPAWN_INSET, 0),
    spawnFacingCentre(SPAWN_INSET, 0),
  ],
};
