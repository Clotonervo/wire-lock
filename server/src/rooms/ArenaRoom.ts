import { Room, ServerError, type Client } from "@colyseus/core";
import {
  AFTERBURN_MS,
  AFTERBURN_PULSES,
  AWAY_TIMEOUT_MS,
  DEFAULT_MAP_ID,
  HEALTH_PACK_HEAL,
  HEADSHOT_FROM,
  DEFAULT_MODE_ID,
  MAX_ROOMS,
  MODES,
  INPUT_BACKLOG,
  KILL_Y,
  MAX_REWIRES_PER_ROUND,
  MAX_INPUTS_PER_TICK,
  MAX_INPUT_BATCH,
  MAX_INPUT_QUEUE,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS_PER_ROOM,
  PATCH_RATE_MS,
  PAUSE_TIMEOUT_MS,
  PICKUP_HEIGHT,
  PICKUP_RADIUS,
  PICKUP_RESPAWN_MS,
  PLAYER_HEIGHT,
  REGEN_DELAY_MS,
  REWIRES,
  RICOCHET_DAMAGE_MUL,
  REWIRE_DEATHS_PER_PICK,
  REWIRE_STREAK_KILLS,
  ROUND_END_DELAY_MS,
  SELF_BLAST_DAMAGE_SCALE,
  TICK_DT,
  TICK_MS,
  TICK_RATE_HZ,
  applySpread,
  blastEffect,
  createArms,
  foldMods,
  getMap,
  getRewire,
  getWeapon,
  magazineSize,
  maxHealth,
  rayBoxesHit,
  reflect,
  rollOffer,
  shotPattern,
  stacksOf,
  seededRng,
  stepInput,
} from "@wire-lock/shared";
import type {
  ArmsState,
  Explosion,
  InputCmd,
  MapDef,
  PlayerMods,
  PlayerMoveState,
  RewireApi,
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
import { playerJoined, playerLeft, recordTick } from "../metrics";
import { ArenaState, PickupState, PlayerState, ProjectileState, type RoundPhase } from "../schema/ArenaState";
import { scaleDamage } from "../sim/damage";
import { resolveHitscan } from "../sim/hitscan";
import { PositionHistory, rewindTime } from "../sim/lagCompensation";
import { createMode, type GameMode, type ModeApi, type ModeRoom } from "../sim/modes";
import { sanitizeName } from "../sim/names";
import { sanitizeInput } from "../sim/validateInput";
import { activeRoomCount, claimRoomCode, releaseRoomCode } from "./roomCodes";

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
  /** Kills since this player last died, for streak-banked Rewire picks. */
  streak: number;
  /** Picks banked by streaks, handed out at the next death. */
  banked: number;
  /** Tick this player last took damage (Regenerator waits after it). */
  lastDamagedTick: number;
  /** Regenerator's fractional HP, carried between ticks. */
  regenAcc: number;
  /** Second Wind saves used this life. */
  secondWindsUsed: number;
  /** Afterburn currently on this player. */
  burn: { attacker: string; pulsesLeft: number; perPulse: number; nextTick: number } | null;
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
  /** Tick each taken pickup comes back, by pickup key. */
  private pickupRespawn = new Map<string, number>();
  /** Round time left when the round was paused, in ticks (0 = untimed). */
  private pausedRemainingTicks = 0;
  private readonly history = new PositionHistory();

  override messages = {
    input: (client: Client, payload: unknown) => this.receiveInputs(client, payload),
    pickRewire: (client: Client, payload: unknown) => this.pickRewire(client.sessionId, payload),
  };

  override async onCreate(options?: { mode?: unknown; map?: unknown }) {
    if (activeRoomCount() >= MAX_ROOMS) throw new ServerError(503, "The server is full right now. Try again in a bit.");
    // Rooms are code-only (DESIGN.md §13): a short code instead of Colyseus's id, and never matched at random.
    this.roomId = claimRoomCode();
    await this.setPrivate(true);

    const requested = typeof options?.mode === "string" && options.mode in MODES ? options.mode : DEFAULT_MODE_ID;
    const map = (typeof options?.map === "string" ? getMap(options.map) : undefined) ?? getMap(DEFAULT_MAP_ID);
    const mode = createMode(requested, config.killLimit ? { scoreLimit: config.killLimit } : {});
    if (!map || !mode) throw new Error(`unknown map ${DEFAULT_MAP_ID} or mode ${requested}`);
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
    (map.pickups ?? []).forEach((p, i) => {
      this.state.pickups.set(String(i), new PickupState({ kind: p.kind, x: p.pos.x, y: p.pos.y, z: p.pos.z, active: true }));
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
      airJumpsUsed: 0,
      jumpHeld: false,
      dashCooldownMs: 0,
      altHeld: false,
      boostMs: 0,
      burning: false,
      yaw: 0,
      pitch: 0,
      lastProcessedSeq: -1,
      health: 0,
      maxHealth: 0,
      pendingPicks: 0,
      alive: false,
      away: false,
      respawnTick: 0,
      weapon: "",
      slot: 0,
      cooldownMs: 0,
      reloadMs: 0,
      kills: 0,
      deaths: 0,
      lives: -1,
      eliminated: false,
    });
    this.state.players.set(id, player);
    this.runtime.set(id, {
      queue: [],
      lastQueuedSeq: -1,
      lastInputTick: this.state.tick,
      streak: 0,
      banked: 0,
      lastDamagedTick: 0,
      regenAcc: 0,
      secondWindsUsed: 0,
      burn: null,
    });
    if (this.rewiresActive()) {
      // Joining mid-round with Rewires: take the starting pick before the first spawn.
      player.respawnTick = this.state.tick;
      this.grantPicks(player, 1);
    } else {
      this.spawn(id, player);
    }
    this.mode.onPlayerJoin?.(this.modeRoom(), id);
    playerJoined();
    log("room.join", { roomId: this.roomId, sessionId: id, name: player.name, players: this.state.players.size });
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    playerLeft();
    this.runtime.delete(client.sessionId);
    this.history.remove(client.sessionId);
    this.writeProjectiles(client.sessionId, []);
    log("room.leave", { roomId: this.roomId, sessionId: client.sessionId, players: this.state.players.size });
  }

  override onDispose() {
    releaseRoomCode(this.roomId);
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
    const started = performance.now();
    this.simulate();
    recordTick(performance.now() - started);
  }

  private simulate() {
    const tick = ++this.state.tick;

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt) return;

      if (!player.away && (tick - rt.lastInputTick) * TICK_MS > AWAY_TIMEOUT_MS) this.goAway(id, player);
      // Spawning waits for both the respawn timer and any Rewire picks owed (DESIGN.md §8b.1).
      const ready = player.respawnTick > 0 && tick >= player.respawnTick && player.pendingPicks === 0;
      if (!player.alive && !player.away && !player.eliminated && ready) {
        this.spawn(id, player);
      }

      // Players (and their projectiles) only advance when their inputs arrive, so client prediction replays exactly.
      const count = rt.queue.length > INPUT_BACKLOG ? MAX_INPUTS_PER_TICK : 1;
      for (const cmd of rt.queue.splice(0, count)) this.applyInput(id, player, rt, cmd);

      if (player.alive && player.y < KILL_Y) this.killPlayer(id, null, WORLD_KILL);
      this.tickRewireEffects(id, player, rt);
    });

    this.tickPickups();
    this.mode.onTick?.(this.modeRoom(), TICK_DT);
    this.updateRound();

    // Remember where everyone ended this tick (what clients will be shown), for lag compensation.
    this.state.players.forEach((p, id) => this.history.record(tick, id, { x: p.x, y: p.y, z: p.z }, p.alive));
  }

  private applyInput(id: string, player: PlayerState, rt: PlayerRuntime, cmd: InputCmd) {
    rt.lastInputTick = this.state.tick;
    if (player.away) {
      player.away = false;
      if (!player.eliminated) {
        if (player.pendingPicks > 0) player.respawnTick = this.state.tick;
        else this.spawn(id, player);
      }
      log("player.back", { sessionId: id });
    }

    player.lastProcessedSeq = cmd.seq;
    player.yaw = cmd.yaw;
    player.pitch = cmd.pitch;

    const r = stepInput(
      { move: readMove(player), arms: readArms(player), alive: player.alive, mods: this.modsOf(player) },
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

    if (r.fired) this.onFired(id, r.fired, r.origin, r.aim, cmd.viewTime, r.sim.mods);
    for (const e of r.explosions) this.explode(id, e);
  }

  private onFired(id: string, weapon: WeaponDef, origin: Vec3, aim: Vec3, viewTime: number | undefined, mods: PlayerMods | undefined) {
    const api = this.weaponApi(id, weapon.id);
    weapon.onFire?.({ ...api, shooter: id, weaponId: weapon.id, origin, dir: aim });

    const ends: Vec3[] = [];
    const bounces: { from: Vec3; to: Vec3 }[] = [];
    if (weapon.kind !== "projectile") {
      const targets = this.hitscanTargets(id, viewTime);
      const posOf = (pid: string) => targets.find((t) => t.id === pid)?.pos;
      const rng = seededRng(this.shotSeed++);
      const pattern = shotPattern(weapon, mods);
      const assist = mods?.aimAssistRad ?? 0;
      const range = weapon.range ?? 0;
      for (let i = 0; i < pattern.count; i++) {
        const dir = applySpread(aim, pattern.spread, rng);
        const shot = resolveHitscan(origin, dir, range, this.map.boxes, targets, assist);
        if (weapon.kind === "hitscan") ends.push(shot.end); // melee has no tracer
        if (shot.target) {
          this.applyHit(id, shot.target, weapon, shot.end, dir, api, 1, posOf(shot.target));
          continue;
        }
        // Ricochet: a bullet that hit a wall bounces once and carries on with what's left of its range.
        if (weapon.kind !== "hitscan" || !mods?.ricochets) continue;
        const wall = rayBoxesHit(origin, dir, this.map.boxes, range);
        if (!wall.normal) continue;
        const from = { x: shot.end.x + wall.normal.x * 0.01, y: shot.end.y + wall.normal.y * 0.01, z: shot.end.z + wall.normal.z * 0.01 };
        const out = reflect(dir, wall.normal);
        const second = resolveHitscan(from, out, range - wall.dist, this.map.boxes, targets, assist);
        bounces.push({ from, to: second.end });
        if (second.target) this.applyHit(id, second.target, weapon, second.end, out, api, RICOCHET_DAMAGE_MUL, posOf(second.target));
      }
    }
    this.broadcastEvent("fire", { shooter: id, weapon: weapon.id, ends, ...(bounces.length ? { bounces } : {}) }, this.clients.get(id));
  }

  /**
   * Splash damage and knockback for everyone in range. The owner's own
   * knockback was already applied inside stepInput (so their client predicts it);
   * everything else is decided here.
   */
  private explode(owner: string, e: Explosion) {
    this.broadcastEvent("explode", { owner, shotSeq: e.shotSeq, sub: e.sub, weapon: e.weapon.id, pos: e.point, tick: this.state.tick });
    const ownerPlayer = this.state.players.get(owner);
    const selfScale = SELF_BLAST_DAMAGE_SCALE * (ownerPlayer ? this.modsOf(ownerPlayer).selfBlastDamageMul : 1);
    const api = this.weaponApi(owner, e.weapon.id);

    const hits: { id: string; damage: number; impulse: Vec3 | null }[] = [];
    this.state.players.forEach((p, pid) => {
      if (!p.alive) return;
      const radiusMul = ownerPlayer ? this.modsOf(ownerPlayer).splashRadiusMul : 1;
      const blast = blastEffect(e.point, { x: p.x, y: p.y, z: p.z }, e.weapon, this.map.boxes, radiusMul);
      const direct = pid === e.direct ? e.weapon.damage : 0;
      if (!blast && !direct) return;
      const splash = (blast?.damage ?? 0) * (pid === owner ? selfScale : 1);
      hits.push({ id: pid, damage: splash + direct, impulse: pid === owner ? null : (blast?.impulse ?? null) });
    });

    for (const h of hits) {
      if (h.impulse) api.applyImpulse(h.id, h.impulse);
      api.damage(h.id, h.damage);
      if (h.id !== owner) e.weapon.onHit?.({ ...api, shooter: owner, target: h.id, weaponId: e.weapon.id, point: e.point, dir: h.impulse ?? { x: 0, y: 1, z: 0 } });
    }
  }

  private applyHit(
    shooter: string,
    target: string,
    weapon: WeaponDef,
    point: Vec3,
    dir: Vec3,
    api: WeaponApi,
    damageScale = 1,
    targetPos?: Vec3,
  ) {
    // Headshot: the hit landed in the top of the body (at the position the shooter saw).
    const headshot = !!targetPos && point.y >= targetPos.y + PLAYER_HEIGHT * HEADSHOT_FROM;
    if (weapon.damage > 0) this.damage(target, weapon.damage * damageScale, shooter, weapon.id, { headshot });
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

  /**
   * All damage goes through here. Rewire modifiers (DESIGN.md §8b): the attacker's
   * damage, headshot, range and execute bonuses and Afterburn; the target's
   * Thick Skin and Second Wind.
   */
  private damage(targetId: string, amount: number, attackerId: string, weaponId: string, info: { headshot?: boolean; burn?: boolean } = {}) {
    const target = this.state.players.get(targetId);
    if (!target?.alive || amount <= 0) return;
    const trt = this.runtime.get(targetId);
    const attackerPlayer = attackerId !== targetId ? this.state.players.get(attackerId) : undefined;
    const am = attackerPlayer ? this.modsOf(attackerPlayer) : null;
    const tm = this.modsOf(target);
    const dist = attackerPlayer ? Math.hypot(attackerPlayer.x - target.x, attackerPlayer.y - target.y, attackerPlayer.z - target.z) : 0;
    amount = scaleDamage(amount, am, tm, { dist, headshot: !!info.headshot, targetHealth: target.health, targetMaxHealth: target.maxHealth });
    if (am && am.afterburnDamage > 0 && !info.burn) this.ignite(targetId, attackerId, am.afterburnDamage);

    let health = target.health - Math.round(amount);
    if (trt) trt.lastDamagedTick = this.state.tick;
    if (health <= 0 && trt && trt.secondWindsUsed < tm.secondWinds) {
      trt.secondWindsUsed++;
      health = 1;
      this.broadcastEvent("secondWind", { player: targetId });
    }
    target.health = Math.max(0, health);
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
    this.extinguish(victimId);

    const killer = killerId ?? victimId;
    const k = this.state.players.get(killer);
    if (this.state.phase === "playing") {
      victim.deaths++;
      if (k && killer !== victimId) k.kills++;
    }
    this.mode.onKill?.(this.modeRoom(), killer, victimId, weaponId);
    this.broadcastEvent("kill", { killer, victim: victimId, weapon: weaponId });
    if (this.rewiresActive()) this.rewiresOnKill(victimId, victim, killer !== victimId ? killer : null);

    // Rewire hooks: the killer's (e.g. Vampire), then the victim's (e.g. Dead Man's Switch).
    const pos = { x: victim.x, y: victim.y, z: victim.z };
    if (k && killer !== victimId) for (const r of k.rewires) getRewire(r)?.onKill?.({ ...this.rewireApi, killer, victim: victimId });
    for (const r of victim.rewires) getRewire(r)?.onDeath?.({ ...this.rewireApi, victim: victimId, pos });
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
    const mods = this.modsOf(player);
    const rt = this.runtime.get(id);
    if (rt) {
      rt.secondWindsUsed = 0;
      rt.regenAcc = 0;
    }
    this.extinguish(id);
    player.maxHealth = maxHealth(mods);
    player.health = player.maxHealth;
    player.alive = true;
    player.respawnTick = 0;
    writeArms(player, createArms(this.mode.loadout(this.modeRoom(), id), mods));
  }

  // --- Projectiles -------------------------------------------------------

  private projectilesOf(owner: string): Projectile[] {
    const out: Projectile[] = [];
    this.state.projectiles.forEach((p) => {
      if (p.owner !== owner) return;
      out.push({
        shotSeq: p.shotSeq,
        sub: p.sub,
        weapon: p.weapon,
        pos: { x: p.x, y: p.y, z: p.z },
        vel: { x: p.vx, y: p.vy, z: p.vz },
        ageMs: p.ageMs,
      });
    });
    return out.sort((a, b) => a.shotSeq - b.shotSeq || (a.sub ?? 0) - (b.sub ?? 0));
  }

  /** Replaces the owner's projectiles in synced state with `list`. */
  private writeProjectiles(owner: string, list: readonly Projectile[]) {
    const keep = new Set(list.map((p) => projectileKey(owner, p)));
    const stale: string[] = [];
    this.state.projectiles.forEach((p, key) => {
      if (p.owner === owner && !keep.has(key)) stale.push(key);
    });
    for (const key of stale) this.state.projectiles.delete(key);

    for (const p of list) {
      const key = projectileKey(owner, p);
      let s = this.state.projectiles.get(key);
      if (!s) {
        s = new ProjectileState({ owner, weapon: p.weapon, shotSeq: p.shotSeq, sub: p.sub ?? 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ageMs: 0 });
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

  /**
   * Who a hitscan or melee shot can hit, and where: with lag compensation, each
   * living target is rewound to where the shooter saw them (DESIGN.md §5.5).
   */
  private hitscanTargets(shooter: string, viewTime: number | undefined): ProjectileTarget[] {
    if (!config.lagCompensation) return this.targetsExcept(shooter);
    const t = rewindTime(viewTime, this.state.tick * TICK_MS);
    const targets: ProjectileTarget[] = [];
    this.state.players.forEach((p, pid) => {
      if (pid === shooter || !p.alive) return;
      const pos = this.history.at(pid, t);
      if (pos) targets.push({ id: pid, pos });
    });
    return targets;
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
          this.pauseRound();
          break;
        }
        const result = this.mode.checkWin(this.modeRoom());
        if (result) this.endRound(result.winner ?? "");
        break;
      }
      case "paused":
        if (enough) this.resumeRound();
        else if (s.tick >= s.phaseEndTick) this.enterWarmup();
        break;
      case "ended":
        if (s.tick >= s.phaseEndTick) {
          if (enough) this.startRound();
          else this.enterWarmup();
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
    s.pickups.forEach((p) => (p.active = true));
    this.pickupRespawn.clear();
    const draft = !!this.mode.def.rewires;
    s.players.forEach((p, id) => {
      p.kills = 0;
      p.deaths = 0;
      p.lives = -1;
      p.eliminated = false;
      this.clearRewires(id, p);
      if (p.away) return;
      if (draft) {
        // The round-start draft: everyone picks a Rewire, then spawns (DESIGN.md §8b.1).
        for (const r of config.testRewires) if (getRewire(r)) p.rewires.push(r);
        p.alive = false;
        p.health = 0;
        p.respawnTick = s.tick;
        this.grantPicks(p, 1);
      } else {
        this.spawn(id, p);
      }
    });
    this.mode.onRoundStart?.(this.modeRoom());
    this.broadcastEvent("roundStart", {});
    log("round.start", { roomId: this.roomId, players: this.activePlayerCount() });
  }

  /**
   * Someone left or went away mid-round: freeze the round (timer, scores, lives) and wait
   * up to PAUSE_TIMEOUT_MS for enough players to come back, instead of throwing it away.
   */
  private pauseRound() {
    const s = this.state;
    this.pausedRemainingTicks = s.phaseEndTick > 0 ? Math.max(1, s.phaseEndTick - s.tick) : 0;
    s.phase = "paused";
    s.phaseEndTick = s.tick + Math.round(PAUSE_TIMEOUT_MS / TICK_MS);
    log("round.pause", { roomId: this.roomId, players: this.activePlayerCount() });
  }

  private resumeRound() {
    const s = this.state;
    s.phase = "playing";
    s.phaseEndTick = this.pausedRemainingTicks > 0 ? s.tick + this.pausedRemainingTicks : 0;
    log("round.resume", { roomId: this.roomId, players: this.activePlayerCount() });
  }

  /** Back to warm-up (not enough players): nobody stays eliminated, so everyone can play meanwhile. */
  private enterWarmup() {
    const s = this.state;
    s.phase = "waiting";
    s.phaseEndTick = 0;
    s.winner = "";
    s.players.forEach((p) => {
      // Rewires aren't earned in warm-up: drop owed picks so nobody's stuck waiting to spawn.
      p.pendingPicks = 0;
      p.offer.clear();
      if (!p.alive && !p.away && p.respawnTick === 0) p.respawnTick = s.tick + 1;
      if (!p.eliminated) return;
      p.eliminated = false;
      p.respawnTick = s.tick + 1;
    });
  }

  // --- Rewires (DESIGN.md §8b) -------------------------------------------

  private rewiresActive(): boolean {
    return !!this.mode.def.rewires && this.state.phase === "playing";
  }

  private modsOf(p: PlayerState): PlayerMods {
    return foldMods(p.rewires.toArray());
  }

  private clearRewires(id: string, p: PlayerState) {
    p.rewires.clear();
    p.offer.clear();
    p.pendingPicks = 0;
    const rt = this.runtime.get(id);
    if (rt) {
      rt.streak = 0;
      rt.banked = 0;
    }
  }

  /** Room left under the per-round cap, counting owned, owed and banked picks. */
  private rewireRoom(p: PlayerState, banked = 0): number {
    return Math.max(0, MAX_REWIRES_PER_ROUND - p.rewires.length - p.pendingPicks - banked);
  }

  private grantPicks(p: PlayerState, n: number) {
    p.pendingPicks += Math.min(n, this.rewireRoom(p));
    this.ensureOffer(p);
  }

  /** Rolls the next 1-of-3 offer if picks are owed and none is showing. */
  private ensureOffer(p: PlayerState) {
    if (p.pendingPicks === 0 || p.offer.length > 0) return;
    const offer = rollOffer(p.rewires.toArray(), seededRng(Math.floor(Math.random() * 2 ** 32)));
    if (offer.length === 0) p.pendingPicks = 0; // nothing left to offer: don't block spawning
    else p.offer.push(...offer);
  }

  private pickRewire(id: string, payload: unknown) {
    const p = this.state.players.get(id);
    const choice = (payload as { id?: unknown } | null)?.id;
    if (!p || typeof choice !== "string" || p.pendingPicks === 0 || !p.offer.includes(choice)) return;
    p.rewires.push(choice);
    p.offer.clear();
    p.pendingPicks--;
    getRewire(choice)?.onPick?.({ ...this.rewireApi, player: id });
    this.ensureOffer(p);
    log("rewire.pick", { sessionId: id, rewire: choice, owned: p.rewires.length });
  }

  /** A pick every REWIRE_DEATHS_PER_PICK deaths plus anything banked; streaks bank picks for the killer. */
  private rewiresOnKill(victimId: string, victim: PlayerState, killerId: string | null) {
    const vrt = this.runtime.get(victimId);
    const earned = victim.deaths % REWIRE_DEATHS_PER_PICK === 0 ? 1 : 0;
    this.grantPicks(victim, earned + (vrt?.banked ?? 0));
    if (vrt) {
      vrt.banked = 0;
      vrt.streak = 0;
    }

    const killer = killerId ? this.state.players.get(killerId) : undefined;
    const krt = killerId ? this.runtime.get(killerId) : undefined;
    if (!killer || !krt || !killerId) return;
    krt.streak++;
    if (krt.streak % REWIRE_STREAK_KILLS === 0) {
      if (this.rewireRoom(killer, krt.banked) > 0) krt.banked++;
      this.broadcastEvent("streak", { player: killerId, kills: krt.streak });
    }
  }

  /** Health packs: heal whoever touches one (if hurt), then respawn it later. */
  private tickPickups() {
    const tick = this.state.tick;
    this.state.pickups.forEach((pickup, key) => {
      if (!pickup.active) {
        if (tick >= (this.pickupRespawn.get(key) ?? 0)) pickup.active = true;
        return;
      }
      for (const [id, p] of this.state.players) {
        if (!p.alive || p.health >= p.maxHealth) continue;
        const dy = p.y - pickup.y;
        if (Math.hypot(p.x - pickup.x, p.z - pickup.z) > PICKUP_RADIUS || dy < -0.5 || dy > PICKUP_HEIGHT) continue;
        p.health = Math.min(p.maxHealth, p.health + HEALTH_PACK_HEAL);
        pickup.active = false;
        this.pickupRespawn.set(key, tick + Math.round(PICKUP_RESPAWN_MS / TICK_MS));
        this.broadcastEvent("pickup", { player: id, kind: pickup.kind, pos: { x: pickup.x, y: pickup.y, z: pickup.z } });
        break;
      }
    });
  }

  /** Afterburn: set `target` burning (refreshing any burn already on them). */
  private ignite(target: string, attacker: string, total: number) {
    const rt = this.runtime.get(target);
    const p = this.state.players.get(target);
    if (!rt || !p?.alive) return;
    const interval = Math.round(AFTERBURN_MS / AFTERBURN_PULSES / TICK_MS);
    rt.burn = { attacker, pulsesLeft: AFTERBURN_PULSES, perPulse: total / AFTERBURN_PULSES, nextTick: this.state.tick + interval };
    p.burning = true;
  }

  private extinguish(id: string) {
    const rt = this.runtime.get(id);
    if (rt) rt.burn = null;
    const p = this.state.players.get(id);
    if (p) p.burning = false;
  }

  /** Effects that run every tick: Afterburn pulses and Regenerator. */
  private tickRewireEffects(id: string, p: PlayerState, rt: PlayerRuntime) {
    const tick = this.state.tick;
    if (rt.burn && tick >= rt.burn.nextTick) {
      const burn = rt.burn;
      burn.pulsesLeft--;
      burn.nextTick += Math.round(AFTERBURN_MS / AFTERBURN_PULSES / TICK_MS);
      if (burn.pulsesLeft <= 0) this.extinguish(id);
      this.damage(id, burn.perPulse, burn.attacker, "afterburn", { burn: true });
    }
    if (!p.alive) return;
    const regen = this.modsOf(p).regenPerSec;
    if (regen > 0 && p.health < p.maxHealth && (tick - rt.lastDamagedTick) * TICK_MS >= REGEN_DELAY_MS) {
      rt.regenAcc += regen * TICK_DT;
      const whole = Math.floor(rt.regenAcc);
      if (whole > 0) {
        rt.regenAcc -= whole;
        p.health = Math.min(p.maxHealth, p.health + whole);
      }
    }
  }

  /** The narrow API Rewire hooks get. */
  private readonly rewireApi: RewireApi = {
    heal: (id, amount) => {
      const p = this.state.players.get(id);
      if (p?.alive) p.health = Math.min(p.maxHealth, p.health + amount);
    },
    refillMagazine: (id) => {
      const p = this.state.players.get(id);
      const weapon = p && getWeapon(p.weapons[p.slot] ?? "");
      const mag = p && weapon && magazineSize(weapon, this.modsOf(p));
      if (!p?.alive || mag === undefined || !mag) return;
      p.ammo[p.slot] = mag;
      p.reloadMs = 0;
    },
    boost: (id, ms) => {
      const p = this.state.players.get(id);
      if (p?.alive) p.boostMs = ms;
    },
    copyRewire: (to, from) => {
      const p = this.state.players.get(to);
      const src = this.state.players.get(from);
      if (!p || !src || this.rewireRoom(p) === 0) return;
      const owned = p.rewires.toArray();
      const candidates = src.rewires.toArray().filter((r) => stacksOf(owned, r) < (getRewire(r)?.maxStacks ?? 1));
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      p.rewires.push(pick);
      this.broadcastEvent("copied", { player: to, from, rewire: pick });
    },
    grantRandom: (id, count) => {
      const p = this.state.players.get(id);
      if (!p) return;
      for (let i = 0; i < count && this.rewireRoom(p) > 0; i++) {
        const owned = p.rewires.toArray();
        // Anything but another Gambler (no chains), uniformly: "could be anything".
        const pool = Object.values(REWIRES).filter((r) => !r.onPick && stacksOf(owned, r.id) < (r.maxStacks ?? 1));
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick) p.rewires.push(pick.id);
      }
    },
    random: () => Math.random(),
    explode: (owner, at, weaponId) => {
      const weapon = getWeapon(weaponId);
      if (weapon) this.explode(owner, { shotSeq: -1, sub: 0, weapon, point: { ...at }, direct: null });
    },
  };

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
      if (p.away) return;
      players.push({
        id,
        kills: p.kills,
        deaths: p.deaths,
        alive: p.alive,
        lives: p.lives,
        eliminated: p.eliminated,
        pos: { x: p.x, y: p.y, z: p.z },
      });
    });
    const s = this.state;
    return {
      map: this.map,
      phase: s.phase as RoundPhase,
      players,
      timeUp: s.phaseEndTick > 0 && s.tick >= s.phaseEndTick,
      api: this.modeApi,
    };
  }

  /** What modes may change (DESIGN.md §8). */
  private readonly modeApi: ModeApi = {
    setLoadout: (id, weapons) => {
      const p = this.state.players.get(id);
      if (!p?.alive) return;
      const same = p.weapons.length === weapons.length && weapons.every((w, i) => p.weapons[i] === w);
      if (!same) writeArms(p, createArms(weapons, this.modsOf(p)));
    },
    addAmmo: (id, weaponId, amount) => {
      const p = this.state.players.get(id);
      const slot = p?.weapons.indexOf(weaponId) ?? -1;
      if (!p || slot < 0) return;
      p.ammo[slot] = Math.max(0, p.ammo[slot] ?? 0) + amount;
    },
    setKills: (id, kills) => {
      const p = this.state.players.get(id);
      if (p) p.kills = Math.max(0, kills);
    },
    setLives: (id, lives) => {
      const p = this.state.players.get(id);
      if (p) p.lives = lives;
    },
    eliminate: (id) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.eliminated = true;
      p.alive = false;
      p.health = 0;
      p.respawnTick = 0;
    },
  };

  // --- Messaging ---------------------------------------------------------

  private broadcastEvent<K extends ServerMessageType>(type: K, data: ServerMessages[K], except?: Client) {
    this.broadcast(type, data, except ? { except } : undefined);
  }

  private sendEvent<K extends ServerMessageType>(client: Client, type: K, data: ServerMessages[K]) {
    client.send(type, data);
  }
}

function projectileKey(owner: string, p: Projectile): string {
  return `${owner}:${p.shotSeq}:${p.sub ?? 0}`;
}

function readMove(p: PlayerState): PlayerMoveState {
  return {
    pos: { x: p.x, y: p.y, z: p.z },
    vel: { x: p.vx, y: p.vy, z: p.vz },
    onGround: p.onGround,
    airJumpsUsed: p.airJumpsUsed,
    jumpHeld: p.jumpHeld,
    dashCooldownMs: p.dashCooldownMs,
    altHeld: p.altHeld,
    boostMs: p.boostMs,
  };
}

function writeMove(p: PlayerState, m: PlayerMoveState) {
  p.x = m.pos.x;
  p.y = m.pos.y;
  p.z = m.pos.z;
  p.vx = m.vel.x;
  p.vy = m.vel.y;
  p.vz = m.vel.z;
  p.onGround = m.onGround;
  p.airJumpsUsed = m.airJumpsUsed ?? 0;
  p.jumpHeld = m.jumpHeld ?? false;
  p.dashCooldownMs = m.dashCooldownMs ?? 0;
  p.altHeld = m.altHeld ?? false;
  p.boostMs = m.boostMs ?? 0;
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
