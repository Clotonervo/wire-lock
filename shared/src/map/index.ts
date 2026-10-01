import type { MapDef } from "../types";
import { parseMapDef } from "./parse";
import scaffoldJson from "./scaffold.json";
import { testArena } from "./testArena";

export { testArena };
export { parseMapDef };
export { findDropSpot, groundBelow, standsClear } from "./dropSpots";

/** Maps can be TypeScript (like the test arena) or JSON files, validated on load. */
export const scaffold: MapDef = parseMapDef(scaffoldJson);

export const MAPS: Readonly<Record<string, MapDef>> = {
  [scaffold.id]: scaffold,
  [testArena.id]: testArena,
};

export const DEFAULT_MAP_ID = scaffold.id;

export function getMap(id: string): MapDef | undefined {
  return MAPS[id];
}
