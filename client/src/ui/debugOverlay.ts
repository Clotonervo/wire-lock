export interface DebugStats {
  fps: number;
  pingMs: number | null;
  pending: number;
  serverTick: number;
  /** Most recent reconciliation error, units. */
  correction: number;
  /** Largest reconciliation error in the last second, units. */
  maxCorrection: number;
  players: number;
}

/** F3 debug overlay (DESIGN.md §9.3). Plain DOM, text only. */
export class DebugOverlay {
  private readonly el: HTMLPreElement;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("pre");
    this.el.className = "debug-overlay";
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  update(s: DebugStats): void {
    if (!this.visible) return;
    this.el.textContent = [
      `fps         ${s.fps}`,
      `ping        ${s.pingMs === null ? "…" : `${Math.round(s.pingMs)} ms`}`,
      `pending     ${s.pending}`,
      `server tick ${s.serverTick}`,
      `correction  ${s.correction.toFixed(4)} (max 1s ${s.maxCorrection.toFixed(4)})`,
      `players     ${s.players}`,
    ].join("\n");
  }
}
