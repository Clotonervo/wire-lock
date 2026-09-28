import { Room, type Client } from "@colyseus/core";
import {
  DEFAULT_MAP_ID,
  INPUT_BACKLOG,
  KILL_Y,
  MAX_INPUTS_PER_TICK,
  MAX_INPUT_BATCH,
  MAX_INPUT_QUEUE,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS_PER_ROOM,
  PATCH_RATE_MS,
  TICK_DT,
  TICK_RATE_HZ,
  getMap,
  stepPlayer,
} from "@wire-lock/shared";
import type { InputCmd, MapDef, PlayerMoveState, SpawnPoint } from "@wire-lock/shared";
import { log } from "../log";
import { ArenaState, PlayerState } from "../schema/ArenaState";
import { sanitizeInput } from "../sim/validateInput";

const PLAYER_COLORS = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6"];

/** Server-only per-player data that isn't synced. */
interface PlayerRuntime {
  queue: InputCmd[];
  /** Highest seq accepted into the queue, to drop duplicates and out-of-order commands. */
  lastQueuedSeq: number;
}

export class ArenaRoom extends Room<{ state: ArenaState }> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override patchRate = PATCH_RATE_MS;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;

  private map!: MapDef;
  private runtime = new Map<string, PlayerRuntime>();
  private nextSpawn = 0;
  private nextColor = 0;

  override messages = {
    input: (client: Client, payload: unknown) => this.receiveInputs(client, payload),
  };

  override onCreate() {
    const map = getMap(DEFAULT_MAP_ID);
    if (!map) throw new Error(`unknown map ${DEFAULT_MAP_ID}`);
    this.map = map;

    this.state = new ArenaState({ mapId: map.id, tick: 0 });
    // Accumulator-based, so the long-run rate is exactly TICK_RATE_HZ (plain setInterval(33.3) drifts to ~29.4 Hz,
    // which makes client inputs pile up and forces catch-up steps that look like hitches to other players).
    this.setFixedTimestep(() => this.tick(), TICK_RATE_HZ);
    log("room.create", { roomId: this.roomId, map: map.id });
  }

  override onJoin(client: Client) {
    const spawn = this.pickSpawn();
    const player = new PlayerState({
      x: spawn.pos.x,
      y: spawn.pos.y,
      z: spawn.pos.z,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: false,
      yaw: spawn.yaw,
      pitch: 0,
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length] ?? "#ffffff",
      lastProcessedSeq: -1,
    });
    this.state.players.set(client.sessionId, player);
    this.runtime.set(client.sessionId, { queue: [], lastQueuedSeq: -1 });
    log("room.join", { roomId: this.roomId, sessionId: client.sessionId, players: this.state.players.size });
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    log("room.leave", { roomId: this.roomId, sessionId: client.sessionId, players: this.state.players.size });
  }

  override onDispose() {
    log("room.dispose", { roomId: this.roomId });
  }

  private receiveInputs(client: Client, payload: unknown) {
    const rt = this.runtime.get(client.sessionId);
    if (!rt || !Array.isArray(payload) || payload.length > MAX_INPUT_BATCH) return;

    for (const raw of payload) {
      const cmd = sanitizeInput(raw);
      if (!cmd || cmd.seq <= rt.lastQueuedSeq) continue;
      rt.lastQueuedSeq = cmd.seq;
      rt.queue.push(cmd);
    }
    // A client sending faster than the tick rate just loses its oldest inputs.
    if (rt.queue.length > MAX_INPUT_QUEUE) rt.queue.splice(0, rt.queue.length - MAX_INPUT_QUEUE);
  }

  private tick() {
    this.state.tick++;

    this.state.players.forEach((player, sessionId) => {
      const rt = this.runtime.get(sessionId);
      if (!rt) return;

      // Players only move when their inputs arrive, so client prediction replays exactly.
      const count = rt.queue.length > INPUT_BACKLOG ? MAX_INPUTS_PER_TICK : 1;
      const inputs = rt.queue.splice(0, count);
      if (inputs.length === 0) return;

      let move = readMove(player);
      for (const cmd of inputs) {
        move = stepPlayer(move, cmd, this.map, TICK_DT);
        player.yaw = cmd.yaw;
        player.pitch = cmd.pitch;
        player.lastProcessedSeq = cmd.seq;
      }
      writeMove(player, move);

      if (player.y < KILL_Y) placeAt(player, this.pickSpawn());
    });
  }

  private pickSpawn(): SpawnPoint {
    const spawns = this.map.spawns;
    const spawn = spawns[this.nextSpawn++ % spawns.length];
    if (!spawn) throw new Error(`map ${this.map.id} has no spawns`);
    return spawn;
  }
}

function readMove(p: PlayerState): PlayerMoveState {
  return { pos: { x: p.x, y: p.y, z: p.z }, vel: { x: p.vx, y: p.vy, z: p.vz }, onGround: p.onGround };
}

function writeMove(p: PlayerState, m: PlayerMoveState) {
  p.x = m.pos.x;
  p.y = m.pos.y;
  p.z = m.pos.z;
  p.vx = m.vel.x;
  p.vy = m.vel.y;
  p.vz = m.vel.z;
  p.onGround = m.onGround;
}

function placeAt(p: PlayerState, spawn: SpawnPoint) {
  writeMove(p, { pos: { ...spawn.pos }, vel: { x: 0, y: 0, z: 0 }, onGround: false });
  p.yaw = spawn.yaw;
  p.pitch = 0;
}
