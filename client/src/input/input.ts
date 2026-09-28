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

  private keys = new Set<string>();
  private buttons = new Set<number>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("click", () => this.requestLock());
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
      if (this.locked) this.buttons.add(e.button);
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
      if (!this.locked) return;
      if (e.code === "Space") e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Tab") this.onScoreboard(false);
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => this.release());
  }

  requestLock(): void {
    // requestPointerLock returns a promise in modern browsers and rejects if called too soon after an unlock.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => {});
  }

  sample(): SampledInput {
    const k = this.keys;
    return {
      move: {
        x: axis(k.has("KeyD"), k.has("KeyA")),
        z: axis(k.has("KeyW"), k.has("KeyS")),
      },
      jump: k.has("Space"),
      fire: this.buttons.has(LEFT_BUTTON),
      altFire: this.buttons.has(RIGHT_BUTTON),
    };
  }

  private release(): void {
    this.keys.clear();
    this.buttons.clear();
    this.onScoreboard(false);
  }
}

function axis(positive: boolean, negative: boolean): AxisInput {
  return positive === negative ? 0 : positive ? 1 : -1;
}
