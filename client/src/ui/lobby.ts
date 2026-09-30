import { DEFAULT_MODE_ID, MAX_NAME_LENGTH, MODES, ROOM_CODE_LENGTH, normalizeRoomCode } from "@wire-lock/shared";
import { createRoom, describeJoinError, joinRoom, pingServer, type ArenaRoom } from "../net/connection";

const NAME_KEY = "wire-lock.name";
const PING_TIMEOUT_MS = 5000;
const PING_RETRY_MS = 2000;
/** After this long, say something might be wrong (but keep trying). */
const SLOW_WAKE_MS = 90_000;
/** Consecutive "answering but refusing us" pings before we say so (the proxy can do it briefly while waking). */
const BLOCKED_PINGS_BEFORE_HINT = 3;

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered; fine.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

/**
 * The first screen (DESIGN.md §9.3): waits for the server to wake up (free
 * hosting sleeps when idle), then lets the player create a room or join one by
 * code. Resolves with the joined room.
 */
export class Lobby {
  private readonly panel = el("div", { className: "lobby-panel" });

  constructor(private readonly root: HTMLElement) {
    root.replaceChildren(this.panel);
    root.hidden = false;
  }

  async run(): Promise<ArenaRoom> {
    await this.waitForServer();
    return this.showForm();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private async waitForServer(): Promise<void> {
    const title = el("h2", { textContent: "Connecting…" });
    const detail = el("p", { className: "lobby-note" });
    this.panel.replaceChildren(el("h1", { textContent: "Wire Lock" }), title, detail);

    const start = performance.now();
    let blockedPings = 0;
    const timer = window.setInterval(() => {
      const s = Math.round((performance.now() - start) / 1000);
      title.textContent = `Waking up the server… ${s}s`;
      detail.textContent =
        blockedPings >= BLOCKED_PINGS_BEFORE_HINT
          ? `The server is answering but won't accept connections from ${location.origin}. Its ALLOWED_ORIGINS setting needs to include this address.`
          : performance.now() - start > SLOW_WAKE_MS
            ? "This is taking longer than usual. Still trying. Check your connection if it doesn't come up soon."
            : "The server sleeps when nobody is playing. The first visit can take up to a minute.";
    }, 1000);
    try {
      for (;;) {
        const status = await pingServer(PING_TIMEOUT_MS);
        if (status === "ok") break;
        blockedPings = status === "blocked" ? blockedPings + 1 : 0;
        await new Promise((r) => setTimeout(r, PING_RETRY_MS));
      }
    } finally {
      window.clearInterval(timer);
    }
  }

  private showForm(): Promise<ArenaRoom> {
    return new Promise((resolve) => {
      const invited = normalizeRoomCode(new URLSearchParams(location.search).get("room") ?? "");

      const name = el("input", { type: "text", maxLength: MAX_NAME_LENGTH, placeholder: "Your name", value: loadName(), autocomplete: "off" });
      const error = el("p", { className: "lobby-error" });

      const mode = el("select");
      for (const m of Object.values(MODES)) mode.append(el("option", { value: m.id, textContent: m.name, selected: m.id === DEFAULT_MODE_ID }));
      const createBtn = el("button", { type: "button", textContent: "Create room", className: invited ? "secondary" : "primary" });

      const code = el("input", { type: "text", maxLength: ROOM_CODE_LENGTH, placeholder: "CODE", value: invited ?? "", className: "lobby-code", autocomplete: "off" });
      const joinBtn = el("button", { type: "button", textContent: invited ? `Join room ${invited}` : "Join", className: invited ? "primary" : "secondary" });

      const busy = (on: boolean) => {
        for (const b of [createBtn, joinBtn]) b.disabled = on;
      };
      const attempt = async (go: (playerName: string) => Promise<ArenaRoom>) => {
        const playerName = name.value.trim();
        saveName(playerName);
        error.textContent = "";
        busy(true);
        try {
          const room = await go(playerName);
          const url = new URL(location.href);
          url.searchParams.set("room", room.roomId);
          history.replaceState(null, "", url);
          resolve(room);
        } catch (err) {
          error.textContent = describeJoinError(err);
          busy(false);
        }
      };

      createBtn.addEventListener("click", () => void attempt((n) => createRoom(n, mode.value)));
      const join = () => {
        const c = normalizeRoomCode(code.value);
        if (!c) {
          error.textContent = `Room codes are ${ROOM_CODE_LENGTH} letters.`;
          return;
        }
        void attempt((n) => joinRoom(c, n));
      };
      joinBtn.addEventListener("click", join);
      code.addEventListener("keydown", (e) => {
        if (e.key === "Enter") join();
      });
      code.addEventListener("input", () => (code.value = code.value.toUpperCase()));

      const createRow = el("div", { className: "lobby-row" });
      createRow.append(mode, createBtn);
      const joinRow = el("div", { className: "lobby-row" });
      joinRow.append(code, joinBtn);
      const nameLabel = el("label", { textContent: "Name" });
      nameLabel.append(name);

      const sections = invited
        ? [joinRow, el("p", { className: "lobby-or", textContent: "or start your own" }), createRow]
        : [createRow, el("p", { className: "lobby-or", textContent: "or join with a code" }), joinRow];
      this.panel.replaceChildren(el("h1", { textContent: "Wire Lock" }), nameLabel, ...sections, error);
      (invited ? joinBtn : name.value ? createBtn : name).focus();
    });
  }
}
