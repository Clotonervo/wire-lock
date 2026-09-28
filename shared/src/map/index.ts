import type { MapDef } from "../types";
import { testArena } from "./testArena";

export { testArena };

export const MAPS: Readonly<Record<string, MapDef>> = {
  [testArena.id]: testArena,
};

export const DEFAULT_MAP_ID = testArena.id;

export function getMap(id: string): MapDef | undefined {
  return MAPS[id];
}
