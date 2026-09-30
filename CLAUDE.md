# Wire Lock

Browser arena FPS: Three.js client, authoritative Colyseus server, shared deterministic simulation.

**Read [DESIGN.md](DESIGN.md) first.** It is the source of truth for architecture, conventions and milestones (§10). Work milestone by milestone; if the design turns out to be wrong in practice, propose an edit to DESIGN.md rather than silently diverging.

## Commands

Requires Node 24+ and pnpm (`npm i -g pnpm`).

- `pnpm install` — install all workspace deps
- `pnpm dev` — server (`ws://localhost:2567`, tsx watch) + client (`http://localhost:5173`, Vite) together
- `pnpm dev:lag` — same, with 150 ms simulated round-trip latency (server `--latency=<ms>` flag)
- Server dev flags (after `tsx src/index.ts`): `--latency=<ms>`, `--kill-limit=<n>` for short test rounds, `--no-lag-comp` to compare hit registration without lag compensation. `PORT` env var changes the port.
- Client: the lobby asks for a name (remembered in localStorage). `?room=CODE` opens straight to joining that room.
- Controls: WASD, Space, mouse, LMB fire, 1–3 / wheel switch weapons, R reload, Tab scores, M mute, F3 debug.
- `pnpm build` — typecheck and build all packages (`server/dist`, `client/dist`)
- `pnpm test` — Vitest (shared simulation tests live in `shared/test/`)
- `pnpm lint` — ESLint + `tsc` typecheck in every package
- Deploying: see [DEPLOY.md](DEPLOY.md) (Render for the server, Vercel for the client). Server env: `PORT`, `ALLOWED_ORIGINS`. Client build env: `VITE_SERVER_URL`.

## Layout

- `shared/` — pure, deterministic code used by both sides. No DOM, Three.js, Colyseus, Node APIs or `Math.random()` (enforced by ESLint). Consumed as TypeScript source (no build step); the server bundle inlines it via tsup.
- `server/` — Colyseus 0.18 server (`@colyseus/core` + `@colyseus/ws-transport`). Rooms in `src/rooms/`.
- `client/` — Vite + Three.js. Uses `@colyseus/sdk` (the 0.18 client; `colyseus.js` is the old package). `VITE_SERVER_URL` overrides the server URL.

## Version notes

- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet.
- Colyseus 0.18 state uses `schema({...}, "Name")` + `t.*` builders, not decorators.
- Colyseus 0.18 has built-in simulated latency (`COLYSEUS_LATENCY` env / `applySimulatedLatency`), handy for the M1 latency test.
- pnpm build scripts are allow-listed in `pnpm-workspace.yaml` (`allowBuilds`).
- Schema `t.number()` is lossy for floats (float32 if error < 1e-4). Use `t.float64()` for anything the client re-simulates from.
- Use `setFixedTimestep`, not `setSimulationInterval`, for the sim loop (the latter drifts below 30 Hz).

## Testing netcode

- F3 in the client shows fps, ping, pending inputs, server tick and prediction correction. Correction should stay ~0; anything larger means client and server simulations diverged.
- In dev builds the `Game` instance is `window.game`, which is handy for scripted checks: set `game.input.locked = true` and dispatch `KeyboardEvent`s to move without pointer lock.
- Background tabs don't run `requestAnimationFrame`, so they don't simulate or send input.
- `shared/src/playerStep.ts` (`stepInput`) is the per-input order both sides share. Anything the owner must predict has to go through it, and its inputs must be synced at full precision. A quick way to catch divergence: a headless client that runs `stepInput` locally and compares against the server state at each `lastProcessedSeq`; it should match exactly.
