import type { Vec3 } from "@wire-lock/shared";

export type SoundName =
  | "pistol"
  | "shotgun"
  | "rocket"
  | "explosion"
  | "hit"
  | "kill"
  | "hurt"
  | "reload"
  | "switch"
  | "melee"
  | "heal"
  | "pad"
  | "weaponPickup";

const MUTE_KEY = "wire-lock.muted";
const DEFAULT_VOLUME = 0.5;
/** How quickly sounds get quieter with distance (gain = 1 / (1 + d * falloff)). */
const DISTANCE_FALLOFF = 0.12;
const MAX_PAN = 0.8;
const NOISE_SECONDS = 1;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Tiny synthesised sound effects (DESIGN.md §9, M3): no audio files, just
 * WebAudio noise and oscillators with envelopes. Sounds with a position are
 * attenuated and panned relative to the listener.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listener: Vec3 = { x: 0, y: 0, z: 0 };
  private listenerYaw = 0;
  muted = loadMuted();
  private volume = DEFAULT_VOLUME;

  /** Browsers only allow audio after a user gesture: call this from one (e.g. the click that locks the pointer). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buf.getChannelData(0);
      // Cosmetic randomness is fine here: this is client-only audio, not shared simulation.
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.ctx = ctx;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      // Not persisted; fine.
    }
    return this.muted;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = this.muted ? 0 : volume;
  }

  setListener(pos: Vec3, yaw: number): void {
    this.listener = pos;
    this.listenerYaw = yaw;
  }

  play(name: SoundName, at?: Vec3): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const out = this.spatial(ctx, at);
    const t = ctx.currentTime;
    switch (name) {
      case "pistol":
        this.noiseBurst(out, t, { type: "bandpass", freq: 1800, q: 0.8 }, 0.6, 0.12);
        this.tone(out, t, "sine", 150, 60, 0.4, 0.08);
        break;
      case "shotgun":
        this.noiseBurst(out, t, { type: "lowpass", freq: 1200, q: 0.7 }, 0.9, 0.35);
        this.tone(out, t, "sine", 110, 45, 0.6, 0.15);
        break;
      case "rocket":
        this.noiseBurst(out, t, { type: "bandpass", freq: 400, freqEnd: 1500, q: 1.2 }, 0.5, 0.45);
        break;
      case "explosion":
        this.noiseBurst(out, t, { type: "lowpass", freq: 900, freqEnd: 180, q: 0.7 }, 1, 0.9);
        this.tone(out, t, "sine", 70, 28, 0.9, 0.5);
        break;
      case "hit":
        this.tone(out, t, "square", 1400, 1400, 0.12, 0.05);
        break;
      case "kill":
        this.tone(out, t, "square", 1000, 1000, 0.12, 0.06);
        this.tone(out, t + 0.07, "square", 1600, 1600, 0.12, 0.08);
        break;
      case "hurt":
        this.tone(out, t, "triangle", 220, 110, 0.45, 0.16);
        break;
      case "reload":
        this.noiseBurst(out, t, { type: "highpass", freq: 3000, q: 0.7 }, 0.35, 0.03);
        this.noiseBurst(out, t + 0.15, { type: "highpass", freq: 2500, q: 0.7 }, 0.35, 0.04);
        break;
      case "heal":
        this.tone(out, t, "sine", 520, 1040, 0.3, 0.25);
        break;
      case "weaponPickup":
        // A rack: two quick metallic clacks.
        this.noiseBurst(out, t, { type: "bandpass", freq: 2200, q: 3 }, 0.35, 0.04);
        this.noiseBurst(out, t + 0.09, { type: "bandpass", freq: 1500, q: 3 }, 0.4, 0.05);
        this.tone(out, t + 0.09, "square", 140, 90, 0.12, 0.06);
        break;
      case "pad":
        this.tone(out, t, "triangle", 180, 720, 0.4, 0.3);
        this.noiseBurst(out, t, { type: "bandpass", freq: 600, freqEnd: 2400, q: 1 }, 0.25, 0.3);
        break;
      case "melee":
        this.noiseBurst(out, t, { type: "bandpass", freq: 2200, freqEnd: 500, q: 1.5 }, 0.45, 0.16);
        break;
      case "switch":
        this.noiseBurst(out, t, { type: "highpass", freq: 3500, q: 0.7 }, 0.25, 0.025);
        break;
    }
  }

  /** A gain + stereo pan node for a sound at `at` (or unpositioned: full volume, centred). */
  private spatial(ctx: AudioContext, at?: Vec3): AudioNode {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    if (at) {
      const dx = at.x - this.listener.x;
      const dy = at.y - this.listener.y;
      const dz = at.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      gain.gain.value = 1 / (1 + d * DISTANCE_FALLOFF);
      if (d > 0) {
        // Listener's right vector for a Three.js-style yaw.
        const rx = Math.cos(this.listenerYaw);
        const rz = -Math.sin(this.listenerYaw);
        pan.pan.value = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * MAX_PAN;
      }
    }
    gain.connect(pan).connect(this.master!);
    return gain;
  }

  private noiseBurst(
    out: AudioNode,
    t: number,
    filter: { type: BiquadFilterType; freq: number; freqEnd?: number; q: number },
    volume: number,
    duration: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.Q.value = filter.q;
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, t + duration);
    const env = this.envelope(t, volume, duration);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * (NOISE_SECONDS - duration));
    src.stop(t + duration);
  }

  private tone(out: AudioNode, t: number, type: OscillatorType, freq: number, freqEnd: number, volume: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    osc.connect(this.envelope(t, volume, duration)).connect(out);
    osc.start(t);
    osc.stop(t + duration);
  }

  private envelope(t: number, volume: number, duration: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    return g;
  }
}
