import { MAX_EXTRAPOLATION_MS, lerp, lerpAngle } from "@wire-lock/shared";
import type { Vec3 } from "@wire-lock/shared";

export interface Snapshot {
  /** Server time, ms (tick × TICK_MS). */
  t: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
}

/** Enough history for the interpolation delay with plenty of slack. */
const MAX_SNAPSHOTS = 32;

/**
 * Timestamped snapshots of one remote player, sampled in the past so there are
 * usually two snapshots to interpolate between (DESIGN.md §5.4).
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];

  push(s: Snapshot): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) return;
    this.snaps.push(s);
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();
  }

  get size(): number {
    return this.snaps.length;
  }

  sample(renderTime: number): Snapshot | null {
    const snaps = this.snaps;
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    if (!first || !last) return null;
    if (renderTime <= first.t) return first;

    for (let i = 0; i < snaps.length - 1; i++) {
      const a = snaps[i]!;
      const b = snaps[i + 1]!;
      if (renderTime >= a.t && renderTime < b.t) {
        const f = (renderTime - a.t) / (b.t - a.t);
        return blend(a, b, f, renderTime);
      }
    }

    // Past the newest snapshot: extrapolate briefly along the last motion, then freeze.
    const prev = snaps[snaps.length - 2];
    if (!prev) return last;
    const over = Math.min(renderTime - last.t, MAX_EXTRAPOLATION_MS);
    const f = 1 + over / (last.t - prev.t);
    return { ...blend(prev, last, f, renderTime), yaw: last.yaw, pitch: last.pitch };
  }
}

function blend(a: Snapshot, b: Snapshot, f: number, t: number): Snapshot {
  return {
    t,
    pos: { x: lerp(a.pos.x, b.pos.x, f), y: lerp(a.pos.y, b.pos.y, f), z: lerp(a.pos.z, b.pos.z, f) },
    yaw: lerpAngle(a.yaw, b.yaw, f),
    pitch: lerp(a.pitch, b.pitch, f),
  };
}
