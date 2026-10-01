import type { Vec3 } from "../types";

/** Players are referred to by session id in weapon and mode hooks. */
export type PlayerId = string;

/**
 * The narrow, safe API weapon hooks get (DESIGN.md §7). The server implements
 * it; hooks never touch Colyseus or sockets directly. Scaling and projectile
 * spawning join this API when the weapons that need them arrive (M3+).
 */
export interface WeaponApi {
  damage(target: PlayerId, amount: number): void;
  applyImpulse(player: PlayerId, impulse: Vec3): void;
  teleport(player: PlayerId, pos: Vec3): void;
  swapPositions(a: PlayerId, b: PlayerId): void;
  broadcastEffect(name: string, data: Record<string, unknown>): void;
}

export interface FireContext extends WeaponApi {
  shooter: PlayerId;
  weaponId: string;
  origin: Vec3;
  dir: Vec3;
}

export interface HitContext extends WeaponApi {
  shooter: PlayerId;
  target: PlayerId;
  weaponId: string;
  point: Vec3;
  dir: Vec3;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: "hitscan" | "projectile" | "melee";
  fireIntervalMs: number;
  damage: number;
  /** undefined = infinite. */
  magazine?: number;
  reloadMs?: number;
  /** Default 1; >1 for shotguns. */
  pellets?: number;
  spreadRad?: number;
  /** Hitscan/melee range, units. */
  range?: number;
  projectile?: {
    speed: number;
    gravity?: number;
    radius: number;
    lifetimeMs: number;
    splashRadius?: number;
    splashDamage?: number;
  };
  /** Impulse along the shot direction applied to whoever is hit, units/s. */
  knockback?: number;
  /**
   * Server-only hooks for silly behaviour. `damage` and `knockback` are applied
   * first; onHit adds anything extra.
   */
  onHit?: (ctx: HitContext) => void;
  onFire?: (ctx: FireContext) => void;
  /**
   * Number key that selects this weapon, whatever slot it's in, so keys don't
   * move around as you pick weapons up. Loadouts are kept sorted by it.
   */
  slotKey?: number;
  /** Client cosmetics. */
  view: { model: string; color?: string; sound?: string };
}
