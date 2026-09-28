import { stepPlayer } from "@wire-lock/shared";
import type { InputCmd, MapDef, PlayerMoveState, Vec3 } from "@wire-lock/shared";

/**
 * Client-side prediction and reconciliation for the local player (DESIGN.md §5.3).
 * Inputs are applied locally as soon as they're sampled and kept until the
 * server confirms them; each server update rewinds to the authoritative state
 * and replays whatever the server hasn't processed yet.
 */
export class Predictor {
  state: PlayerMoveState;
  pending: InputCmd[] = [];
  /** Dead (or away) players don't move; the server still acknowledges their inputs. */
  alive = true;

  constructor(initial: PlayerMoveState, private readonly map: MapDef) {
    this.state = initial;
  }

  apply(cmd: InputCmd): void {
    if (this.alive) this.state = stepPlayer(this.state, cmd, this.map, cmd.dt);
    this.pending.push(cmd);
  }

  /**
   * Rebases on the server's state and replays unacknowledged inputs.
   * Returns the prediction error (old predicted position minus new).
   */
  reconcile(server: PlayerMoveState, lastProcessedSeq: number, alive = true): Vec3 {
    this.alive = alive;
    this.pending = this.pending.filter((c) => c.seq > lastProcessedSeq);

    let s = server;
    if (alive) for (const cmd of this.pending) s = stepPlayer(s, cmd, this.map, cmd.dt);

    const old = this.state.pos;
    this.state = s;
    return { x: old.x - s.pos.x, y: old.y - s.pos.y, z: old.z - s.pos.z };
  }
}
