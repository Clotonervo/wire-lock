# Wire Lock

Browser arena FPS: Three.js client, authoritative Colyseus server, shared deterministic simulation.

**Read [DESIGN.md](DESIGN.md) first.** It is the source of truth for architecture, conventions and milestones (§10). Work milestone by milestone; if the design turns out to be wrong in practice, propose an edit to DESIGN.md rather than silently diverging.

## Commands

Requires Node 24+ and pnpm (`npm i -g pnpm`).

- `pnpm install` — install all workspace deps
- `pnpm dev` — server (`ws://localhost:2567`, tsx watch) + client (`http://localhost:5173`, Vite) together
- `pnpm build` — typecheck and build all packages (`server/dist`, `client/dist`)
- `pnpm test` — Vitest (shared simulation tests live in `shared/test/`)
- `pnpm lint` — ESLint + `tsc` typecheck in every package

## Layout

- `shared/` — pure, deterministic code used by both sides. No DOM, Three.js, Colyseus, Node APIs or `Math.random()` (enforced by ESLint). Consumed as TypeScript source (no build step); the server bundle inlines it via tsup.
- `server/` — Colyseus 0.18 server (`@colyseus/core` + `@colyseus/ws-transport`). Rooms in `src/rooms/`.
- `client/` — Vite + Three.js. Uses `@colyseus/sdk` (the 0.18 client; `colyseus.js` is the old package). `VITE_SERVER_URL` overrides the server URL.

## Version notes

- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet.
- Colyseus 0.18 state uses `schema({...}, "Name")` + `t.*` builders, not decorators.
- Colyseus 0.18 has built-in simulated latency (`COLYSEUS_LATENCY` env / `applySimulatedLatency`), handy for the M1 latency test.
- pnpm build scripts are allow-listed in `pnpm-workspace.yaml` (`allowBuilds`).
