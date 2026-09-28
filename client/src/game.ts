import {
  CORRECTION_SMOOTH_MS,
  CORRECTION_SNAP_DISTANCE,
  INTERP_DELAY_MS,
  PLAYER_EYE_HEIGHT,
  TICK_DT,
  TICK_MS,
  aimDirection,
  eyePosition,
  getMode,
  getWeapon,
  lerp,
  playerBox,
  pointAlong,
  rayBox,
  rayBoxes,
} from "@wire-lock/shared";
import type { InputCmd, MapDef, ServerMessages, Vec3 } from "@wire-lock/shared";
import type { InputController } from "./input/input";
import type { ArenaRoom } from "./net/connection";
import { SnapshotBuffer } from "./net/interpolation";
import { Predictor } from "./net/prediction";
import { ServerClock } from "./net/serverClock";
import { readMove, type ArenaStateView, type PlayerView } from "./net/stateTypes";
import { Effects } from "./render/effects";
import { buildMapMesh } from "./render/mapMesh";
import { PlayerMesh } from "./render/playerMesh";
import type { SceneContext } from "./render/scene";
import { ViewModel } from "./render/viewModel";
import type { DebugOverlay, DebugStats } from "./ui/debugOverlay";
import type { Hud } from "./ui/hud";
import type { Scoreboard, ScoreRow } from "./ui/scoreboard";

/** Longest frame we simulate; after a stall (e.g. a background tab) we skip ahead instead of fast-forwarding. */
const MAX_FRAME_MS = 250;
/** Exponential decay time constant so ~95% of a correction is gone after CORRECTION_SMOOTH_MS. */
const CORRECTION_TAU_MS = CORRECTION_SMOOTH_MS / 3;
const PING_INTERVAL_MS = 1000;
const STATS_WINDOW_MS = 1000;
const UNKNOWN_PLAYER = "someone";

interface Remote {
  buffer: SnapshotBuffer;
  mesh: PlayerMesh;
}

