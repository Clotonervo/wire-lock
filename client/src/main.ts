import { getMap } from "@wire-lock/shared";
import { Sfx } from "./audio/sfx";
import { Game } from "./game";
import { InputController } from "./input/input";
import type { ArenaRoom } from "./net/connection";
import type { ArenaStateView } from "./net/stateTypes";
import { createScene } from "./render/scene";
import { DebugOverlay } from "./ui/debugOverlay";
import { Hud } from "./ui/hud";
import { Lobby } from "./ui/lobby";
import { RewirePicker } from "./ui/rewirePicker";
import { Scoreboard } from "./ui/scoreboard";
import { SettingsPanel } from "./ui/settingsPanel";
import { loadSettings, type Settings } from "./settings";

const container = document.getElementById("game");
const status = document.getElementById("status");
const lobbyRoot = document.getElementById("lobby");
const lockPrompt = document.getElementById("lock-prompt");
const hudRoot = document.getElementById("hud");

function setStatus(text: string) {
  if (status) status.textContent = text;
}

/** Shows the room code in the pause menu, with a button that copies an invite link. */
function showRoomInfo(room: ArenaRoom) {
  const code = document.getElementById("room-code");
  const copy = document.getElementById("copy-invite");
  if (code) code.textContent = room.roomId;
  copy?.addEventListener("click", (e) => {
    e.stopPropagation(); // don't also grab the pointer
    const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).then(
      () => (copy.textContent = "Link copied!"),
      () => (copy.textContent = link),
    );
  });
}

async function main() {
  if (!container || !hudRoot || !lobbyRoot) throw new Error("#game, #hud or #lobby container missing");

  const lobby = new Lobby(lobbyRoot);
  const room = await lobby.run();
  lobby.hide();
  console.log(`connected: ${room.sessionId} in room ${room.roomId}`);
  room.onLeave(() => setStatus("Disconnected. Reload the page to rejoin."));
  showRoomInfo(room);

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
  const sfx = new Sfx();
  const apply = (s: Settings) => {
    input.sensitivity = s.sensitivity;
    sfx.setVolume(s.volume);
    view.camera.fov = s.fov;
    view.camera.updateProjectionMatrix();
  };
  const settings = loadSettings();
  apply(settings);
  if (lockPrompt) new SettingsPanel(lockPrompt, settings).onChange = apply;
  input.onGesture = () => sfx.unlock();
  input.onMuteToggle = () => sfx.toggleMute();
  if (lockPrompt) {
    lockPrompt.hidden = false;
    lockPrompt.addEventListener("click", () => {
      sfx.unlock();
      input.requestLock();
    });
  }

  const ui = { overlay, hud: new Hud(hudRoot), scoreboard: new Scoreboard(document.body), sfx, picker: new RewirePicker(document.body) };
  const game = new Game(room, map, view, input, ui);
  game.start();

  if (import.meta.env.DEV) Object.assign(window, { game });
}

main().catch((err: unknown) => {
  console.error("startup failed", err);
  setStatus("Something went wrong. Reload the page to try again.");
});
