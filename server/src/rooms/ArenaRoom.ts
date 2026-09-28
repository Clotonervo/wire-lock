import { Room, type Client } from "@colyseus/core";
import {
  AWAY_TIMEOUT_MS,
  DEFAULT_MAP_ID,
  DEFAULT_MODE_ID,
  INPUT_BACKLOG,
  KILL_Y,
  MAX_HEALTH,
  MAX_INPUTS_PER_TICK,
  MAX_INPUT_BATCH,
  MAX_INPUT_QUEUE,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS_PER_ROOM,
  PATCH_RATE_MS,
  ROUND_END_DELAY_MS,
  SELF_BLAST_DAMAGE_SCALE,
  TICK_DT,
  TICK_MS,
  TICK_RATE_HZ,
  applySpread,
  blastEffect,
  createArms,
  getMap,
  seededRng,
  stepInput,
} from "@wire-lock/shared";
import type {
  ArmsState,
  Explosion,
  InputCmd,
  MapDef,
  PlayerMoveState,
  Projectile,
  ProjectileTarget,
  ServerMessages,
  ServerMessageType,
  SpawnPoint,
  Vec3,
  WeaponApi,
  WeaponDef,
} from "@wire-lock/shared";
import { config } from "../config";
import { log } from "../log";
import { ArenaState, PlayerState, ProjectileState, type RoundPhase } from "../schema/ArenaState";
import { resolveHitscan } from "../sim/hitscan";
import { createMode, type GameMode, type ModeRoom } from "../sim/modes";
import { sanitizeName } from "../sim/names";
import { sanitizeInput } from "../sim/validateInput";

const PLAYER_COLORS = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6"];
/** Kills by falling out of the world are credited to this weapon id. */
const WORLD_KILL = "world";

/** Server-only per-player data that isn't synced. */
interface PlayerRuntime {
  queue: InputCmd[];
  /** Highest seq accepted into the queue, to drop duplicates and out-of-order commands. */
  lastQueuedSeq: number;
  /** Tick of the last applied input, for away detection. */
  lastInputTick: number;
}