export interface GameUi {
  overlay: DebugOverlay;
  hud: Hud;
  scoreboard: Scoreboard;
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
  /** Local ticks simulated, and the tick we last fired on, mirroring the server's fire-rate rule for cosmetics. */
  private localInputs = 0;
  private lastFireInput = -Infinity;
  private wasAlive = false;
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
  }

  start(): void {
    this.room.onStateChange((state) => this.onState(state));
    this.onState(this.room.state);
    this.listen("fire", (m) => this.onRemoteFire(m));
    this.listen("hit", (m) => this.ui.hud.hitmarker(m.killed));
    this.listen("kill", (m) => this.onKill(m));
    this.listen("roundStart", () => {});
    this.listen("roundEnd", () => {});
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
        this.onLocalState(p);
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
  }

  private onLocalState(p: PlayerView): void {
    const alive = p.alive && !p.away;
    if (alive && !this.wasAlive) this.onRespawn(p);
    if (alive && p.health < this.lastHealth) this.ui.hud.damageFlash();
    this.wasAlive = alive;
    this.lastHealth = p.health;
    this.viewModel.visible = alive;
    this.viewModel.setWeapon(getWeapon(p.weapon)?.view.color);
    this.reconcileLocal(readMove(p), p.lastProcessedSeq, alive);
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
    this.lastFireInput = -Infinity;
  }

  private reconcileLocal(server: ReturnType<typeof readMove>, lastProcessedSeq: number, alive: boolean): void {
    if (!this.predictor) {
      // First sighting of ourselves: start predicting from the spawn.
      this.predictor = new Predictor(server, this.map);
      this.predictor.alive = alive;
      this.prevPos = { ...server.pos };
      return;
    }

    const err = this.predictor.reconcile(server, lastProcessedSeq, alive);
    const mag = Math.hypot(err.x, err.y, err.z);
    if (mag === 0) return;

    this.stats.correction = mag;
    this.maxCorrectionThisWindow = Math.max(this.maxCorrectionThisWindow, mag);

    const o = this.correctionOffset;
    const combined = { x: o.x + err.x, y: o.y + err.y, z: o.z + err.z };
    if (Math.hypot(combined.x, combined.y, combined.z) > CORRECTION_SNAP_DISTANCE) {
      // Large error (e.g. respawn): snap.
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
    if (from) this.effects.muzzleFlash(from, now);
    for (const end of m.ends) {
      if (from) this.effects.tracer(from, end, now);
      this.effects.impact(end, now);
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
    const cmd: InputCmd = {
      seq: this.seq++,
      dt: TICK_DT,
      move: sampled.move,
      jump: sampled.jump,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      fire: sampled.fire,
      altFire: sampled.altFire,
    };
    this.prevPos = { ...this.predictor.state.pos };
    this.predictor.apply(cmd);
    this.outbox.push(cmd);

    this.localInputs++;
    if (cmd.fire && this.predictor.alive && this.room.state.phase !== "ended") this.tryLocalShot(now);
  }

  /** Cosmetic only: the server decides hits. Mirrors the server's fire-rate rule so shots line up. */
  private tryLocalShot(now: number): void {
    const weapon = getWeapon(this.me?.weapon ?? "");
    if (!weapon || !this.predictor) return;
    if ((this.localInputs - this.lastFireInput) * TICK_MS < weapon.fireIntervalMs) return;
    this.lastFireInput = this.localInputs;

    const origin = eyePosition(this.predictor.state.pos);
    const dir = aimDirection(this.input.yaw, this.input.pitch);
    const range = weapon.range ?? 0;
    let dist = rayBoxes(origin, dir, this.map.boxes, range);
    for (const remote of this.remotes.values()) {
      if (!remote.mesh.visible) continue;
      const p = remote.mesh.root.position;
      const d = rayBox(origin, dir, playerBox({ x: p.x, y: p.y, z: p.z }), dist);
      if (d !== null && d < dist) dist = d;
    }
    const end = pointAlong(origin, dir, dist);
    const muzzle = this.viewModel.muzzlePosition();
    this.effects.muzzleFlash(muzzle, now);
    this.effects.tracer(muzzle, end, now);
    if (dist < range) this.effects.impact(end, now);
    this.viewModel.kick();
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

    this.renderLocal();
    const serverNow = this.serverClock.now(now);
    if (serverNow !== null) {
      const renderTime = serverNow - INTERP_DELAY_MS;
      for (const remote of this.remotes.values()) {
        const s = remote.buffer.sample(renderTime);
        if (s) remote.mesh.update(s.pos, s.yaw, s.pitch, s.visible);
      }
    }
    this.viewModel.update(frameMs);
    this.effects.update(now);
    this.view.renderer.render(this.view.scene, this.view.camera);

    this.updateUi(serverNow);
    this.updateStats(now);
  };

  private renderLocal(): void {
    const cam = this.view.camera;
    cam.rotation.y = this.input.yaw;
    cam.rotation.x = this.input.pitch;
    if (!this.predictor) return;

    const alpha = this.accumulator / TICK_MS;
    const cur = this.predictor.state.pos;
    const o = this.correctionOffset;
    cam.position.set(
      lerp(this.prevPos.x, cur.x, alpha) + o.x,
      lerp(this.prevPos.y, cur.y, alpha) + o.y + PLAYER_EYE_HEIGHT,
      lerp(this.prevPos.z, cur.z, alpha) + o.z,
    );
  }

  // --- UI -----------------------------------------------------------------

  private updateUi(serverNow: number | null): void {
    const s = this.room.state;
    const me = this.me;
    const mode = getMode(s.modeId);
    const weapon = getWeapon(me?.weapon ?? "");
    const alive = !!me && me.alive && !me.away;
    const secondsUntil = (tick: number) =>
      serverNow === null ? 0 : Math.max(0, Math.ceil((tick * TICK_MS - serverNow) / 1000));

    let roundText: string;
    let roundSub: string;
    let centerText = "";
    let centerSub = "";
    let active = 0;
    s.players.forEach((p) => {
      if (!p.away) active++;
    });

    if (s.phase === "waiting") {
      roundText = "Warm-up";
      roundSub = `Waiting for players (${active}/${mode?.minPlayers ?? 2})`;
    } else if (s.phase === "playing") {
      roundText = s.phaseEndTick > 0 ? formatClock(secondsUntil(s.phaseEndTick)) : "";
      roundSub = `${mode?.name ?? ""}${s.scoreLimit ? ` · first to ${s.scoreLimit}` : ""}`;
    } else {
      roundText = s.winner ? `${this.nameOf(s.winner)} wins!` : "Draw!";
      roundSub = `Next round in ${secondsUntil(s.phaseEndTick)}`;
    }

    if (me && !alive && s.phase !== "ended" && !me.away) {
      centerText = this.lastKillerName ? `Fragged by ${this.lastKillerName}` : "You died";
      centerSub = me.respawnTick > 0 ? `Respawning in ${secondsUntil(me.respawnTick)}` : "";
    }

    this.ui.hud.update({
      health: me?.health ?? 0,
      alive,
      weaponName: weapon?.name ?? "",
      ammo: weapon?.magazine === undefined ? "∞" : String(weapon.magazine),
      roundText,
      roundSub,
      centerText,
      centerSub,
    });

    const showBoard = this.scoreboardHeld || s.phase === "ended";
    const rows: ScoreRow[] = [];
    if (showBoard) {
      s.players.forEach((p, id) => {
        rows.push({
          id,
          name: p.name,
          kills: p.kills,
          deaths: p.deaths,
          status: p.away ? "away" : p.alive ? "" : "dead",
          me: id === this.room.sessionId,
        });
      });
    }
    this.ui.scoreboard.update(showBoard, s.phase === "ended" ? roundText : mode?.name ?? "Scores", rows);
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
