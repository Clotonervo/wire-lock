import { MAX_REWIND_MS, TICK_MS, lerp } from "@wire-lock/shared";
import type { Vec3 } from "@wire-lock/shared";

interface Sample {
  tick: number;
  pos: Vec3;
  alive: boolean;
}

/** Ticks of history kept: the rewind window plus a little slack for interpolation. */
const HISTORY_TICKS = Math.ceil(MAX_REWIND_MS / TICK_MS) + 2;

/**
 * Where each player was at the end of recent ticks, so hitscan shots can be
 * checked against the world as the shooter saw it (DESIGN.md §5.5). Clients draw
 * remote players on the same tick timeline (tick × TICK_MS), so a client's
 * view time maps straight onto these samples.
 */
export class PositionHistory {
  private readonly samples = new Map<string, Sample[]>();

  record(tick: number, id: string, pos: Vec3, alive: boolean): void {
    let list = this.samples.get(id);
    if (!list) {
      list = [];
      this.samples.set(id, list);
    }
    list.push({ tick, pos: { ...pos }, alive });
    if (list.length > HISTORY_TICKS) list.shift();
  }

  remove(id: string): void {
    this.samples.delete(id);
  }

  /**
   * The player's position at server time `timeMs`, interpolated between ticks.
   * Null if we have no record, or they weren't alive then (you can't shoot
   * someone who, in your view, hadn't respawned yet).
   */
  at(id: string, timeMs: number): Vec3 | null {
    const list = this.samples.get(id);
    const first = list?.[0];
    const last = list?.[list.length - 1];
    if (!list || !first || !last) return null;

    const t = timeMs / TICK_MS;
    if (t <= first.tick) return first.alive ? { ...first.pos } : null;
    if (t >= last.tick) return last.alive ? { ...last.pos } : null;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      if (t < a.tick || t > b.tick) continue;
      if (!a.alive || !b.alive) return null;
      const f = (t - a.tick) / (b.tick - a.tick);
      return { x: lerp(a.pos.x, b.pos.x, f), y: lerp(a.pos.y, b.pos.y, f), z: lerp(a.pos.z, b.pos.z, f) };
    }
    return null;
  }
}

/** Clamps a client's claimed view time to the rewind window ending at `nowMs`. */
export function rewindTime(viewTime: number | undefined, nowMs: number): number {
  if (viewTime === undefined) return nowMs;
  return Math.min(nowMs, Math.max(nowMs - MAX_REWIND_MS, viewTime));
}
