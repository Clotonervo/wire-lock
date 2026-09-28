import type { ModeDef } from "@wire-lock/shared";
import { createDeathmatch } from "./deathmatch";
import type { GameMode } from "./types";

export type * from "./types";

const FACTORIES: Record<string, (overrides?: Partial<ModeDef>) => GameMode> = {
  deathmatch: createDeathmatch,
};

export function createMode(id: string, overrides?: Partial<ModeDef>): GameMode | undefined {
  return FACTORIES[id]?.(overrides);
}
