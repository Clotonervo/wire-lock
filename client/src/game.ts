import {
  CORRECTION_SMOOTH_MS,
  CORRECTION_SNAP_DISTANCE,
  INFINITE_AMMO,
  INTERP_DELAY_MS,
  PLAYER_EYE_HEIGHT,
  TICK_DT,
  TICK_MS,
  applySpread,
  currentWeapon,
  foldMods,
  getRewire,
  GUN_GAME_LADDER,
  getMode,
  getWeapon,
  gunGameLevel,
  gunGame,
  oneInTheChamber,
  lerp,
  lerpVec3,
  playerBox,
  pointAlong,
  rayBox,
  rayBoxes,
  rayBoxesHit,
  reflect,
  shotPattern,
  slotForKey,
  SUPPLY_DROP_FALL_MS,
  SUPPLY_DROP_HEIGHT,
} from "@wire-lock/shared";
import type { InputCmd, InputStepResult, MapDef, PlayerMods, Projectile, ServerMessages, Vec3, WeaponDef } from "@wire-lock/shared";
import type { Sfx, SoundName } from "./audio/sfx";
import type { InputController } from "./input/input";
import type { ArenaRoom } from "./net/connection";
import { SnapshotBuffer } from "./net/interpolation";
import { Predictor } from "./net/prediction";
import { ServerClock } from "./net/serverClock";
import { projectilesOf, readSim, type ArenaStateView, type PlayerView } from "./net/stateTypes";
import { Effects } from "./render/effects";
import { buildMapMesh } from "./render/mapMesh";
import { PlayerMesh } from "./render/playerMesh";
import { PickupMesh } from "./render/pickupMesh";
import { ProjectileMesh } from "./render/projectileMesh";
import type { SceneContext } from "./render/scene";
import { ViewModel } from "./render/viewModel";
import type { DebugOverlay, DebugStats } from "./ui/debugOverlay";
import type { Hud } from "./ui/hud";
import type { RewirePicker } from "./ui/rewirePicker";
import type { Scoreboard, ScoreRow } from "./ui/scoreboard";

/** Longest frame we simulate; after a stall (e.g. a background tab) we skip ahead instead of fast-forwarding. */
const MAX_FRAME_MS = 250;
/** Exponential decay time constant so ~95% of a correction is gone after CORRECTION_SMOOTH_MS. */
const CORRECTION_TAU_MS = CORRECTION_SMOOTH_MS / 3;
const PING_INTERVAL_MS = 1000;
const STATS_WINDOW_MS = 1000;
const UNKNOWN_PLAYER = "someone";
/** How many of our own explosions to remember, so the server's echo of one we already showed is ignored. */
const SHOWN_EXPLOSIONS_KEPT = 32;
/** Spectator chase camera: how far behind and above the watched player. */
const SPECTATE_DISTANCE = 3.5;
const SPECTATE_HEIGHT = 2.4;
/** Upward speed gained in one tick that only a jump pad can give (a jump is JUMP_SPEED = 7). */
const PAD_LAUNCH_DETECT = 9;

interface Remote {
  buffer: SnapshotBuffer;
  mesh: PlayerMesh;
}

/** Someone else's projectile, drawn from interpolated server snapshots. */
interface RemoteProjectile {
  buffer: SnapshotBuffer;
  mesh: ProjectileMesh;
  vel: Vec3;
  /** Server time of its last snapshot, once it has left the synced state. */
  goneAt?: number;
}

export interface GameUi {
  overlay: DebugOverlay;
  hud: Hud;
  scoreboard: Scoreboard;
  sfx: Sfx;
  picker: RewirePicker;
}

/** Own projectiles are identified by shot and sub-index (Split Shot fires several per shot). */
function rocketKey(p: { shotSeq: number; sub?: number }): string {
  return `${p.shotSeq}:${p.sub ?? 0}`;
}

export class Game {
  private predictor: Predictor | null = null;
  private seq = 0;
  private outbox: InputCmd[] = [];
  private accumulator = 0;
  private lastFrame = performance.now();
  /** Local predicted position at the start of the current tick, for smooth rendering between ticks. */
  private prevPos: Vec3 = { x: 0, y: 0, z: 0 };
  /** Visual offset left over from reconciliation, decayed to zero over ~100 ms. */
  private correctionOffset: Vec3 = { x: 0, y: 0, z: 0 };
  private remotes = new Map<string, Remote>();
  private serverClock = new ServerClock();
  private lastTick = -1;

