/**
 * Process-level configuration, read once at start-up. Dev flags come from argv
 * and deployment settings from the environment; neither can be set by clients.
 *
 *   --latency=<ms>     simulated round-trip latency (COLYSEUS_LATENCY also works)
 *   --kill-limit=<n>   override the mode's score limit, for quick test rounds
 *   --no-lag-comp      turn off hitscan lag compensation (to compare against)
 *   --rewires=a,b      give everyone these Rewires at the start of each round (testing; counts toward the cap)
 *   PORT               port to listen on (Render sets this)
 *   ALLOWED_ORIGINS    comma-separated web origins allowed to connect, e.g.
 *                      "https://game.samhopkins.dev". Unset = allow any (development).
 */
function numberFlag(name: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const v = Number(arg.slice(name.length + 3));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

function listEnv(name: string): string[] | undefined {
  const list = process.env[name]
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list && list.length > 0 ? list : undefined;
}

export const config = {
  latencyMs: numberFlag("latency"),
  killLimit: numberFlag("kill-limit"),
  lagCompensation: !process.argv.includes("--no-lag-comp"),
  testRewires: process.argv.find((a) => a.startsWith("--rewires="))?.slice("--rewires=".length).split(",").filter(Boolean) ?? [],
  port: Number(process.env.PORT) || undefined,
  allowedOrigins: listEnv("ALLOWED_ORIGINS"),
};
