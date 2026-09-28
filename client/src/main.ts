import { getMap } from "@wire-lock/shared";
import { Game } from "./game";
import { InputController } from "./input/input";
import { connect } from "./net/connection";
import type { ArenaStateView } from "./net/stateTypes";
import { createScene } from "./render/scene";
import { DebugOverlay } from "./ui/debugOverlay";

const container = document.getElementById("game");
const status = document.getElementById("status");
const lockPrompt = document.getElementById("lock-prompt");

function setStatus(text: string) {
  if (status) status.textContent = text;
}

async function main() {
  if (!container) throw new Error("#game container missing");

  const room = await connect();
  console.log(`connected: ${room.sessionId}`);
  setStatus("");
  room.onLeave(() => setStatus("disconnected"));

  // Wait for the first full state so we know which map to build.
  const state = await new Promise<ArenaStateView>((resolve) => {
    if (room.state?.mapId) resolve(room.state);
    else room.onStateChange.once((s) => resolve(s));
  });
  const map = getMap(state.mapId);
  if (!map) throw new Error(`unknown map ${state.mapId}`);

  const view = createScene(container);
  const input = new InputController(view.renderer.domElement);
  const overlay = new DebugOverlay(document.body);
  input.onDebugToggle = () => overlay.toggle();
  input.onLockChange = (locked) => {
    if (lockPrompt) lockPrompt.hidden = locked;
  };
  lockPrompt?.addEventListener("click", () => input.requestLock());

  const game = new Game(room, map, view, input, overlay);
  game.start();

  if (import.meta.env.DEV) Object.assign(window, { game });
}

main().catch((err: unknown) => {
  console.error("startup failed", err);
  setStatus("connection failed — is the server running?");
});
