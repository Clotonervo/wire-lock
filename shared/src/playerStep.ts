import { stepArms, type ArmsState } from "./arms";
import { stepPlayer } from "./movement";
import { blastEffect, stepProjectile, type Projectile, type ProjectileTarget } from "./projectile";
import { aimDirection, eyePosition } from "./raycast";
import type { InputCmd, MapDef, PlayerMoveState, Vec3 } from "./types";
import { getWeapon, type WeaponDef } from "./weapons";

/** Everything about a player that one input changes and the owning client predicts. */
export interface PlayerSim {
  move: PlayerMoveState;
  arms: ArmsState;
  alive: boolean;
}

export interface Explosion {
  shotSeq: number;
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
  spawned: Projectile | null;
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
  let move = sim.move;
  let arms = sim.arms;
  let fired: WeaponDef | null = null;
  let reloadStarted = false;
  let reloadFinished = false;
  let switched = false;

  if (sim.alive) {
    move = stepPlayer(move, cmd, map, cmd.dt);
    const a = stepArms(arms, cmd, opts.canFire);
    ({ arms, fired, reloadStarted, reloadFinished, switched } = a);
  }

  const origin = eyePosition(move.pos);
  const aim = aimDirection(cmd.yaw, cmd.pitch);
  const live: Projectile[] = [...projectiles];
  let spawned: Projectile | null = null;
  if (fired?.kind === "projectile" && fired.projectile) {
    const s = fired.projectile.speed;
    spawned = { shotSeq: cmd.seq, weapon: fired.id, pos: origin, vel: { x: aim.x * s, y: aim.y * s, z: aim.z * s }, ageMs: 0 };
    live.push(spawned);
  }

  const next: Projectile[] = [];
  const explosions: Explosion[] = [];
  for (const p of live) {
    const weapon = getWeapon(p.weapon);
    if (!weapon) continue;
    const step = stepProjectile(p, weapon, map.boxes, opts.targets, cmd.dt);
    if (step.explodedAt) explosions.push({ shotSeq: p.shotSeq, weapon, point: step.explodedAt, direct: step.direct });
    else next.push(step.projectile);
  }

  if (sim.alive) {
    for (const e of explosions) {
      const blast = blastEffect(e.point, move.pos, e.weapon, map.boxes);
      if (blast) move = applyImpulse(move, blast.impulse);
    }
  }

  return {
    sim: { move, arms, alive: sim.alive },
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
    pos: m.pos,
    vel: { x: m.vel.x + v.x, y: m.vel.y + v.y, z: m.vel.z + v.z },
    onGround: v.y > 0 ? false : m.onGround,
  };
}
