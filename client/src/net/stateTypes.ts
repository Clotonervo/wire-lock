import { foldMods } from "@wire-lock/shared";
import type { PlayerMoveState, PlayerSim, Projectile } from "@wire-lock/shared";

/** A synced array (Colyseus ArraySchema), as decoded on the client. */
export interface SyncedArray<T> {
  toArray(): T[];
  readonly length: number;
}

/**
 * Read-only view of the server's synced state (server/src/schema/ArenaState.ts).
 * The client decodes state by reflection, so these interfaces mirror the schema
 * by hand; keep them in sync.
 */
export interface PlayerView {
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  airJumpsUsed: number;
  jumpHeld: boolean;
  dashCooldownMs: number;
  altHeld: boolean;
  boostMs: number;
  yaw: number;
  pitch: number;
  lastProcessedSeq: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  away: boolean;
  /** Server tick at which a dead player respawns; 0 when not waiting to respawn. */
  respawnTick: number;
  weapon: string;
  weapons: SyncedArray<string>;
  ammo: SyncedArray<number>;
  slot: number;
  cooldownMs: number;
  reloadMs: number;
  kills: number;
  deaths: number;
  /** Lives left this round; -1 when the mode doesn't use lives. */
  lives: number;
  /** Out of the round (spectating) until the next one. */
  eliminated: boolean;
  /** Owned Rewire ids in pick order; repeats are stacks. */
  rewires: SyncedArray<string>;
  /** The current 1-of-3 offer, if a pick is owed. */
  offer: SyncedArray<string>;
  pendingPicks: number;
  /** On fire (Afterburn). */
  burning: boolean;
}

export interface ProjectileView {
  owner: string;
  weapon: string;
  shotSeq: number;
  sub: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ageMs: number;
}

export type RoundPhase = "waiting" | "playing" | "ended";

interface SyncedMap<V> {
  get(key: string): V | undefined;
  forEach(cb: (value: V, key: string) => void): void;
  readonly size: number;
}

export interface ArenaStateView {
  mapId: string;
  modeId: string;
  /** Kills that win the round; 0 = none. */
  scoreLimit: number;
  tick: number;
  phase: RoundPhase;
  /** Tick at which the current phase ends; 0 = no timer. */
  phaseEndTick: number;
  /** Session id of the last round's winner, or empty for a draw. */
  winner: string;
  players: SyncedMap<PlayerView>;
  projectiles: SyncedMap<ProjectileView>;
}

export function readMove(p: PlayerView): PlayerMoveState {
  return {
    pos: { x: p.x, y: p.y, z: p.z },
    vel: { x: p.vx, y: p.vy, z: p.vz },
    onGround: p.onGround,
    airJumpsUsed: p.airJumpsUsed,
    jumpHeld: p.jumpHeld,
    dashCooldownMs: p.dashCooldownMs,
    altHeld: p.altHeld,
    boostMs: p.boostMs,
  };
}

export function readSim(p: PlayerView): PlayerSim {
  return {
    move: readMove(p),
    arms: { slots: p.weapons.toArray(), current: p.slot, ammo: p.ammo.toArray(), cooldownMs: p.cooldownMs, reloadMs: p.reloadMs },
    alive: p.alive && !p.away,
    mods: foldMods(p.rewires.toArray()),
  };
}

export function readProjectile(p: ProjectileView): Projectile {
  return { shotSeq: p.shotSeq, sub: p.sub, weapon: p.weapon, pos: { x: p.x, y: p.y, z: p.z }, vel: { x: p.vx, y: p.vy, z: p.vz }, ageMs: p.ageMs };
}

/** A player's live projectiles, in the order the server steps them. */
export function projectilesOf(state: ArenaStateView, owner: string): Projectile[] {
  const out: Projectile[] = [];
  state.projectiles.forEach((p) => {
    if (p.owner === owner) out.push(readProjectile(p));
  });
  return out.sort((a, b) => a.shotSeq - b.shotSeq || (a.sub ?? 0) - (b.sub ?? 0));
}
