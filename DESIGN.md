# Browser Arena Shooter — Design Document

A small, silly, multiplayer first-person shooter that runs in the browser. Built with Three.js on the client and an authoritative Node server, without a game engine. The goal is a codebase that is **fun to tinker with**: new weapons and game modes should be cheap to add.

> **For Claude Code:** Treat this document as the source of truth for architecture and conventions. Work milestone by milestone (see §10) and don't start a milestone until the previous one's acceptance criteria pass. When a decision here turns out to be wrong in practice, flag it and propose an edit to this file rather than silently diverging.

---

## 1. Goals and non-goals

**Goals**
- Playable in a desktop browser with no install; join a room via a link.
- Real-time multiplayer for small rooms (2–8 players).
- Movement that feels responsive despite network latency.
- Weapons and game modes defined in a data-driven way so new ones are small, isolated additions.
- Simple, cheap hosting: static client on Vercel, game server on a small container host.

**Non-goals (for now)**
- Mobile/touch controls.
- Accounts, persistence, progression.
- Anti-cheat beyond the server being authoritative.
- High-fidelity art. Blocky maps and capsule players are the intended look.
- Large player counts or matchmaking across regions.

---

## 2. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript everywhere | Strict mode. Shared code between client and server. Pinned to 6.0.x until typescript-eslint supports TS 7. |
| Repo | pnpm workspaces monorepo | `client`, `server`, `shared` packages (`@wire-lock/*`). `shared` is consumed as TS source, with no build step. |
| Client build | Vite | Fast dev server + HMR. |
| Rendering | Three.js | No engine or framework on top. |
| Input | Pointer Lock API, keyboard/mouse events | |
| Networking | Colyseus 0.18 | Server: `@colyseus/core` + `@colyseus/ws-transport` (not the `colyseus` meta-package, which pulls a git-hosted uWebSockets.js that pnpm blocks). Client: `@colyseus/sdk` (`colyseus.js` is the pre-0.18 package). State uses `schema({...})` + `t.*` builders, not decorators. |
| Server runtime | Node.js 24+ | `tsx watch` in dev; tsup bundles `server` + `shared` into `server/dist` for prod. |
| Tests | Vitest | Mainly for `shared` simulation logic. |
| Lint | ESLint + typescript-eslint | Also enforces `shared/` purity (no Three.js/Colyseus/Node imports, no `Math.random`). |
| Client hosting | Vercel (separate project) | Subdomain e.g. `game.samhopkins.dev`, or proxied under `/game` from the main site. |
| Server hosting | Fly.io (or Railway) | Dockerfile in `server/`. Single region to start. |

Use the current stable versions of each dependency at scaffold time and pin them in the lockfile.

---

## 3. Repository layout

```
wire-lock/
├── package.json              # workspace root, shared scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── vitest.config.ts
├── DESIGN.md                 # this file
├── CLAUDE.md                 # short pointer to DESIGN.md + commands
├── shared/
│   ├── src/
│   │   ├── constants.ts      # tick rate, speeds, gravity, player size
│   │   ├── types.ts          # Input, PlayerState, etc.
│   │   ├── movement.ts       # deterministic player movement step
│   │   ├── collision.ts      # AABB vs map
│   │   ├── map/              # map definitions (data)
│   │   ├── weapons/          # weapon definitions (data + hooks)
│   │   └── modes/            # game mode definitions
│   └── test/
├── server/
│   ├── src/
│   │   ├── index.ts          # Colyseus server bootstrap
│   │   ├── log.ts            # brief structured logging
│   │   ├── rooms/ArenaRoom.ts
│   │   ├── schema/           # Colyseus Schema state classes (from M1)
│   │   └── sim/              # server-only simulation (hits, projectiles, mode logic)
│   ├── tsup.config.ts
│   └── Dockerfile            # M4
└── client/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.ts
        ├── net/              # connection, prediction, interpolation
        ├── render/           # Three.js scene, map meshes, player meshes, effects
        ├── input/            # pointer lock, key state, input sampling
        ├── ui/               # HUD, menus, scoreboard (plain DOM overlay)
        └── audio/
```

