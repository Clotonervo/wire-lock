import { MAX_PITCH, clamp, wrapAngle } from "@wire-lock/shared";
import type { AxisInput } from "@wire-lock/shared";

const SENSITIVITY_KEY = "wire-lock.sensitivity";
const DEFAULT_SENSITIVITY = 0.002;
const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

function loadSensitivity(): number {
  try {
    const v = Number(localStorage.getItem(SENSITIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_SENSITIVITY;
  } catch {
    return DEFAULT_SENSITIVITY;
  }
}

export interface SampledInput {
  move: { x: AxisInput; z: AxisInput };
  jump: boolean;
  fire: boolean;
  altFire: boolean;
  reload: boolean;
  /** A weapon switch requested since the last sample (0-based slot). */
  weaponSlot?: number;
}

/**
 * Pointer lock, keyboard/mouse state and mouse look (DESIGN.md §9.2).
 * Look angles update on every mouse event so the camera is never tied to the tick rate.
 */
export class InputController {
  yaw = 0;
  pitch = 0;
  locked = false;
  sensitivity = loadSensitivity();
  onLockChange: (locked: boolean) => void = () => {};
  onDebugToggle: () => void = () => {};
  onScoreboard: (show: boolean) => void = () => {};
  /** Scroll wheel: +1 next weapon, -1 previous. The game turns it into a slot. */
  onWheel: (dir: 1 | -1) => void = () => {};
  onMuteToggle: () => void = () => {};
  /** Called on any click, so audio can start (browsers require a user gesture). */
  onGesture: () => void = () => {};

  private keys = new Set<string>();
  private buttons = new Set<number>();
  /**
   * Keys/buttons pressed since the last sample. A tap that starts and ends
   * between two ticks would otherwise never be seen, so a press always counts
   * for at least one tick.
   */
  private tappedKeys = new Set<string>();
  private tappedButtons = new Set<number>();
  private pendingSlot: number | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("click", () => {
      this.onGesture();
      this.requestLock();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.release();
      this.onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw = wrapAngle(this.yaw - e.movementX * this.sensitivity);
      this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -MAX_PITCH, MAX_PITCH);
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.tappedButtons.add(e.button);
    });
    document.addEventListener("mouseup", (e) => this.buttons.delete(e.button));
    document.addEventListener("keydown", (e) => {
      if (e.code === "F3") {
        e.preventDefault();
        this.onDebugToggle();
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        if (!e.repeat) this.onScoreboard(true);
        return;
      }
      if (e.code === "KeyM" && !e.repeat) this.onMuteToggle();
      if (!this.locked) return;
      if (e.code === "Space") e.preventDefault();
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) this.requestSlot(Number(digit[1]) - 1);
      this.keys.add(e.code);
      this.tappedKeys.add(e.code);
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Tab") this.onScoreboard(false);
      this.keys.delete(e.code);
    });
    document.addEventListener(
      "wheel",
      (e) => {
        if (this.locked && e.deltaY !== 0) this.onWheel(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true },
    );
    window.addEventListener("blur", () => this.release());
  }

  requestLock(): void {
    // requestPointerLock returns a promise in modern browsers and rejects if called too soon after an unlock.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => {});
  }

  requestSlot(slot: number): void {
    this.pendingSlot = slot;
  }

  sample(): SampledInput {
    const key = (code: string) => this.keys.has(code) || this.tappedKeys.has(code);
    const button = (b: number) => this.buttons.has(b) || this.tappedButtons.has(b);
    const weaponSlot = this.pendingSlot;
    const sampled: SampledInput = {
      move: {
        x: axis(key("KeyD"), key("KeyA")),
        z: axis(key("KeyW"), key("KeyS")),
      },
      jump: key("Space"),
      fire: button(LEFT_BUTTON),
      altFire: button(RIGHT_BUTTON),
      reload: key("KeyR"),
      ...(weaponSlot === undefined ? {} : { weaponSlot }),
    };
    this.pendingSlot = undefined;
    this.tappedKeys.clear();
    this.tappedButtons.clear();
    return sampled;
  }

  private release(): void {
    this.keys.clear();
    this.buttons.clear();
    this.tappedKeys.clear();
    this.tappedButtons.clear();
    this.onScoreboard(false);
  }
}

function axis(positive: boolean, negative: boolean): AxisInput {
  return positive === negative ? 0 : positive ? 1 : -1;
}