  private readonly effects: Effects;
  private readonly viewModel: ViewModel;
  /** Our own rockets, drawn from the prediction (keyed by shotSeq), with where each was at the start of the tick. */
  private ownRockets = new Map<string, { mesh: ProjectileMesh; prev: Vec3 }>();
  private remoteRockets = new Map<string, RemoteProjectile>();
  /** Explosions from others, held until our delayed view of the world reaches them. */
  private pendingExplosions: { at: Vec3; weapon: string; t: number }[] = [];
  private shownOwnExplosions: string[] = [];
  private pickups = new Map<string, { mesh: PickupMesh; falling: boolean }>();
  private wasAlive = false;
  /** Who we're watching while eliminated (spectator camera). */
  private spectating: string | null = null;
  private spectateFireHeld = false;
  private lastHealth = 0;
  private lastKillerName = "";
  private scoreboardHeld = false;

  readonly stats: DebugStats = {
    fps: 0,
    pingMs: null,
    pending: 0,
    serverTick: 0,
    correction: 0,
    maxCorrection: 0,
    players: 0,
  };
  private framesThisWindow = 0;
  private maxCorrectionThisWindow = 0;
  private windowStart = performance.now();

  constructor(
    private readonly room: ArenaRoom,
    private readonly map: MapDef,
    private readonly view: SceneContext,
    private readonly input: InputController,
    private readonly ui: GameUi,
  ) {
    view.scene.add(buildMapMesh(map));
    view.scene.add(view.camera); // so the first-person gun (a child of the camera) renders
    this.effects = new Effects(view.scene);
    this.viewModel = new ViewModel(view.camera);
    input.onScoreboard = (show) => (this.scoreboardHeld = show);
    input.onNumberKey = (n) => {
      if (ui.picker.visible) ui.picker.pickIndex(n - 1);
      else if (input.locked) {
        const arms = this.predictor?.sim.arms;
        const slot = arms && slotForKey(arms, n);
        if (slot !== undefined) input.requestSlot(slot);
      }
    };
    ui.picker.onPick = (id) => {
      this.room.send("pickRewire", { id });
      this.ui.sfx.play("switch");
    };
    input.onWheel = (dir) => {
      const arms = this.predictor?.sim.arms;
      if (arms && arms.slots.length > 0) input.requestSlot((arms.current + dir + arms.slots.length) % arms.slots.length);
    };
  }