**Rule:** anything that must behave identically on client and server (movement, collision, weapon stats) lives in `shared/` and must be **deterministic and free of DOM, Three.js, or Colyseus imports**.

---

## 4. Architecture overview

```
 Browser (client)                                Game server (Fly.io)
┌──────────────────────────────┐   WebSocket    ┌─────────────────────────────┐
│ Input sampler ─► inputs ─────┼───────────────►│ ArenaRoom                   │
│                              │                │  • fixed-tick simulation    │
│ Prediction (shared/movement) │                │  • applies inputs           │
│ Reconciliation ◄─────────────┼────────────────┤  • hits, projectiles, mode  │
│ Interpolation of others      │  state patches │  • Colyseus state sync      │
│ Three.js renderer            │                └─────────────────────────────┘
└──────────────────────────────┘
```

- The **server is authoritative** for all game state: positions, health, kills, scores, pickups, round state.
- **Clients send inputs, never positions.**
- The client renders its own player from **local prediction** and everyone else from **interpolated server snapshots**.

---

## 5. Networking model

### 5.1 Tick rates
- Server simulation: **30 Hz** fixed timestep (`TICK_MS = 1000/30`).
- Server state patches: **20 Hz** (Colyseus `patchRate = 50`).
- Client sends one input message per client simulation tick (30 Hz), batching if the tab lags. In practice it sends one message per rendered frame containing every tick simulated that frame (`InputCmd[]`, at most `MAX_INPUT_BATCH`).
- The server ticks with Colyseus `setFixedTimestep` (accumulator-based). Plain `setInterval(33.3)` runs at ~29.4 Hz on Node, which makes client inputs pile up.
- Client renders at display refresh rate (`requestAnimationFrame`).

### 5.2 Input message
```ts
interface InputCmd {
  seq: number;          // monotonically increasing per client
  dt: number;           // tick duration used (fixed, but sent for sanity checks)
  move: { x: -1|0|1; z: -1|0|1 };  // strafe / forward
  jump: boolean;
  yaw: number;          // radians
  pitch: number;        // radians, clamped
  fire: boolean;
  altFire: boolean;
  weaponSlot?: number;  // switch request
}
```
The server validates each command (clamp values, reject absurd `dt`, drop out-of-order `seq`) and records `lastProcessedSeq` per player in synced state.

**Input pacing:** each player's valid commands go into a queue (capped at `MAX_INPUT_QUEUE`, oldest dropped). Each tick the server applies **one** command per player, or `MAX_INPUTS_PER_TICK` (2) once more than `INPUT_BACKLOG` are queued. This acts as a small jitter buffer: a client sending bursts (e.g. two inputs per frame at 15 fps) still moves smoothly for everyone else, and the catch-up cap limits speed hacks to 2×. A player only moves when one of their commands is applied. The client keeps sending idle commands while nothing is pressed, but a player whose tab is hidden (no `requestAnimationFrame`) freezes in place, even mid-air. This is intentional: having the server move idle players would make every active player's prediction more complex just for this edge case.

