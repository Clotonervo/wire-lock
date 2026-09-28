import {
  CORRECTION_SMOOTH_MS,
  CORRECTION_SNAP_DISTANCE,
  INTERP_DELAY_MS,
  PLAYER_EYE_HEIGHT,
  TICK_DT,
  TICK_MS,
  lerp,
} from "@wire-lock/shared";
import type { InputCmd, MapDef, Vec3 } from "@wire-lock/shared";
import type { InputController } from "./input/input";
import type { ArenaRoom } from "./net/connection";
import { SnapshotBuffer } from "./net/interpolation";
import { Predictor } from "./net/prediction";
import { ServerClock } from "./net/serverClock";
import { readMove, type ArenaStateView } from "./net/stateTypes";
import { buildMapMesh } from "./render/mapMesh";
import { PlayerMesh } from "./render/playerMesh";
import type { SceneContext } from "./render/scene";
import type { DebugOverlay, DebugStats } from "./ui/debugOverlay";

/** Longest frame we simulate; after a stall (e.g. a background tab) we skip ahead instead of fast-forwarding. */
const MAX_FRAME_MS = 250;
/** Exponential decay time constant so ~95% of a correction is gone after CORRECTION_SMOOTH_MS. */
const CORRECTION_TAU_MS = CORRECTION_SMOOTH_MS / 3;
const PING_INTERVAL_MS = 1000;
const STATS_WINDOW_MS = 1000;

interface Remote {
  buffer: SnapshotBuffer;
  mesh: PlayerMesh;
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
    private readonly overlay: DebugOverlay,
  ) {
    view.scene.add(buildMapMesh(map));
  }

  start(): void {
    this.room.onStateChange((state) => this.onState(state));
    this.onState(this.room.state);
    const ping = () => this.room.ping((ms) => (this.stats.pingMs = ms));
    ping();
    setInterval(ping, PING_INTERVAL_MS);
    requestAnimationFrame(this.frame);
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
        this.reconcileLocal(readMove(p), p.lastProcessedSeq, p.yaw);
        return;
      }
      let remote = this.remotes.get(id);
      if (!remote) {
        remote = { buffer: new SnapshotBuffer(), mesh: new PlayerMesh(p.color) };
        this.view.scene.add(remote.mesh.root);
        this.remotes.set(id, remote);
      }
      if (newTick) remote.buffer.push({ t: serverMs, pos: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, pitch: p.pitch });
    });

    for (const [id, remote] of this.remotes) {
      if (seen.has(id)) continue;
      remote.mesh.dispose();
      this.remotes.delete(id);
    }
  }

  private reconcileLocal(server: ReturnType<typeof readMove>, lastProcessedSeq: number, serverYaw: number): void {
    if (!this.predictor) {
      // First sighting of ourselves: start predicting from the spawn, facing the way the server placed us.
      this.predictor = new Predictor(server, this.map);
      this.prevPos = { ...server.pos };
      this.input.yaw = serverYaw;
      return;
    }

    const err = this.predictor.reconcile(server, lastProcessedSeq);
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

  private simTick(): void {
    if (!this.predictor) return;
    const sampled = this.input.sample();
    const cmd: InputCmd = {
      seq: this.seq++,
      dt: TICK_DT,
      move: sampled.move,
      jump: sampled.jump,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      fire: false,
      altFire: false,
    };
    this.prevPos = { ...this.predictor.state.pos };
    this.predictor.apply(cmd);
    this.outbox.push(cmd);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frameMs = Math.min(now - this.lastFrame, MAX_FRAME_MS);
    this.lastFrame = now;

    this.accumulator += frameMs;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.simTick();
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
        if (s) remote.mesh.update(s.pos, s.yaw, s.pitch);
      }
    }
    this.view.renderer.render(this.view.scene, this.view.camera);

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
    this.overlay.update(this.stats);
  }
}