export class ArenaRoom extends Room<{ state: ArenaState }> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override patchRate = PATCH_RATE_MS;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;

  private map!: MapDef;
  private mode!: GameMode;
  private runtime = new Map<string, PlayerRuntime>();
  private nextColor = 0;
  private nextPlayerNumber = 1;
  private shotSeed = 1;

  override messages = {
    input: (client: Client, payload: unknown) => this.receiveInputs(client, payload),
  };

  override onCreate() {
    const map = getMap(DEFAULT_MAP_ID);
    const mode = createMode(DEFAULT_MODE_ID, config.killLimit ? { scoreLimit: config.killLimit } : {});
    if (!map || !mode) throw new Error(`unknown map ${DEFAULT_MAP_ID} or mode ${DEFAULT_MODE_ID}`);
    this.map = map;
    this.mode = mode;

    this.state = new ArenaState({
      mapId: map.id,
      modeId: mode.def.id,
      scoreLimit: mode.def.scoreLimit ?? 0,
      tick: 0,
      phase: "waiting" satisfies RoundPhase,
      phaseEndTick: 0,
      winner: "",
    });
    // Accumulator-based, so the long-run rate is exactly TICK_RATE_HZ (plain setInterval(33.3) drifts to ~29.4 Hz,
    // which makes client inputs pile up and forces catch-up steps that look like hitches to other players).
    this.setFixedTimestep(() => this.tick(), TICK_RATE_HZ);
    log("room.create", { roomId: this.roomId, map: map.id, mode: mode.def.id, scoreLimit: mode.def.scoreLimit ?? 0 });
  }

  override onJoin(client: Client, options?: { name?: unknown }) {
    const id = client.sessionId;
    const player = new PlayerState({
      name: sanitizeName(options?.name, `Player ${this.nextPlayerNumber++}`),
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length] ?? "#ffffff",
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: false,
      yaw: 0,
      pitch: 0,
      lastProcessedSeq: -1,
      health: 0,
      alive: false,
      away: false,
      respawnTick: 0,
      weapon: "",
      slot: 0,
      cooldownMs: 0,
      reloadMs: 0,
      kills: 0,
      deaths: 0,
    });
    this.state.players.set(id, player);
    this.runtime.set(id, { queue: [], lastQueuedSeq: -1, lastInputTick: this.state.tick });
    this.spawn(id, player);
    this.mode.onPlayerJoin?.(this.modeRoom(), id);
    log("room.join", { roomId: this.roomId, sessionId: id, name: player.name, players: this.state.players.size });
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    this.writeProjectiles(client.sessionId, []);
    log("room.leave", { roomId: this.roomId, sessionId: client.sessionId, players: this.state.players.size });
  }

  override onDispose() {
    log("room.dispose", { roomId: this.roomId });
  }

  // --- Input -------------------------------------------------------------

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

  // --- Simulation --------------------------------------------------------

  private tick() {
    const tick = ++this.state.tick;

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt) return;

      if (!player.away && (tick - rt.lastInputTick) * TICK_MS > AWAY_TIMEOUT_MS) this.goAway(id, player);
      if (!player.alive && !player.away && player.respawnTick > 0 && tick >= player.respawnTick) this.spawn(id, player);

      // Players (and their projectiles) only advance when their inputs arrive, so client prediction replays exactly.
      const count = rt.queue.length > INPUT_BACKLOG ? MAX_INPUTS_PER_TICK : 1;
      for (const cmd of rt.queue.splice(0, count)) this.applyInput(id, player, rt, cmd);

      if (player.alive && player.y < KILL_Y) this.killPlayer(id, null, WORLD_KILL);
    });

    this.mode.onTick?.(this.modeRoom(), TICK_DT);
    this.updateRound();
  }

  private applyInput(id: string, player: PlayerState, rt: PlayerRuntime, cmd: InputCmd) {
    rt.lastInputTick = this.state.tick;
    if (player.away) {
      player.away = false;
      this.spawn(id, player);
      log("player.back", { sessionId: id });
    }

    player.lastProcessedSeq = cmd.seq;
    player.yaw = cmd.yaw;
    player.pitch = cmd.pitch;

    const r = stepInput(
      { move: readMove(player), arms: readArms(player), alive: player.alive },
      this.projectilesOf(id),
      cmd,
      this.map,
      { canFire: this.state.phase !== "ended", targets: this.targetsExcept(id) },
    );
    if (player.alive) {
      writeMove(player, r.sim.move);
      writeArms(player, r.sim.arms);
    }
    this.writeProjectiles(id, r.projectiles);

    if (r.fired) this.onFired(id, r.fired, r.origin, r.aim);
    for (const e of r.explosions) this.explode(id, e);
  }

  private onFired(id: string, weapon: WeaponDef, origin: Vec3, aim: Vec3) {
    const api = this.weaponApi(id, weapon.id);
    weapon.onFire?.({ ...api, shooter: id, weaponId: weapon.id, origin, dir: aim });

    const ends: Vec3[] = [];
    if (weapon.kind === "hitscan") {
      const targets = this.targetsExcept(id);
      const rng = seededRng(this.shotSeed++);
      for (let i = 0; i < (weapon.pellets ?? 1); i++) {
        const dir = applySpread(aim, weapon.spreadRad ?? 0, rng);
        const shot = resolveHitscan(origin, dir, weapon.range ?? 0, this.map.boxes, targets);
        ends.push(shot.end);
        if (shot.target) this.applyHit(id, shot.target, weapon, shot.end, dir, api);
      }
    }
    this.broadcastEvent("fire", { shooter: id, weapon: weapon.id, ends }, this.clients.get(id));
  }

  /**
   * Splash damage and knockback for everyone in range. The owner's own
   * knockback was already applied inside stepInput (so their client predicts it);
   * everything else is decided here.
   */
  private explode(owner: string, e: Explosion) {
    this.broadcastEvent("explode", { owner, shotSeq: e.shotSeq, weapon: e.weapon.id, pos: e.point, tick: this.state.tick });
    const api = this.weaponApi(owner, e.weapon.id);

    const hits: { id: string; damage: number; impulse: Vec3 | null }[] = [];
    this.state.players.forEach((p, pid) => {
      if (!p.alive) return;
      const blast = blastEffect(e.point, { x: p.x, y: p.y, z: p.z }, e.weapon, this.map.boxes);
      const direct = pid === e.direct ? e.weapon.damage : 0;
      if (!blast && !direct) return;
      const splash = (blast?.damage ?? 0) * (pid === owner ? SELF_BLAST_DAMAGE_SCALE : 1);
      hits.push({ id: pid, damage: splash + direct, impulse: pid === owner ? null : (blast?.impulse ?? null) });
    });

    for (const h of hits) {
      if (h.impulse) api.applyImpulse(h.id, h.impulse);
      api.damage(h.id, h.damage);
      if (h.id !== owner) e.weapon.onHit?.({ ...api, shooter: owner, target: h.id, weaponId: e.weapon.id, point: e.point, dir: h.impulse ?? { x: 0, y: 1, z: 0 } });
    }
  }

  private applyHit(shooter: string, target: string, weapon: WeaponDef, point: Vec3, dir: Vec3, api: WeaponApi) {
    if (weapon.damage > 0) api.damage(target, weapon.damage);
    if (weapon.knockback) {
      const k = weapon.knockback;
      api.applyImpulse(target, { x: dir.x * k, y: dir.y * k, z: dir.z * k });
    }
    weapon.onHit?.({ ...api, shooter, target, weaponId: weapon.id, point, dir });
  }

  /** The narrow API weapon hooks get (DESIGN.md §7). */
  private weaponApi(shooter: string, weaponId: string): WeaponApi {
    const players = this.state.players;
    return {
      damage: (target, amount) => this.damage(target, amount, shooter, weaponId),
      applyImpulse: (id, v) => {
        const p = players.get(id);
        if (!p?.alive) return;
        p.vx += v.x;
        p.vy += v.y;
        p.vz += v.z;
        if (v.y > 0) p.onGround = false;
      },
      teleport: (id, pos) => {
        const p = players.get(id);
        if (!p?.alive) return;
        writeMove(p, { pos: { ...pos }, vel: { x: p.vx, y: p.vy, z: p.vz }, onGround: false });
      },
      swapPositions: (a, b) => {
        const pa = players.get(a);
        const pb = players.get(b);
        if (!pa?.alive || !pb?.alive) return;
        const ma = readMove(pa);
        writeMove(pa, readMove(pb));
        writeMove(pb, ma);
      },
      broadcastEffect: (name, data) => this.broadcast("effect", { name, data }),
    };
  }

  private damage(targetId: string, amount: number, attackerId: string, weaponId: string) {
    const target = this.state.players.get(targetId);
    if (!target?.alive || amount <= 0) return;
    target.health = Math.max(0, target.health - Math.round(amount));
    const killed = target.health === 0;
    const attacker = this.clients.get(attackerId);
    if (attacker && attackerId !== targetId) this.sendEvent(attacker, "hit", { target: targetId, damage: amount, killed });
    if (killed) this.killPlayer(targetId, attackerId, weaponId);
  }

  private killPlayer(victimId: string, killerId: string | null, weaponId: string) {
    const victim = this.state.players.get(victimId);
    if (!victim?.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.respawnTick = this.state.tick + Math.ceil(this.mode.def.respawnDelayMs / TICK_MS);

    const killer = killerId ?? victimId;
    if (this.state.phase === "playing") {
      victim.deaths++;
      const k = this.state.players.get(killer);
      if (k && killer !== victimId) k.kills++;
    }
    this.mode.onKill?.(this.modeRoom(), killer, victimId, weaponId);
    this.broadcastEvent("kill", { killer, victim: victimId, weapon: weaponId });
  }

  private goAway(id: string, player: PlayerState) {
    player.away = true;
    player.alive = false;
    player.respawnTick = 0;
    // Their projectiles only advance on their inputs, so they'd hang in the air: remove them.
    this.writeProjectiles(id, []);
    log("player.away", { sessionId: id });
  }

  private spawn(id: string, player: PlayerState) {
    const spawn: SpawnPoint = this.mode.pickSpawn(this.modeRoom(), id);
    writeMove(player, { pos: { ...spawn.pos }, vel: { x: 0, y: 0, z: 0 }, onGround: false });
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.health = MAX_HEALTH;
    player.alive = true;
    player.respawnTick = 0;
    writeArms(player, createArms(this.mode.loadout(this.modeRoom(), id)));
  }

  // --- Projectiles -------------------------------------------------------

  private projectilesOf(owner: string): Projectile[] {
    const out: Projectile[] = [];
    this.state.projectiles.forEach((p) => {
      if (p.owner !== owner) return;
      out.push({
        shotSeq: p.shotSeq,
        weapon: p.weapon,
        pos: { x: p.x, y: p.y, z: p.z },
        vel: { x: p.vx, y: p.vy, z: p.vz },
        ageMs: p.ageMs,
      });
    });
    return out.sort((a, b) => a.shotSeq - b.shotSeq);
  }

  /** Replaces the owner's projectiles in synced state with `list`. */
  private writeProjectiles(owner: string, list: readonly Projectile[]) {
    const keep = new Set(list.map((p) => projectileKey(owner, p.shotSeq)));
    const stale: string[] = [];
    this.state.projectiles.forEach((p, key) => {
      if (p.owner === owner && !keep.has(key)) stale.push(key);
    });
    for (const key of stale) this.state.projectiles.delete(key);

    for (const p of list) {
      const key = projectileKey(owner, p.shotSeq);
      let s = this.state.projectiles.get(key);
      if (!s) {
        s = new ProjectileState({ owner, weapon: p.weapon, shotSeq: p.shotSeq, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ageMs: 0 });
        this.state.projectiles.set(key, s);
      }
      s.x = p.pos.x;
      s.y = p.pos.y;
      s.z = p.pos.z;
      s.vx = p.vel.x;
      s.vy = p.vel.y;
      s.vz = p.vel.z;
      s.ageMs = p.ageMs;
    }
  }

  private targetsExcept(id: string): ProjectileTarget[] {
    const targets: ProjectileTarget[] = [];
    this.state.players.forEach((p, pid) => {
      if (pid !== id && p.alive) targets.push({ id: pid, pos: { x: p.x, y: p.y, z: p.z } });
    });
    return targets;
  }

  // --- Rounds ------------------------------------------------------------

  private updateRound() {
    const s = this.state;
    const enough = this.activePlayerCount() >= this.mode.def.minPlayers;

    switch (s.phase as RoundPhase) {
      case "waiting":
        if (enough) this.startRound();
        break;
      case "playing": {
        if (!enough) {
          s.phase = "waiting";
          s.phaseEndTick = 0;
          break;
        }
        const result = this.mode.checkWin(this.modeRoom());
        if (result) this.endRound(result.winner ?? "");
        break;
      }
      case "ended":
        if (s.tick >= s.phaseEndTick) {
          if (enough) this.startRound();
          else {
            s.phase = "waiting";
            s.phaseEndTick = 0;
            s.winner = "";
          }
        }
        break;
    }
  }

  private startRound() {
    const s = this.state;
    s.phase = "playing";
    s.winner = "";
    const roundTime = this.mode.def.roundTimeSec;
    s.phaseEndTick = roundTime ? s.tick + Math.round(roundTime * TICK_RATE_HZ) : 0;
    s.projectiles.clear();
    s.players.forEach((p, id) => {
      p.kills = 0;
      p.deaths = 0;
      if (!p.away) this.spawn(id, p);
    });
    this.broadcastEvent("roundStart", {});
    log("round.start", { roomId: this.roomId, players: this.activePlayerCount() });
  }

  private endRound(winner: string) {
    const s = this.state;
    s.phase = "ended";
    s.winner = winner;
    s.phaseEndTick = s.tick + Math.round(ROUND_END_DELAY_MS / TICK_MS);
    this.broadcastEvent("roundEnd", { winner });
    log("round.end", { roomId: this.roomId, winner: winner || "draw" });
  }

  private activePlayerCount(): number {
    let n = 0;
    this.state.players.forEach((p) => {
      if (!p.away) n++;
    });
    return n;
  }

  private modeRoom(): ModeRoom {
    const players: ModeRoom["players"][number][] = [];
    this.state.players.forEach((p, id) => {
      if (!p.away) players.push({ id, kills: p.kills, deaths: p.deaths, alive: p.alive, pos: { x: p.x, y: p.y, z: p.z } });
    });
    const s = this.state;
    return { map: this.map, players, timeUp: s.phaseEndTick > 0 && s.tick >= s.phaseEndTick };
  }

  // --- Messaging ---------------------------------------------------------

  private broadcastEvent<K extends ServerMessageType>(type: K, data: ServerMessages[K], except?: Client) {
    this.broadcast(type, data, except ? { except } : undefined);
  }

  private sendEvent<K extends ServerMessageType>(client: Client, type: K, data: ServerMessages[K]) {
    client.send(type, data);
  }
}

function projectileKey(owner: string, shotSeq: number): string {
  return `${owner}:${shotSeq}`;
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

function readArms(p: PlayerState): ArmsState {
  return {
    slots: p.weapons.toArray(),
    current: p.slot,
    ammo: p.ammo.toArray(),
    cooldownMs: p.cooldownMs,
    reloadMs: p.reloadMs,
  };
}

function writeArms(p: PlayerState, a: ArmsState) {
  if (p.weapons.length !== a.slots.length || a.slots.some((w, i) => p.weapons[i] !== w)) {
    p.weapons.clear();
    p.weapons.push(...a.slots);
  }
  if (p.ammo.length !== a.ammo.length) {
    p.ammo.clear();
    p.ammo.push(...a.ammo);
  } else {
    a.ammo.forEach((n, i) => {
      if (p.ammo[i] !== n) p.ammo[i] = n;
    });
  }
  p.slot = a.current;
  p.cooldownMs = a.cooldownMs;
  p.reloadMs = a.reloadMs;
  p.weapon = a.slots[a.current] ?? "";
}
