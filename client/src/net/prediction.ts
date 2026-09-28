import { stepInput } from "@wire-lock/shared";
import type { InputCmd, InputStepResult, MapDef, PlayerMoveState, PlayerSim, Projectile, Vec3 } from "@wire-lock/shared";

/**
 * Client-side prediction and reconciliation for the local player (DESIGN.md §5.3).
 * Covers everything one input changes: movement, weapons (ammo, cooldowns,
 * reloads) and the player's own projectiles, so shots, reloads and rocket
 * jumps all respond instantly. Each server update rewinds to the authoritative
 * state and replays whatever the server hasn't processed yet.
 */
export class Predictor {
  sim: PlayerSim;
  /** Our own live projectiles, as predicted. */
  projectiles: Projectile[];
  pending: InputCmd[] = [];

  constructor(initial: PlayerSim, projectiles: Projectile[], private readonly map: MapDef) {
    this.sim = initial;
    this.projectiles = projectiles;
  }

  get state(): PlayerMoveState {
    return this.sim.move;
  }

  get alive(): boolean {
    return this.sim.alive;
  }

  /** Predicts one input. The result carries what happened (shots, explosions) for effects and sound. */
  apply(cmd: InputCmd, canFire: boolean): InputStepResult {
    const r = stepInput(this.sim, this.projectiles, cmd, this.map, { canFire, targets: [] });
    this.sim = r.sim;
    this.projectiles = r.projectiles;
    this.pending.push(cmd);
    return r;
  }

  /**
   * Rebases on the server's state and replays unacknowledged inputs (without
   * effects). Returns the position error (old predicted position minus new).
   */
  reconcile(server: PlayerSim, serverProjectiles: Projectile[], lastProcessedSeq: number, canFire: boolean): Vec3 {
    this.pending = this.pending.filter((c) => c.seq > lastProcessedSeq);

    let sim = server;
    let projectiles = serverProjectiles;
    for (const cmd of this.pending) {
      const r = stepInput(sim, projectiles, cmd, this.map, { canFire, targets: [] });
      sim = r.sim;
      projectiles = r.projectiles;
    }

    const old = this.sim.move.pos;
    this.sim = sim;
    this.projectiles = projectiles;
    const now = sim.move.pos;
    return { x: old.x - now.x, y: old.y - now.y, z: old.z - now.z };
  }
}
