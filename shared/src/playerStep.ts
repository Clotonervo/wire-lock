import { stepArms, type ArmsState } from "./arms";
import { CLUSTER_COUNT, CLUSTER_RADIUS, SPLIT_ROCKET_ANGLE } from "./constants";
import { DEFAULT_MODS, type PlayerMods } from "./rewires";
import { stepPlayer } from "./movement";
import { blastEffect, stepProjectile, type Projectile, type ProjectileTarget } from "./projectile";
import { aimDirection, eyePosition } from "./raycast";
import type { InputCmd, MapDef, PlayerMoveState, Vec3 } from "./types";
import { clusterBomblet, getWeapon, type WeaponDef } from "./weapons";

/** Everything about a player that one input changes and the owning client predicts. */
export interface PlayerSim {
  move: PlayerMoveState;
  arms: ArmsState;
  alive: boolean;
  /** Folded from the player's Rewires (both sides derive it from the synced list). */
  mods?: PlayerMods;
}

export interface Explosion {
  shotSeq: number;
  sub: number;
  weapon: WeaponDef;
  point: Vec3;
  /** Player hit directly, if any. */
  direct: string | null;
}

export interface InputStepResult {
  sim: PlayerSim;
  /** The owner's live projectiles after this input. */
  projectiles: Projectile[];
  fired: WeaponDef | null;
  /** Eye position and aim the shot was fired from (valid when `fired`). */
  origin: Vec3;
  aim: Vec3;
  spawned: Projectile[];
  explosions: Explosion[];
  reloadStarted: boolean;
  reloadFinished: boolean;
  switched: boolean;
}

export interface InputStepOptions {
  /** False between rounds. */
  canFire: boolean;
  /** Players the owner's projectiles can hit directly (never the owner). The client passes none. */
  targets: readonly ProjectileTarget[];
}

/**
 * Applies one input to one player, in the order both sides must share:
 * move → weapons → spawn projectile → advance the player's projectiles →
 * knock the player back from their own blasts.
 *
 * Projectiles advance on their owner's input timeline, so the owner's client
 * predicts its own explosions (and rocket jumps) on exactly the same input as
 * the server. Damage, and blasts hitting other players, are the server's job.
 */
export function stepInput(
  sim: PlayerSim,
  projectiles: readonly Projectile[],
  cmd: InputCmd,
  map: MapDef,
  opts: InputStepOptions,
): InputStepResult {
  const mods = sim.mods ?? DEFAULT_MODS;
  let move = sim.move;
  let arms = sim.arms;
  let fired: WeaponDef | null = null;
  let reloadStarted = false;
  let reloadFinished = false;
  let switched = false;

  if (sim.alive) {
    move = stepPlayer(move, cmd, map, cmd.dt, mods);
    const a = stepArms(arms, cmd, opts.canFire, mods);
    ({ arms, fired, reloadStarted, reloadFinished, switched } = a);
  }

  const origin = eyePosition(move.pos);
  const aim = aimDirection(cmd.yaw, cmd.pitch);
  const live: Projectile[] = [...projectiles];
  const spawned: Projectile[] = [];
  if (fired?.kind === "projectile" && fired.projectile) {
    const s = fired.projectile.speed;
    // Split Shot fans extra rockets out sideways, at fixed angles so prediction matches exactly.
    const count = 1 + mods.extraPellets;
    for (let sub = 0; sub < count; sub++) {
      const d = aimDirection(cmd.yaw + (sub - (count - 1) / 2) * SPLIT_ROCKET_ANGLE, cmd.pitch);
      const p: Projectile = { shotSeq: cmd.seq, sub, weapon: fired.id, pos: origin, vel: { x: d.x * s, y: d.y * s, z: d.z * s }, ageMs: 0 };
      spawned.push(p);
      live.push(p);
    }
  }

  const next: Projectile[] = [];
  const explosions: Explosion[] = [];
  for (const p of live) {
    const weapon = getWeapon(p.weapon);
    if (!weapon) continue;
    const step = stepProjectile(p, weapon, map.boxes, opts.targets, cmd.dt);
    if (!step.explodedAt) {
      next.push(step.projectile);
      continue;
    }
    const sub = p.sub ?? 0;
    explosions.push({ shotSeq: p.shotSeq, sub, weapon, point: step.explodedAt, direct: step.direct });
    // Cluster Bomb: bomblets at fixed points around the impact, so the owner predicts them exactly.
    if (mods.clusterBombs > 0) {
      for (let k = 0; k < CLUSTER_COUNT; k++) {
        const a = (k / CLUSTER_COUNT) * Math.PI * 2;
        const point = { x: step.explodedAt.x + Math.cos(a) * CLUSTER_RADIUS, y: step.explodedAt.y, z: step.explodedAt.z + Math.sin(a) * CLUSTER_RADIUS };
        explosions.push({ shotSeq: p.shotSeq, sub: 100 + sub * CLUSTER_COUNT + k, weapon: clusterBomblet, point, direct: null });
      }
    }
  }

  if (sim.alive) {
    for (const e of explosions) {
      const blast = blastEffect(e.point, move.pos, e.weapon, map.boxes, mods.splashRadiusMul);
      if (blast) {
        const k = mods.selfKnockbackMul;
        move = applyImpulse(move, { x: blast.impulse.x * k, y: blast.impulse.y * k, z: blast.impulse.z * k });
      }
    }
  }

  return {
    sim: { move, arms, alive: sim.alive, mods },
    projectiles: next,
    fired,
    origin,
    aim,
    spawned,
    explosions,
    reloadStarted,
    reloadFinished,
    switched,
  };
}

export function applyImpulse(m: PlayerMoveState, v: Vec3): PlayerMoveState {
  return {
    ...m,
    vel: { x: m.vel.x + v.x, y: m.vel.y + v.y, z: m.vel.z + v.z },
    onGround: v.y > 0 ? false : m.onGround,
  };
}
