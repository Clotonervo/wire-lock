/**
 * Process-level dev flags, parsed once from argv. Read here rather than from
 * room create options so clients can't set them.
 *
 *   --latency=<ms>     simulated round-trip latency (COLYSEUS_LATENCY also works)
 *   --kill-limit=<n>   override the mode's score limit, for quick test rounds
 */
function numberFlag(name: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const v = Number(arg.slice(name.length + 3));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export const config = {
  latencyMs: numberFlag("latency"),
  killLimit: numberFlag("kill-limit"),
};