  start(): void {
    this.room.onStateChange((state) => this.onState(state));
    this.onState(this.room.state);
    this.listen("fire", (m) => this.onRemoteFire(m));
    this.listen("hit", (m) => {
      this.ui.hud.hitmarker(m.killed);
      this.ui.sfx.play(m.killed ? "kill" : "hit");
    });
    this.listen("kill", (m) => this.onKill(m));
    this.listen("explode", (m) => this.onExplode(m));
    this.listen("roundStart", () => (this.lastKillerName = ""));
    this.listen("roundEnd", () => {});
    this.listen("pickup", (m) => {
      const sound = m.kind === "weapon" ? "weaponPickup" : "heal";
      if (m.player === this.room.sessionId) this.ui.sfx.play(sound);
      else this.ui.sfx.play(sound, m.pos);
    });
    this.listen("copied", (m) => {
      const mine = m.player === this.room.sessionId;
      const what = getRewire(m.rewire)?.name ?? m.rewire;
      this.ui.hud.addNote(`${mine ? "You" : this.nameOf(m.player)} copied ${this.nameOf(m.from)}'s ${what}!`, mine);
    });
    this.listen("secondWind", (m) => {
      const mine = m.player === this.room.sessionId;
      this.ui.hud.addNote(`${mine ? "Your" : `${this.nameOf(m.player)}'s`} Second Wind kicked in!`, mine);
    });
    this.listen("supplyDrop", (m) => {
      const name = getWeapon(m.weapon)?.name ?? m.weapon;
      const me = this.predictor?.state.pos;
      const dist = me ? Math.round(Math.hypot(m.pos.x - me.x, m.pos.z - me.z)) : undefined;
      this.ui.hud.showBanner(`SUPPLY DROP · ${name}`, dist === undefined ? "Follow the beam" : `${dist} m away. Follow the beam`);
      this.ui.hud.addNote(`Supply drop: ${name}`, false);
      this.ui.sfx.play("supplyDrop");
    });
    this.listen("streak", (m) => {
      const mine = m.player === this.room.sessionId;
      this.ui.hud.addNote(`${mine ? "You're" : `${this.nameOf(m.player)} is`} on a ${m.kills}-kill streak! +1 Rewire`, mine);
    });
    const ping = () => this.room.ping((ms) => (this.stats.pingMs = ms));
    ping();
    setInterval(ping, PING_INTERVAL_MS);
    requestAnimationFrame(this.frame);
  }

  private listen<K extends keyof ServerMessages>(type: K, handler: (msg: ServerMessages[K]) => void): void {
    this.room.onMessage(type, handler);
  }

  // --- State --------------------------------------------------------------

  private get me(): PlayerView | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  private get canFire(): boolean {
    return this.room.state.phase !== "ended";
  }

  private onState(state: ArenaStateView): void {
    this.stats.serverTick = state.tick;
    this.stats.players = state.players.size;

    // Place remote snapshots on the server's timeline: patches are 50 ms apart but carry
    // 1 or 2 ticks of movement, so arrival times would make remote speed wobble.
    const serverMs = state.tick * TICK_MS;
    const newTick = state.tick !== this.lastTick;
    if (newTick) {
      this.serverClock.sample(serverMs, performance.now());
      this.lastTick = state.tick;
    }

    const seen = new Set<string>();
    state.players.forEach((p, id) => {
      seen.add(id);
      if (id === this.room.sessionId) {
        this.onLocalState(state, p);
        return;
      }
      let remote = this.remotes.get(id);
      if (!remote) {
        remote = { buffer: new SnapshotBuffer(), mesh: new PlayerMesh(p.color) };
        this.view.scene.add(remote.mesh.root);
        this.remotes.set(id, remote);
      }
      if (newTick) {
        remote.buffer.push({
          t: serverMs,
          pos: { x: p.x, y: p.y, z: p.z },
          yaw: p.yaw,
          pitch: p.pitch,
          visible: p.alive && !p.away,
        });
      }
    });
    for (const [id, remote] of this.remotes) {
      if (seen.has(id)) continue;
      remote.mesh.dispose();
      this.remotes.delete(id);
    }

    if (newTick) this.onRemoteProjectiles(state, serverMs);
  }

  private onRemoteProjectiles(state: ArenaStateView, serverMs: number): void {
    const seen = new Set<string>();
    state.projectiles.forEach((p, key) => {
      if (p.owner === this.room.sessionId) return; // ours are drawn from the prediction
      seen.add(key);
      let r = this.remoteRockets.get(key);
      if (!r) {
        r = { buffer: new SnapshotBuffer(), mesh: new ProjectileMesh(this.view.scene), vel: { x: 0, y: 0, z: 0 } };
        r.mesh.root.visible = false;
        this.remoteRockets.set(key, r);
      }
      r.vel = { x: p.vx, y: p.vy, z: p.vz };
      r.buffer.push({ t: serverMs, pos: { x: p.x, y: p.y, z: p.z }, yaw: 0, pitch: 0, visible: true });
    });
    for (const [key, r] of this.remoteRockets) {
      // Keep drawing it until our delayed view catches up with where it was last seen.
      if (!seen.has(key) && r.goneAt === undefined) r.goneAt = r.buffer.lastTime ?? serverMs;
    }
  }

  private onLocalState(state: ArenaStateView, p: PlayerView): void {
    const alive = p.alive && !p.away;
    if (alive && !this.wasAlive) this.onRespawn(p);
    if (alive && p.health < this.lastHealth) {
      this.ui.hud.damageFlash();
      this.ui.sfx.play("hurt");
    }
    this.wasAlive = alive;
    this.lastHealth = p.health;
    this.viewModel.visible = alive;

    const sim = readSim(p);
    const projectiles = projectilesOf(state, this.room.sessionId);
    if (!this.predictor) {
      // First sighting of ourselves: start predicting from the spawn.
      this.predictor = new Predictor(sim, projectiles, this.map);
      this.prevPos = { ...sim.move.pos };
      return;
    }
    this.applyCorrection(this.predictor.reconcile(sim, projectiles, p.lastProcessedSeq, this.canFire));
  }

  /** Face the way the spawn point faces. (The synced yaw is our own last input, not the spawn's.) */
  private onRespawn(p: PlayerView): void {
    let best = Infinity;
    for (const s of this.map.spawns) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < best) {
        best = d;
        this.input.yaw = s.yaw;
      }
    }
    this.input.pitch = 0;
  }

  private applyCorrection(err: Vec3): void {
    if (!this.predictor) return;
    const mag = Math.hypot(err.x, err.y, err.z);
    if (mag === 0) return;

    this.stats.correction = mag;
    this.maxCorrectionThisWindow = Math.max(this.maxCorrectionThisWindow, mag);

    const o = this.correctionOffset;
    const combined = { x: o.x + err.x, y: o.y + err.y, z: o.z + err.z };
    if (Math.hypot(combined.x, combined.y, combined.z) > CORRECTION_SNAP_DISTANCE) {
      // Large error (e.g. respawn, or someone else's rocket): snap.
      this.correctionOffset = { x: 0, y: 0, z: 0 };
      this.prevPos = { ...this.predictor.state.pos };
    } else {
      // Small error: keep drawing where we were and let the offset decay.
      this.correctionOffset = combined;
      this.prevPos = { x: this.prevPos.x - err.x, y: this.prevPos.y - err.y, z: this.prevPos.z - err.z };
    }
  }

  // --- Events -------------------------------------------------------------

  private onRemoteFire(m: ServerMessages["fire"]): void {
    const now = performance.now();
    const remote = this.remotes.get(m.shooter);
    const from = remote?.mesh.visible ? remote.mesh.muzzlePosition() : undefined;
    const weapon = getWeapon(m.weapon);
    if (weapon?.view.sound) this.ui.sfx.play(weapon.view.sound as SoundName, from);
    if (from) this.effects.muzzleFlash(from, now);
    for (const end of m.ends) {
      if (from) this.effects.tracer(from, end, now);
      this.effects.impact(end, now);
    }
    for (const b of m.bounces ?? []) {
      this.effects.tracer(b.from, b.to, now);
      this.effects.impact(b.to, now);
    }
  }

  private onExplode(m: ServerMessages["explode"]): void {
    if (m.owner === this.room.sessionId) {
      // Usually we predicted it already; show the server's only if we didn't (e.g. it hit a player we didn't know about).
      const key = rocketKey(m);
      if (!this.shownOwnExplosions.includes(key)) this.showExplosion(m.pos, m.weapon, key);
      return;
    }
    this.pendingExplosions.push({ at: m.pos, weapon: m.weapon, t: m.tick * TICK_MS });
  }

  private showExplosion(at: Vec3, weaponId: string, ownKey?: string): void {
    const weapon = getWeapon(weaponId);
    this.effects.explosion(at, weapon?.projectile?.splashRadius ?? 1, performance.now());
    this.ui.sfx.play("explosion", at);
    if (ownKey !== undefined) {
      this.shownOwnExplosions.push(ownKey);
      if (this.shownOwnExplosions.length > SHOWN_EXPLOSIONS_KEPT) this.shownOwnExplosions.shift();
    }
  }

  private onKill(m: ServerMessages["kill"]): void {
    const killer = this.nameOf(m.killer);
    const victim = this.nameOf(m.victim);
    const me = this.room.sessionId;
    if (m.victim === me) this.lastKillerName = m.killer === me ? "" : killer;
    const weapon = getWeapon(m.weapon)?.name ?? m.weapon;
    this.ui.hud.addKill(killer, victim, weapon, m.killer === me || m.victim === me);
  }

  private nameOf(id: string): string {
    return this.room.state.players.get(id)?.name ?? UNKNOWN_PLAYER;
  }

  // --- Simulation ---------------------------------------------------------

  private simTick(now: number): void {
    if (!this.predictor) return;
    const sampled = this.input.sample();
    // The moment of the world we're showing (remote players are drawn this far behind the server),
    // sent with shots so the server can check hits against what we actually saw.
    const serverNow = this.serverClock.now(now);
    const viewTime = sampled.fire && serverNow !== null ? serverNow - INTERP_DELAY_MS : undefined;
    const cmd: InputCmd = {
      seq: this.seq++,
      dt: TICK_DT,
      move: sampled.move,
      jump: sampled.jump,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      fire: sampled.fire,
      altFire: sampled.altFire,
      reload: sampled.reload,
      ...(sampled.weaponSlot === undefined ? {} : { weaponSlot: sampled.weaponSlot }),
      ...(viewTime === undefined ? {} : { viewTime }),
    };
    this.prevPos = { ...this.predictor.state.pos };
    for (const p of this.predictor.projectiles) {
      const r = this.ownRockets.get(rocketKey(p));
      if (r) r.prev = { ...p.pos };
    }
    const prevVy = this.predictor.state.vel.y;
    const result = this.predictor.apply(cmd, this.canFire);
    this.outbox.push(cmd);
    this.predictedEffects(result, now, prevVy);

    // While eliminated, a click watches the next player.
    if (this.me?.eliminated && sampled.fire && !this.spectateFireHeld) this.spectating = this.nextSpectateTarget(this.spectating);
    this.spectateFireHeld = sampled.fire;
  }

  /** Living players we could watch, in a stable order. */
  private spectatable(): string[] {
    const ids: string[] = [];
    this.room.state.players.forEach((p, id) => {
      if (id !== this.room.sessionId && p.alive && !p.away) ids.push(id);
    });
    return ids.sort();
  }

  private nextSpectateTarget(current: string | null): string | null {
    const ids = this.spectatable();
    if (ids.length === 0) return null;
    const i = current ? ids.indexOf(current) : -1;
    return ids[(i + 1) % ids.length] ?? null;
  }

  /** Chase camera behind the spectated player. Returns false if there's nobody to watch. */
  private renderSpectator(): boolean {
    if (!this.spectating || !this.spectatable().includes(this.spectating)) this.spectating = this.nextSpectateTarget(null);
    const target = this.spectating ? this.remotes.get(this.spectating) : undefined;
    if (!target) return false;
    const p = target.mesh.root.position;
    const yaw = target.mesh.root.rotation.y;
    const cam = this.view.camera;
    // Behind and above, looking at their head.
    cam.position.set(p.x + Math.sin(yaw) * SPECTATE_DISTANCE, p.y + SPECTATE_HEIGHT, p.z + Math.cos(yaw) * SPECTATE_DISTANCE);
    cam.lookAt(p.x, p.y + PLAYER_EYE_HEIGHT, p.z);
    return true;
  }

  /** Effects and sounds for what our own input just did. Replays during reconciliation don't come through here. */
  private predictedEffects(r: InputStepResult, now: number, prevVy: number): void {
    // A jump pad launch shows up as a big jump in upward speed that our own jump can't make.
    if (r.sim.move.vel.y - prevVy > PAD_LAUNCH_DETECT) this.ui.sfx.play("pad");
    if (r.switched) this.ui.sfx.play("switch");
    if (r.reloadStarted) this.ui.sfx.play("reload");
    if (r.fired) this.localShot(r.fired, r.origin, r.aim, now, r.sim.mods);
    for (const e of r.explosions) this.showExplosion(e.point, e.weapon.id, rocketKey(e));
  }

  /** Cosmetic only: the server decides hits. */
  private localShot(weapon: WeaponDef, origin: Vec3, aim: Vec3, now: number, mods: PlayerMods | undefined): void {
    const muzzle = this.viewModel.muzzlePosition();
    this.effects.muzzleFlash(muzzle, now);
    this.viewModel.kick();
    if (weapon.view.sound) this.ui.sfx.play(weapon.view.sound as SoundName);
    if (weapon.kind !== "hitscan") return;

    const range = weapon.range ?? 0;
    const pattern = shotPattern(weapon, mods);
    for (let i = 0; i < pattern.count; i++) {
      // Client-side spread is cosmetic, so it needn't match the server's seeded RNG.
      const dir = applySpread(aim, pattern.spread, Math.random);
      let dist = rayBoxes(origin, dir, this.map.boxes, range);
      for (const remote of this.remotes.values()) {
        if (!remote.mesh.visible) continue;
        const p = remote.mesh.root.position;
        const d = rayBox(origin, dir, playerBox({ x: p.x, y: p.y, z: p.z }), dist);
        if (d !== null && d < dist) dist = d;
      }
      const end = pointAlong(origin, dir, dist);
      this.effects.tracer(muzzle, end, now);
      if (dist < range) this.effects.impact(end, now);
      // Ricochet (cosmetic: the server decides whether the bounce hits anyone).
      if (mods?.ricochets) {
        const wall = rayBoxesHit(origin, dir, this.map.boxes, dist + 1e-3);
        if (wall.normal && wall.dist <= dist + 1e-3) {
          const out = reflect(dir, wall.normal);
          const from = pointAlong(end, wall.normal, 0.01);
          const to = pointAlong(from, out, rayBoxes(from, out, this.map.boxes, range - wall.dist));
          this.effects.tracer(from, to, now);
          this.effects.impact(to, now);
        }
      }
    }
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frameMs = Math.min(now - this.lastFrame, MAX_FRAME_MS);
    this.lastFrame = now;

    this.accumulator += frameMs;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.simTick(now);
    }
    if (this.outbox.length > 0) {
      this.room.send("input", this.outbox);
      this.outbox = [];
    }

    const decay = Math.exp(-frameMs / CORRECTION_TAU_MS);
    this.correctionOffset.x *= decay;
    this.correctionOffset.y *= decay;
    this.correctionOffset.z *= decay;

    const alpha = this.accumulator / TICK_MS;
    this.renderLocal(alpha);
    this.renderOwnRockets(alpha);
    const serverNow = this.serverClock.now(now);
    if (serverNow !== null) this.renderRemote(serverNow - INTERP_DELAY_MS);
    this.renderPickups(now);
    this.viewModel.update(frameMs);
    this.effects.update(now);
    const cam = this.view.camera.position;
    this.ui.sfx.setListener({ x: cam.x, y: cam.y, z: cam.z }, this.input.yaw);
    this.view.renderer.render(this.view.scene, this.view.camera);

    this.updateUi(serverNow);
    this.updateStats(now);
  };

  private renderLocal(alpha: number): void {
    const s = this.room.state;
    if (this.me?.eliminated && (s.phase === "playing" || s.phase === "paused") && this.renderSpectator()) return;
    const cam = this.view.camera;
    cam.rotation.set(this.input.pitch, this.input.yaw, 0);
    if (!this.predictor) return;

    const cur = this.predictor.state.pos;
    const o = this.correctionOffset;
    cam.position.set(
      lerp(this.prevPos.x, cur.x, alpha) + o.x,
      lerp(this.prevPos.y, cur.y, alpha) + o.y + PLAYER_EYE_HEIGHT,
      lerp(this.prevPos.z, cur.z, alpha) + o.z,
    );
  }

  private renderPickups(now: number): void {
    const serverNow = this.serverClock.now(now);
    const seen = new Set<string>();
    this.room.state.pickups.forEach((p, key) => {
      seen.add(key);
      let entry = this.pickups.get(key);
      if (!entry) {
        entry = { mesh: new PickupMesh(this.view.scene, { x: p.x, y: p.y, z: p.z }, p.kind, p.weapon, p.loose), falling: false };
        this.pickups.set(key, entry);
      }
      // Supply drops fall in over SUPPLY_DROP_FALL_MS, landing on the server's tick.
      const leftMs = serverNow === null || p.landTick === 0 ? 0 : p.landTick * TICK_MS - serverNow;
      const fall = Math.max(0, Math.min(1, leftMs / SUPPLY_DROP_FALL_MS));
      if (entry.falling && fall === 0) this.ui.sfx.play("dropLand", { x: p.x, y: p.y, z: p.z });
      entry.falling = fall > 0;
      entry.mesh.update(p.active, now / 1000, fall * fall * SUPPLY_DROP_HEIGHT);
    });
    for (const [key, entry] of this.pickups) {
      if (seen.has(key)) continue;
      entry.mesh.dispose();
      this.pickups.delete(key);
    }
  }

  private renderOwnRockets(alpha: number): void {
    const live = new Set<string>();
    for (const p of this.predictor?.projectiles ?? ([] as Projectile[])) {
      const key = rocketKey(p);
      live.add(key);
      let r = this.ownRockets.get(key);
      if (!r) {
        // New this tick: start it at the muzzle so it visibly leaves the gun.
        r = { mesh: new ProjectileMesh(this.view.scene), prev: this.viewModel.muzzlePosition() };
        this.ownRockets.set(key, r);
      }
      r.mesh.update(lerpVec3(r.prev, p.pos, alpha), p.vel);
    }
    for (const [key, r] of this.ownRockets) {
      if (live.has(key)) continue;
      r.mesh.dispose();
      this.ownRockets.delete(key);
    }
  }

  private renderRemote(renderTime: number): void {
    const radar = this.predictor?.sim.mods?.radarRange ?? 0;
    const cam = this.view.camera.position;
    for (const [id, remote] of this.remotes) {
      const s = remote.buffer.sample(renderTime);
      if (s) remote.mesh.update(s.pos, s.yaw, s.pitch, s.visible);
      const state = this.room.state.players.get(id);
      if (state?.weapon) remote.mesh.setWeapon(state.weapon);
      const p = remote.mesh.root.position;
      remote.mesh.setXRay(radar > 0 && this.wasAlive && Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) <= radar);
      remote.mesh.setBurning(this.room.state.players.get(id)?.burning ?? false);
    }
    for (const [key, r] of this.remoteRockets) {
      if (r.goneAt !== undefined && renderTime >= r.goneAt) {
        r.mesh.dispose();
        this.remoteRockets.delete(key);
        continue;
      }
      // Don't show it before our delayed view of the shooter has fired it.
      const first = r.buffer.firstTime;
      const s = first !== undefined && renderTime >= first ? r.buffer.sample(renderTime) : null;
      r.mesh.root.visible = !!s;
      if (s) r.mesh.update(s.pos, r.vel);
    }
    const due = this.pendingExplosions.filter((e) => renderTime >= e.t);
    if (due.length > 0) {
      this.pendingExplosions = this.pendingExplosions.filter((e) => renderTime < e.t);
      for (const e of due) this.showExplosion(e.at, e.weapon);
    }
  }

  // --- UI -----------------------------------------------------------------

  private updateUi(serverNow: number | null): void {
    const s = this.room.state;
    const me = this.me;
    const mode = getMode(s.modeId);
    const arms = this.predictor?.sim.arms;
    const weapon = arms ? currentWeapon(arms) : undefined;
    const alive = !!me && me.alive && !me.away;
    const secondsUntil = (tick: number) =>
      serverNow === null ? 0 : Math.max(0, Math.ceil((tick * TICK_MS - serverNow) / 1000));

    let roundText: string;
    let roundSub: string;
    let centerText = "";
    let centerSub = "";
    let active = 0;
    let standing = 0;
    s.players.forEach((p) => {
      if (p.away) return;
      active++;
      if (!p.eliminated) standing++;
    });

    if (s.phase === "waiting") {
      roundText = "Warm-up";
      roundSub = `Waiting for players (${active}/${mode?.minPlayers ?? 2})`;
    } else if (s.phase === "playing") {
      roundText = s.phaseEndTick > 0 ? formatClock(secondsUntil(s.phaseEndTick)) : "";
      roundSub = this.modeLine(s.modeId, s.scoreLimit, me, standing);
    } else if (s.phase === "paused") {
      roundText = "Paused";
      roundSub = `Waiting for players (${active}/${mode?.minPlayers ?? 2}) · round resets in ${secondsUntil(s.phaseEndTick)}s`;
    } else {
      roundText = s.winner ? `${this.nameOf(s.winner)} wins!` : "Draw!";
      roundSub = `Next round in ${secondsUntil(s.phaseEndTick)}`;
    }

    const picking = !!me && !alive && !me.away && me.offer.length > 0;
    if (me?.eliminated && (s.phase === "playing" || s.phase === "paused")) {
      centerText = "Eliminated";
      centerSub = this.spectating ? `Spectating ${this.nameOf(this.spectating)} · click to switch` : "You're out until the next round";
    } else if (picking && me.deaths === 0 && me.kills === 0 && !this.lastKillerName) {
      centerText = ""; // the round-start draft: the picker's own title says it all
    } else if (me && !alive && s.phase !== "ended" && !me.away) {
      centerText = this.lastKillerName ? `Fragged by ${this.lastKillerName}` : "You died";
      const wait = me.respawnTick > 0 ? secondsUntil(me.respawnTick) : 0;
      centerSub = me.respawnTick > 0 ? (wait > 0 ? `Respawning in ${wait}` : me.pendingPicks > 0 ? "Respawning when you pick" : "") : "";
    }
    if (picking) {
      const draft = me.deaths === 0 && me.kills === 0 && !this.lastKillerName;
      this.ui.picker.show(me.offer.toArray(), draft ? "Pick a Rewire to spawn" : "Pick a Rewire", me.pendingPicks);
    } else {
      this.ui.picker.hide();
    }
    const rewireNames = (ids: string[]) => ids.map((id) => getRewire(id)?.name ?? id);

    const ammo = arms?.ammo[arms.current] ?? 0;
    this.ui.hud.update({
      health: me?.health ?? 0,
      lives: s.phase === "playing" ? (me?.lives ?? -1) : -1,
      alive,
      weaponName: weapon?.name ?? "",
      ammo:
        arms && arms.reloadMs > 0
          ? "Reloading…"
          : ammo === INFINITE_AMMO
            ? weapon?.kind === "melee"
              ? ""
              : "∞"
            : weapon?.reloadMs === undefined
              ? String(ammo) // no reloading: just a count of what you have
              : `${ammo} / ${weapon.magazine ?? 0}`,
      slots: (arms?.slots ?? []).map((id, i) => ({ key: getWeapon(id)?.slotKey ?? i + 1, name: getWeapon(id)?.name ?? id, active: i === arms?.current })),
      rewires: me ? rewireNames(me.rewires.toArray()) : [],
      burning: me?.burning ?? false,
      tracked: alive && this.isTracked(),
      roundText,
      roundSub,
      centerText,
      centerSub,
    });
    this.viewModel.setWeapon(weapon);

    const showBoard = this.scoreboardHeld || s.phase === "ended";
    const rows: ScoreRow[] = [];
    if (showBoard) {
      s.players.forEach((p, id) => {
        rows.push({
          id,
          name: p.name,
          kills: p.kills,
          deaths: p.deaths,
          status: p.away ? "away" : p.eliminated ? "out" : !p.alive ? "dead" : p.lives >= 0 && s.phase === "playing" ? "♥".repeat(p.lives) : "",
          rewires: rewireNames(p.rewires.toArray()).join(", "),
          me: id === this.room.sessionId,
        });
      });
    }
    this.ui.scoreboard.update(showBoard, s.phase === "ended" ? roundText : mode?.name ?? "Scores", rows);
  }

  /** Whether any living enemy with Radar is within its range of us, so it can see us through walls. */
  private isTracked(): boolean {
    const me = this.predictor?.state.pos;
    if (!me) return false;
    for (const [id, remote] of this.remotes) {
      const p = this.room.state.players.get(id);
      if (!p?.alive || p.away || !remote.mesh.visible) continue;
      const range = foldMods(p.rewires.toArray()).radarRange;
      if (range <= 0) continue;
      const o = remote.mesh.root.position;
      if (Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) <= range) return true;
    }
    return false;
  }

  /** The mode-specific line under the round timer. */
  private modeLine(modeId: string, scoreLimit: number, me: PlayerView | undefined, standing: number): string {
    const mode = getMode(modeId);
    if (modeId === gunGame.id && me) {
      const level = gunGameLevel(me.kills);
      const step = GUN_GAME_LADDER[level];
      const done = GUN_GAME_LADDER.slice(0, level).reduce((n, st) => n + st.kills, 0);
      const toGo = (step?.kills ?? 0) - (me.kills - done);
      const next = level === GUN_GAME_LADDER.length - 1 ? "a kill wins" : `${toGo} more to level up`;
      return `Gun Game · weapon ${level + 1}/${GUN_GAME_LADDER.length} · ${next}`;
    }
    if (modeId === oneInTheChamber.id) return `One in the Chamber · ${standing} still standing`;
    return `${mode?.name ?? ""}${scoreLimit ? ` · first to ${scoreLimit}` : ""}`;
  }

  private updateStats(now: number): void {
    this.framesThisWindow++;
    this.stats.pending = this.predictor?.pending.length ?? 0;
    if (now - this.windowStart >= STATS_WINDOW_MS) {
      this.stats.fps = Math.round((this.framesThisWindow * 1000) / (now - this.windowStart));
      this.stats.maxCorrection = this.maxCorrectionThisWindow;
      this.framesThisWindow = 0;
      this.maxCorrectionThisWindow = 0;
      this.windowStart = now;
    }
    this.ui.overlay.update(this.stats);
  }
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
