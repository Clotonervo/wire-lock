import { testArena } from "@wire-lock/shared";
import type { ModePlayer, ModeRoom, RoundPhase } from "../src/sim/modes/types";

export interface FakePlayer extends ModePlayer {
  weapons: string[];
  ammo: number[];
}

export function fakePlayer(id: string, over: Partial<FakePlayer> = {}): FakePlayer {
  return { id, kills: 0, deaths: 0, alive: true, lives: -1, eliminated: false, pos: { x: 0, y: 0, z: 0 }, weapons: [], ammo: [], ...over };
}

/** A ModeRoom over plain objects; the API mutates them the way the real room does. */
export function fakeRoom(players: FakePlayer[], opts: { phase?: RoundPhase; timeUp?: boolean } = {}): ModeRoom {
  const get = (id: string) => players.find((p) => p.id === id);
  return {
    map: testArena,
    phase: opts.phase ?? "playing",
    players,
    timeUp: opts.timeUp ?? false,
    api: {
      setLoadout: (id, weapons) => {
        const p = get(id);
        if (p?.alive) p.weapons = [...weapons];
      },
      addAmmo: (id, weaponId, n) => {
        const p = get(id);
        const slot = p?.weapons.indexOf(weaponId) ?? -1;
        if (p && slot >= 0) p.ammo[slot] = Math.max(0, p.ammo[slot] ?? 0) + n;
      },
      setKills: (id, kills) => {
        const p = get(id);
        if (p) p.kills = Math.max(0, kills);
      },
      setLives: (id, lives) => {
        const p = get(id);
        if (p) p.lives = lives;
      },
      eliminate: (id) => {
        const p = get(id);
        if (p) {
          p.eliminated = true;
          p.alive = false;
        }
      },
    },
  };
}
