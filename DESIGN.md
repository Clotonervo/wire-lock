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
- **What makes it Wire Lock:** Rewires (§8b), in-round build-crafting picked on death, so every round plays differently.
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
| Client hosting | Vercel (separate Hobby project, free) | `game.samhopkins.dev`. Config in `client/vercel.json`. |
| Server hosting | Render free web service, Frankfurt | Root `Dockerfile` plus `render.yaml` blueprint. Free instances sleep after ~15 min idle, and the client shows a "waking up" screen while it cold-starts. Must stay a single instance, because rooms live in memory. See DEPLOY.md. |

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
- **Projectile weapons:** simulated on the server, but on the **owner's input timeline**: a player's projectiles advance once per applied input of theirs (`shared/src/playerStep.ts`), not once per server tick. As a result, the owner's client predicts its own rockets exactly, including the explosion's knockback on itself, so **rocket jumps are instant and need no correction**. The client ignores other players when predicting, so a rocket that hits someone on the server can differ; reconciliation fixes that. Other clients see the rocket interpolated 100 ms behind, like players, and each `explode` event carries its tick so they show the explosion when their delayed view reaches it.
  - Trade-off: a player's rockets pause if their inputs stop arriving. Away and leaving players' projectiles are removed.
- **Prediction covers the whole player:** movement, weapons (ammo, cooldown, reload, switch; `shared/src/arms.ts`) and own projectiles. The server syncs all of it at full precision so the client can rewind and replay. Cosmetic effects and sounds fire only when an input is first predicted, never during replays.
- The client plays muzzle flash, sound and tracer immediately (cosmetic only); damage numbers and kills come from server events.
- **Lag compensation (M5, done):** hitscan and melee shots are checked against where targets were in the shooter's view.
  - The client sends `viewTime` with each firing input: its estimate of server time minus `INTERP_DELAY_MS`. This is exactly the timeline it draws remote players on, so no RTT guesswork is needed.
  - The server keeps each player's end-of-tick position for the last `MAX_REWIND_MS` (400 ms) in `server/src/sim/lagCompensation.ts`. It interpolates targets to the clamped view time before raycasting.
  - Targets dead at that moment aren't hittable, and targets dead *now* can't be damaged.
  - Rockets don't need it: they're real server objects.
  - Hand-rolled instead of Colyseus's `Rewind`: about 60 lines, and it reuses the tick timeline we already had.
  - Measured at ~155 ms ping, shooting where a strafing target is drawn: 75% of pistol shots hit with it, 12% without (`--no-lag-comp` flag).

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
- v1 maps are **arrays of axis-aligned boxes** plus spawn points, defined as data in `shared/map/`. Boxes can be `invisible` (they collide but aren't drawn), which is used for clip walls above the arena walls so rocket jumps can't escape:
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

**Starter weapons (v1):** Pistol (hitscan), Shotgun (8 pellets), Rocket Launcher (projectile + splash + knockback). Rocket splash falls off linearly with distance to the target's box and is blocked by walls. Your own splash does 0.4× damage (`SELF_BLAST_DAMAGE_SCALE`), so rocket jumps cost about 25 HP.
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

**Implemented (M4):** the room hands modes a read-only `ModeRoom` (players, phase, timer) plus a small `ModeApi` (`setLoadout`, `addAmmo`, `setKills`, `setLives`, `eliminate`), so mode code never touches Colyseus state. Rules live in `server/src/sim/modes/`, and the data both sides need (names, blurbs, the Gun Game ladder) lives in `shared/src/modes/`. Mode changes to weapons and ammo reach the owner's prediction through the normal reconcile, because arms are synced state.
- **Gun Game:** Rocket Launcher ×2 → Shotgun ×2 → Pistol ×2 → Wrench. A wrench kill wins, and getting wrenched costs the victim a kill.
- **One in the Chamber:** Chamber Pistol (one-hit, no reloads) plus Wrench. You start with 1 bullet and get +1 per kill. 3 lives; eliminated players spectate, and people joining mid-round wait. Last standing wins, or on timeout the most lives, then most kills.
**Backlog:** Gun Game (each kill advances your weapon), One in the Chamber (pistol, 1 bullet, one-hit kills, +1 ammo per kill), Low Gravity, Everyone Tiny, King of the Hill.

The mode is chosen when a room is created (a query param or lobby option) and is exposed in synced state so the client can show mode-specific HUD.

---

## 8b. Rewires (augments)

Rewires are what make Wire Lock different from other silly shooters. Inspired by ARAM Mayhem's augments, they give players **build-crafting inside a 5-minute round**: every round you assemble a different, often ridiculous, combination of upgrades. Dying becomes a moment of choice instead of dead time.

### 8b.1 Rules

- **On in Deathmatch only** for now (`ModeDef.rewires: true`). Gun Game and One in the Chamber stay pure, since bonus bullets would break One in the Chamber.
- **Everyone starts each round with one pick.** When a round starts, every player sees a *choose 1 of 3* offer before spawning, like a short draft, and spawns as soon as they've chosen. The round clock runs from the start as normal. Players who join mid-round get the same starting pick before their first spawn.
- **You earn a pick every `REWIRE_DEATHS_PER_PICK` (2) deaths,** so on deaths 2, 4, 6…. It's offered on the respawn screen. This doubles as catch-up: losing players get stronger, which damps snowballing.
- **Kill streaks bank extra picks.** Every `REWIRE_STREAK_KILLS` (3) kills without dying banks one extra pick, so kills 3, 6, 9… each bank one. Banked picks aren't offered mid-fight; they're offered **at your next death**, whether or not that death earns a pick itself, one after another on the same respawn screen. The kill feed announces the streak.
- **Spawning waits for your choices.** You respawn when the respawn timer has run out **and** you've made every pending pick, whichever is later. Picking quickly costs nothing; dithering keeps you out of the fight. There's no random auto-pick.
  - The away timeout (§5.2) still applies. A player who has left the tab stops sending input, goes away after `AWAY_TIMEOUT_MS`, and keeps their pending picks for when they come back.
- **Rewires last for the round.** They reset when a new round starts. None are earned during warm-up or on the end-of-round screen.
- **Cap:** at most `MAX_REWIRES_PER_ROUND` (6) per player per round, counting the starting pick. After that no more are offered, and streaks still show in the kill feed for bragging rights. This is a safety net more than a target: with a pick every 2nd death, typical players should land around 3–5.
- **Offers:**
  - Each offer is 3 distinct Rewires, rolled by the **server** (seeded RNG) and weighted by rarity.
  - A Rewire you already own isn't offered again unless it's stackable and below its stack limit.
  - The client can only choose from the offer the server sent.
- **Rarity:** common (most picks: solid stat boosts), rare (changes how you play), wild (chaos and trade-offs). The offer weights are tunable constants.

### 8b.2 Definitions

Rewires are **data plus optional hooks**, like weapons (§7). Each is one file in `shared/src/rewires/` plus one registry line.

```ts
interface RewireDef {
  id: string;
  name: string;
  description: string;           // one line, shown on the pick card
  rarity: "common" | "rare" | "wild";
  maxStacks?: number;            // default 1
  /** Changes to shared simulation (applied per stack). Read by movement/arms/stepInput. */
  mods?: Partial<PlayerMods>;
  /** Server-only effects. Same narrow API style as weapon hooks; never touch Colyseus directly. */
  onDealDamage?: (ctx: DamageContext) => number;   // return modified damage
  onKill?: (ctx: KillContext) => void;
  onDeath?: (ctx: DeathContext) => void;
}

/** Folded from a player's Rewires; all multipliers default to 1 and additions to 0. */
interface PlayerMods {
  moveSpeedMul: number;
  jumpCount: number;             // extra mid-air jumps
  airAccelMul: number;
  maxHealthAdd: number;
  maxHealthMul: number;
  fireIntervalMul: number;       // < 1 = faster
  magazineMul: number;
  reloadMul: number;
  extraPellets: number;          // +N rays/projectiles per shot, with a little spread
  selfBlastDamageMul: number;
  splashRadiusMul: number;
}
```

**The prediction rule** (the important bit): anything that changes **movement or firing** must be a `mods` field read by the shared simulation (`stepPlayer`, `stepArms`, `stepInput`). That keeps client prediction exact, so a speed boost feels instant and never corrects. Concretely:
- The player's owned Rewire ids are synced in `PlayerState.rewires`.
- Both sides fold them into `PlayerMods` the same way.
- `PlayerSim` carries those mods through every step.

Effects only the server needs (damage multipliers, heal on kill, explode on death) use server hooks.

### 8b.3 First set (v1)

| Rewire | Rarity | Effect | Kind |
|---|---|---|---|
| Overclock | common | +25% move speed | mods |
| Plating | common | +40 max health | mods |
| Hair Trigger | common | Weapons fire 25% faster | mods |
| Deep Mags | common | +50% magazine size, reload 25% faster | mods |
| Split Shot | rare | +1 bullet (or rocket) per shot, slightly spread | mods |
| Spring Heels | rare | Double jump | mods |
| Blast Shield | rare | No damage from your own explosions, and +50% rocket-jump knockback | mods |
| Vampire | rare | Heal 25 on each kill | server hook |
| Glass Cannon | wild | Deal double damage, half max health | mods + server hook |
| Dead Man's Switch | wild | Explode when you die, damaging those nearby | server hook |

**Second set (v2), 20 more:**

| Rewire | Rarity | Effect | Kind |
|---|---|---|---|
| Hollow Points | common | +20% damage (stacks ×2) | mods |
| Magnetic Rounds | rare | Hitscan/melee shots that narrowly miss an enemy count as hits (~3.5° to the body's centre line). "Aim assist" as bullet magnetism, never camera snapping. | mods (server) |
| Headhunter | rare | Hits in the top 20% of the body deal +60% (the game's first headshots) | mods (server) |
| Point Blank | common | +40% damage within 6 m | mods (server) |
| Long Shot | common | +30% damage beyond 20 m | mods (server) |
| Executioner | rare | +50% damage to enemies below 35% health | mods (server) |
| Afterburn | rare | Your hits set enemies burning for 15 damage over 3 s | mods (server) |
| Ricochet | rare | Bullets bounce once off walls, at 75% damage after the bounce | mods (server + cosmetic tracer) |
| Big Boom | common | +40% explosion radius, including your own rocket jumps | mods (shared) |
| Cluster Bomb | wild | Rockets also burst into 3 bomblets around the impact | mods (shared, so self-knockback predicts) |
| Thick Skin | common | Take 15% less damage (stacks ×2) | mods (server) |
| Regenerator | common | Heal 5 HP/s after 3 s without taking damage | mods (server) |
| Second Wind | rare | Once per life, a killing hit leaves you at 1 HP | mods (server) |
| Feather Fall | common | Fall 40% slower | mods (shared) |
| Air Dash | rare | Right-click to dash the way you're moving (3 s cooldown) | mods (shared: cooldown in movement state) |
| Adrenaline | rare | Each kill gives +30% speed for 3 s | hook + shared boost timer |
| Scavenger | common | Kills refill your current magazine | hook |
| Radar | rare | See enemies through walls within 15 m. Anyone inside a Radar holder's range sees a faint pulsing cyan vignette, so they know they're being tracked. | mods (client rendering) |
| Copycat | rare | Each kill has a 20% chance to copy one of the victim's Rewires (they keep it; stack limits and the cap still apply) | hook |
| Gambler | wild | When picked, immediately gain 2 more random Rewires | hook (on pick) |

The rarity weights stay common 60 / rare 30 / wild 10. With 30 Rewires the pool is about half common.

**Implementation notes for v2:**
- **Data, not hooks.** Conditional damage modifiers (headshot, range, execute, damage taken) are plain `PlayerMods` numbers the server's damage step reads, so Rewires stay data.
- **Hooks only for events:** on kill (Vampire, Scavenger, Adrenaline, Copycat), on death (Dead Man's Switch), and on pick (Gambler).
- **Movement Rewires stay exact.** Anything changing movement (Feather Fall, Air Dash, Adrenaline's speed, Big Boom's and Cluster Bomb's effect on your own rocket jumps) goes through the shared simulation. Its extra state (dash cooldown, boost timer, whether alt-fire was held) is synced, like Spring Heels' fields.

**Later ideas:** Tiny and Giant (player size), Moon Boots (personal low gravity), Homing Rockets, Shield Bubble, "every 10th shot is a rocket".

### 8b.4 Networking and UI

- **State:**
  - `PlayerState.rewires` (owned ids, in pick order) and `PlayerState.pendingPicks` (count) are synced.
  - The current offer goes **only to its owner**, as a `rewireOffer` message (`{ options: string[] }`).
  - The player answers with a `pickRewire` message (`{ id }`), which the server validates against the outstanding offer.
- **Round-start draft:** the same cards appear at round start, over a dimmed view of the arena, with "Pick a Rewire to spawn" above them.
- **Respawn screen:** when you're dead with picks pending, the centre shows three cards (name, rarity colour, one-line description). You choose with a click or keys **1/2/3** (weapon-slot keys aren't needed while dead). The kill/respawn text moves above the cards and reads "Respawning when you pick" once the timer is done.
- **HUD:** your Rewires show as a compact list near the health readout.
- **Scoreboard:** everyone's Rewires are listed, so players know who to fear.
- **Kill feed:** shows "X is on a streak!" when a pick is banked.

### 8b.5 Tunables (first guesses, revisit after playtesting)

`REWIRE_DEATHS_PER_PICK = 2`, `REWIRE_STREAK_KILLS = 3`, `MAX_REWIRES_PER_ROUND = 6` (including the starting pick), `REWIRE_OFFER_SIZE = 3`, and rarity weights common 60 / rare 30 / wild 10.

### 8b.6 Open questions

- Does waiting for picks get abused, e.g. sitting on the respawn screen to avoid dying again? It costs you kills, so probably not, but watch for it.
- Should rarer Rewires become more likely later in the round, as in ARAM Mayhem's later picks?
- Overhead icons for others' Rewires, or the scoreboard only?

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
- ✅ **Done.** All three weapons work in multiplayer; rockets hit correctly and knock players around.
- Audio: synthesised with WebAudio (`client/src/audio/sfx.ts`), with no sound files. M toggles mute.

### M4 — Rooms, modes and deploy
- Join screen with room codes and mode select. Rooms are private (code-only), with 4-letter codes from an alphabet without I/O, joined via `?room=CODE` links. The pause menu shows the code and a "Copy invite link" button. There are at most `MAX_ROOMS` rooms per server.
- A "waking up the server" screen polls `/health` until the (possibly sleeping) server answers.
- Gun Game (rocket → shotgun → pistol → a new melee weapon; a melee kill wins) and One in the Chamber (pistol, 1 bullet, one-hit kills, +1 bullet per kill, 3 lives, last standing wins; eliminated players spectate).
- Dockerfile; deploy the server to Render and the client to Vercel as its own project; configure `VITE_SERVER_URL`, plus `ALLOWED_ORIGINS` for the WebSocket origin check and matchmaking CORS.
- Order: rooms and deploy first (with Deathmatch), then the two modes, tested on the live deployment.
- ✅ A friend can open a link and join a room on the live deployment. Deployed at https://game.samhopkins.dev; all three modes playable.

### M5 — Rewires
- Rewire framework (§8b): definitions + registry, `PlayerMods` folded into the shared simulation, server-rolled offers, a starting pick each round, a pick every 2nd death plus streak-banked picks, spawning that waits for picks, round cap and reset.
- Respawn-screen pick cards, HUD list, scoreboard, streak announcements.
- The v1 set of 10 Rewires (§8b.3), Deathmatch only.
- ✅ **Built** (live playtest pending). In a live Deathmatch, players pick Rewires while respawning; movement/firing Rewires predict with zero correction; a round with several Rewires each is playable and fun enough to want another.
- Verified locally: draft before first spawn, picks on every 2nd death, streak-banked pick delivered on a 1st death, spawn held until picked, and 0 prediction mismatches in 244 checks with Hair Trigger + Split Shot (including split rockets).

### M6+ — Silly stuff (open-ended)
- Work through the silly weapons and modes backlog.
- Pickups (health, weapon spawns), jump pads.
- ~~Lag compensation for hitscan.~~ Done (§5.5).
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

- Render's free instances get a small CPU share. Watch the tick timing with a full room, and move to the cheapest paid tier if it can't keep 30 Hz.
