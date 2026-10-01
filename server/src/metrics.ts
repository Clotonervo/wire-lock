/**
 * Lightweight server metrics for /health: how long simulation ticks take (the
 * budget is TICK_MS) and how many players are connected. Free hosting has a
 * small CPU share, so this is how we see whether a full room keeps up.
 */
const WINDOW = 900; // ~30 s of ticks at 30 Hz (across all rooms)
const durations: number[] = [];
let players = 0;

export function recordTick(ms: number): void {
  durations.push(ms);
  if (durations.length > WINDOW) durations.shift();
}

export function playerJoined(): void {
  players++;
}

export function playerLeft(): void {
  players = Math.max(0, players - 1);
}

export function metrics() {
  const sorted = [...durations].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const avg = sorted.length ? sorted.reduce((n, d) => n + d, 0) / sorted.length : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { players, tickMs: { avg: round(avg), p95: round(pick(0.95)), max: round(sorted[sorted.length - 1] ?? 0), samples: sorted.length } };
}
