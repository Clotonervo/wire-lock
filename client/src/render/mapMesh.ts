import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MapDef } from "@wire-lock/shared";

const DEFAULT_COLOR = "#888888";
const GRID_COLOR = 0x000000;
const GRID_OPACITY = 0.12;
/** Lifts the grid just above the floor to avoid z-fighting. */
const GRID_LIFT = 0.005;
const PAD_COLOR = 0x3fd8ff;
const PAD_RING_COLOR = 0xbff3ff;

/** Builds the map once from its boxes, merging geometry per colour (DESIGN.md §9.1). */
export function buildMapMesh(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  const byColor = new Map<string, THREE.BufferGeometry[]>();

  for (const b of map.boxes) {
    if (b.invisible) continue;
    const size = new THREE.Vector3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    geo.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    const color = b.color ?? DEFAULT_COLOR;
    const list = byColor.get(color) ?? [];
    list.push(geo);
    byColor.set(color, list);
  }

  for (const [color, geos] of byColor) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (merged) group.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color })));
  }

  // Jump pads: glowing slabs with a brighter rim so they read as "step here".
  for (const pad of map.jumpPads ?? []) {
    const size = new THREE.Vector3(pad.max.x - pad.min.x, pad.max.y - pad.min.y, pad.max.z - pad.min.z);
    const centre = new THREE.Vector3((pad.min.x + pad.max.x) / 2, (pad.min.y + pad.max.y) / 2, (pad.min.z + pad.max.z) / 2);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ color: PAD_COLOR }));
    slab.position.copy(centre);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 1.15, size.y * 0.5, size.z * 1.15),
      new THREE.MeshBasicMaterial({ color: PAD_RING_COLOR, transparent: true, opacity: 0.35 }),
    );
    rim.position.copy(centre);
    group.add(slab, rim);
  }

  // A faint grid on the floor so movement is easy to read.
  const floor = map.boxes[0];
  if (floor) {
    const size = Math.max(floor.max.x - floor.min.x, floor.max.z - floor.min.z);
    const grid = new THREE.GridHelper(size, size, GRID_COLOR, GRID_COLOR);
    const mat = grid.material as THREE.Material;
    mat.transparent = true;
    mat.opacity = GRID_OPACITY;
    grid.position.set((floor.min.x + floor.max.x) / 2, floor.max.y + GRID_LIFT, (floor.min.z + floor.max.z) / 2);
    group.add(grid);
  }

  return group;
}