**Away players (M2):** a frozen player would otherwise be a free kill. After `AWAY_TIMEOUT_MS` (~8 s) with no applied input, the server marks the player `away`: removed from the world (not hittable, not rendered, not holding a spawn point, not counted by the mode's win or scoring logic). Their next input respawns them through the normal spawn path (`mode.pickSpawn`), with no respawn delay. A deliberate "lag switch" (withholding input and then bursting it) is bounded by `MAX_INPUT_QUEUE` and the 2× catch-up cap, and it gains no aim advantage because fire commands are resolved when they're processed. That's accepted per the non-goals.

### 5.3 Client-side prediction and reconciliation
1. Each client tick: sample input, assign `seq`, send it, apply it locally via `shared/movement.ts`, and push it onto a `pendingInputs` buffer.
2. When server state arrives for the local player: set the local state to the server's authoritative state, drop all pending inputs with `seq <= lastProcessedSeq`, then **re-apply** the remaining pending inputs.
3. Smooth small corrections visually (lerp the camera offset over ~100 ms). Snap on large errors (> 1 unit).

### 5.4 Interpolation of remote entities
- Keep a buffer of timestamped snapshots per remote player. Timestamps are **server time** (`state.tick × TICK_MS`), not arrival time. Patches are 50 ms apart but carry 1 or 2 ticks of movement, so arrival timestamps make remote speed wobble by ±33%. The client maps local time to server time with a smoothed offset (`client/src/net/serverClock.ts`).
- Render remote players at `now - INTERP_DELAY` (start at **100 ms**), lerping position and slerping yaw between the two surrounding snapshots.
- Extrapolate for at most 1 tick if the buffer runs dry, then freeze.

### 5.5 Shooting and hit registration
- **Hitscan weapons:** resolved on the server by raycasting from the player's eye position along their yaw/pitch at the tick the fire input is processed.
- **Fire rate** is measured in *applied inputs* (`fireIntervalMs / TICK_MS`), not client `seq` numbers, which a modified client could skip. The client runs the same rule on its own tick count, so its cosmetic shots line up with the server's real ones.
- **Projectile weapons:** simulated on the server; the client spawns a cosmetic projectile immediately on fire for feel, and the server's projectile replaces or corrects it.
- The client plays muzzle flash, sound and tracer immediately (cosmetic only); damage numbers and kills come from server events.
- **Later upgrade (not v1):** lag compensation, where the server rewinds other players' positions to what the shooter saw (`serverTime - shooterRTT/2 - INTERP_DELAY`) before raycasting. Colyseus 0.18 ships a `Rewind` helper worth evaluating before hand-rolling this.

### 5.6 Events vs state
- **Synced state (Colyseus Schema):** players (position, yaw, pitch, health, weapon, alive, score, lastProcessedSeq), projectiles, pickups, mode/round state.
- Position and velocity are `t.float64()`. `t.number()` silently sends floats as float32 when the error is < 1e-4, which breaks exact reconciliation (the client re-simulates from the server's state).
- **One-off messages:** `hit` (to the shooter only, for the hitmarker), `kill`, `fire` (to everyone but the shooter, one end point per pellet), `effect` (from weapon hooks), `roundStart`, `roundEnd`, and later `chat`. Payload types live in `shared/src/messages.ts`.
- The round's score limit is synced state (`scoreLimit`) rather than read from the shared mode definition, so server overrides such as `--kill-limit` show correctly in the HUD.

---

## 6. Simulation (shared)

### 6.1 Player
- Capsule approximated as an AABB for collision: width 0.6, height 1.8, eye height 1.6.
- Ground movement with acceleration and friction; a small amount of air control; gravity; single jump.
- All constants live in `shared/constants.ts` so they are easy to tweak.

### 6.2 Map
- v1 maps are **arrays of axis-aligned boxes** plus spawn points, defined as data in `shared/map/`:
```ts
interface MapDef {
  id: string;
  name: string;
  boxes: { min: Vec3; max: Vec3; color?: string }[];
  spawns: { pos: Vec3; yaw: number; team?: string }[];
  pickups?: { pos: Vec3; kind: string }[];
}
```
- Collision is swept AABB-vs-AABB, resolved axis by axis. The client builds meshes from the same data.
- Keep maps small (arena-sized) and blocky.

### 6.3 Determinism
- `movement.ts` must be a pure function: `(state, input, map) => newState`.
- Avoid `Math.random()` in shared code. Weapon spread uses a seeded RNG passed in by the caller (the server seeds it per shot; the client's cosmetic spread doesn't need to match).

---

## 7. Weapon system

Weapons are **data plus optional hooks**, registered in `shared/weapons/index.ts`. Adding a weapon means adding one file and one registry line.

```ts
interface WeaponDef {
  id: string;
  name: string;
  kind: 'hitscan' | 'projectile' | 'melee';
  fireIntervalMs: number;
  damage: number;
  magazine?: number;        // undefined = infinite
  reloadMs?: number;
  pellets?: number;         // default 1; >1 for shotguns
  spreadRad?: number;
  range?: number;           // hitscan/melee
  projectile?: {
    speed: number;
    gravity?: number;
    radius: number;
    lifetimeMs: number;
    splashRadius?: number;
    splashDamage?: number;
  };
  knockback?: number;
  // Server-only hooks for silly behaviour. Receive a narrow, safe API.
  onHit?: (ctx: HitContext) => void;
  onFire?: (ctx: FireContext) => void;
  view: { model: string; color?: string; sound?: string };  // client cosmetics
}
```

`HitContext` exposes a small API such as `damage(target, amount)`, `teleport(player, pos)`, `swapPositions(a, b)`, `applyImpulse(player, vec)`, `spawnProjectile(...)`, `setPlayerScale(player, s)` and `broadcastEffect(name, data)`. Hooks must never touch Colyseus or sockets directly.

**Starter weapons (v1):** Pistol (hitscan), Shotgun (8 pellets), Rocket Launcher (projectile + splash + knockback).
**Silly weapons backlog:** Swapper (swap places with the target), Banana Launcher (bouncing projectile), Shrink Ray (target scale 0.5 for 10 s), Yeet Gun (huge knockback, no damage), Boomerang (projectile that returns).

---

## 8. Game mode system

A mode is a set of rules the room delegates to. It lives in `shared/modes/` (definitions) with server logic in `server/src/sim/modes/`.

```ts
interface GameMode {
  id: string;
  name: string;
  minPlayers: number;
  roundTimeSec?: number;
  loadout(player): string[];                 // weapon ids on spawn
  onPlayerJoin?(room, player): void;
  onKill?(room, killer, victim, weaponId): void;
  onTick?(room, dt): void;
  pickSpawn(room, player): SpawnPoint;
  checkWin(room): { winner?: string } | null;
  respawnDelayMs: number;
}
```

**v1 mode:** Free-for-all Deathmatch (first to 20 kills or 5 minutes).
**Backlog:** Gun Game (each kill advances your weapon), One in the Chamber (pistol, 1 bullet, one-hit kills, +1 ammo per kill), Low Gravity, Everyone Tiny, King of the Hill.

The mode is chosen when a room is created (a query param or lobby option) and is exposed in synced state so the client can show mode-specific HUD.

---

## 9. Client

### 9.1 Rendering (Three.js)
- One `WebGLRenderer`, `PerspectiveCamera` (FOV 75) attached to the local player's eye.
- Map meshes built once from `MapDef` boxes; merge geometry per material for performance.
- Remote players are capsule meshes with a simple "gun" box; tint by player colour.
- Effects: muzzle flash sprite, tracer line (fades over ~80 ms), impact puff, simple explosion sphere.
- Basic lighting: one hemisphere light and one directional light. No shadows in v1.

### 9.2 Input
- Click canvas → request pointer lock. Esc releases it and shows the menu.
- WASD move, Space jump, mouse look, LMB fire, RMB alt-fire, 1–9 / scroll to switch weapons, R reload, Tab scoreboard.
- Mouse sensitivity setting persisted in `localStorage`, wrapped in try/catch.

### 9.3 UI (DOM overlay, no framework)
- Join screen: name input, room code (or "create room" with mode select).
- HUD: health, ammo, weapon name, crosshair, kill feed, round timer.
- Scoreboard on Tab. Simple end-of-round screen.
- Debug overlay (toggle with F3): FPS, ping, pending input count, server tick, correction magnitude.

### 9.4 Config
- `VITE_SERVER_URL` env var for the WebSocket endpoint (`wss://<server-host>` in prod). When unset, the client uses `ws://<page host>:2567`, so dev needs no config.
- If served under `/game`, set Vite `base: '/game/'`.

---

## 10. Milestones

Each milestone should end with the game in a runnable state and the acceptance criteria checked.

### M0 — Scaffold
- pnpm workspace with `client`, `server`, `shared`; strict TS; shared tsconfig.
- Root scripts: `pnpm dev` (client + server concurrently), `pnpm build`, `pnpm test`, `pnpm lint`.
- Colyseus server with an empty `ArenaRoom`; Vite client that connects and logs its session id.
- `CLAUDE.md` with the commands and a pointer to this doc.
- ✅ `pnpm dev` starts both; opening the client shows "connected: <id>" in the console. **Done.**

### M1 — Walk around together
- Test map from boxes; shared movement + collision with unit tests.
- Pointer lock, WASD, mouse look, jump.
- Inputs sent to server; server simulates at 30 Hz; client prediction + reconciliation; remote interpolation.
- F3 debug overlay.
- ✅ **Done.** Two browser tabs see each other move smoothly. With 150 ms simulated latency (`pnpm dev:lag`) (Colyseus's built-in `COLYSEUS_LATENCY=150` env var on the server, or Chrome devtools throttling), local movement still feels instant and remote players don't stutter.

### M2 — Shoot each other (Deathmatch)
- Weapon system with Pistol, health, damage, death, respawn with delay.
- Away handling: players with no input for `AWAY_TIMEOUT_MS` leave the world until they return (§5.2).
- Deathmatch mode: kills, scores, win condition, round reset.
- HUD, kill feed, scoreboard.
- ✅ **Done.** Two players can play a full deathmatch round to completion. A player who hides their tab disappears from the world after the timeout and respawns when they return.
- Known limitation: dropping below `minPlayers` (e.g. one of two players going away) returns the room to warm-up, and the round restarts with scores reset when they return.

### M3 — Weapon variety
- Shotgun and Rocket Launcher (projectiles, splash, knockback).
- Weapon switching; ammo and reload.
- Cosmetic effects and basic sounds.
- ✅ All three weapons work in multiplayer; rockets hit correctly and knock players around.

### M4 — Rooms, modes and deploy
- Join screen with room codes and mode select.
- Gun Game and One in the Chamber.
- Dockerfile; deploy the server to Fly.io; deploy the client to Vercel as its own project; configure `VITE_SERVER_URL` and CORS/origin checks.
- ✅ A friend can open a link and join a room on the live deployment.

### M5+ — Silly stuff (open-ended)
- Work through the silly weapons and modes backlog.
- Pickups (health, weapon spawns), jump pads.
- Lag compensation for hitscan.
- Simple map editor or JSON map loading.

---

## 11. Conventions

- Strict TypeScript; avoid `any`. Shared types live in `shared/src/types.ts`.
- Keep `shared/` pure: no side effects at import, no environment access.
- Every tweakable number goes in `shared/constants.ts` or the relevant weapon/mode definition. No magic numbers in systems code.
- Unit test shared simulation (movement, collision, weapon math) with Vitest.
- Server logs are structured and brief; no per-tick logging outside debug mode.
- Small, focused commits per feature.

---

## 12. Security and robustness basics

- The server clamps and validates every input (`seq` ordering, `dt` bounds, pitch range, fire rate enforced server-side from `fireIntervalMs`).
- Rate-limit messages per client; disconnect clients that flood.
- Limit room size (8) and the number of concurrent rooms.
- Restrict allowed WebSocket origins to the production client domain(s) in production.
- Player names: trim, length-limit (16), strip control characters, and render as text only (never `innerHTML`).

---

## 13. Open questions

- Subdomain (`game.samhopkins.dev`) or path (`samhopkins.dev/game` via rewrite) for the client?
- Server region: pick the one closest to where most players will be.
- Should rooms be public (listed) or private (code-only) in v1? Default: code-only.
- Is audio in scope for M3, or deferred?
