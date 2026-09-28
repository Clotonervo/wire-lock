/** How quickly the offset estimate follows new samples (0..1). Low values average out network jitter. */
const SMOOTHING = 0.1;
/** Samples this far from the estimate (e.g. after the tab was hidden) reset it instead of blending. */
const RESET_THRESHOLD_MS = 250;

/**
 * Estimates the server's clock from state patches, so remote snapshots can be
 * placed on the server's timeline (tick × TICK_MS) instead of their jittery
 * arrival times. The offset includes one-way latency, which is fine: we only
 * need a steady mapping to render "INTERP_DELAY_MS behind the newest data".
 */
export class ServerClock {
  private offset: number | null = null;

  /** Record that server time `serverMs` was observed at local time `localMs`. */
  sample(serverMs: number, localMs: number): void {
    const s = serverMs - localMs;
    if (this.offset === null || Math.abs(s - this.offset) > RESET_THRESHOLD_MS) this.offset = s;
    else this.offset += (s - this.offset) * SMOOTHING;
  }

  /** Estimated server time at local time `localMs`, or null before the first sample. */
  now(localMs: number): number | null {
    return this.offset === null ? null : localMs + this.offset;
  }
}
