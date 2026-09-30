import type { ModeDef } from "@wire-lock/shared";
import { createDeathmatch } from "./deathmatch";
import { createGunGame } from "./gunGame";
import { createOneInTheChamber } from "./oneInTheChamber";
import type { GameMode } from "./types";

export type * from "./types";

const FACTORIES: Record<string, (overrides?: Partial<ModeDef>) => GameMode> = {
  deathmatch: createDeathmatch,
  gungame: createGunGame,
  oitc: createOneInTheChamber,
};

export function createMode(id: string, overrides?: Partial<ModeDef>): GameMode | undefined {
  return FACTORIES[id]?.(overrides);
}
