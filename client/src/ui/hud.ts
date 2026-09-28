const FEED_SIZE = 5;
const FEED_MS = 5000;
const HITMARKER_MS = 150;
const DAMAGE_FLASH_MS = 300;
const LOW_HEALTH = 30;

export interface HudView {
  health: number;
  alive: boolean;
  weaponName: string;
  ammo: string;
  /** Top-centre line: round timer or phase message. */
  roundText: string;
  roundSub: string;
  /** Centre-screen message (death, round end), empty to hide. */
  centerText: string;
  centerSub: string;
}

/** In-game HUD (DESIGN.md §9.3). Plain DOM; every player-supplied string is set as text, never HTML. */
export class Hud {
  private readonly health = el("div", "hud-health");
  private readonly weapon = el("div", "hud-weapon");
  private readonly round = el("div", "hud-round");
  private readonly roundSub = el("div", "hud-round-sub");
  private readonly feed = el("ul", "hud-feed");
  private readonly center = el("div", "hud-center");
  private readonly centerSub = el("div", "hud-center-sub");
  private readonly damage = el("div", "hud-damage");
  private readonly crosshair: HTMLElement | null;
  private hitmarkerTimer: number | undefined;
  private damageTimer: number | undefined;

  constructor(root: HTMLElement) {
    const top = el("div", "hud-top");
    top.append(this.round, this.roundSub);
    const middle = el("div", "hud-middle");
    middle.append(this.center, this.centerSub);
    root.append(this.damage, top, this.feed, middle, this.health, this.weapon);
    this.crosshair = document.getElementById("crosshair");
  }

  update(v: HudView): void {
    setText(this.health, v.alive ? String(v.health) : "");
    this.health.classList.toggle("low", v.alive && v.health <= LOW_HEALTH);
    setText(this.weapon, v.alive ? `${v.weaponName}  ${v.ammo}` : "");
    setText(this.round, v.roundText);
    setText(this.roundSub, v.roundSub);
    setText(this.center, v.centerText);
    setText(this.centerSub, v.centerSub);
    if (this.crosshair) this.crosshair.hidden = !v.alive;
  }

  addKill(killer: string, victim: string, weapon: string, mine: boolean): void {
    const item = el("li", mine ? "mine" : "");
    if (killer === victim) item.append(span("name", victim), span("weapon", ` ${weapon === "world" ? "fell out of the world" : "died"}`));
    else item.append(span("name", killer), span("weapon", ` [${weapon}] `), span("name", victim));
    this.feed.prepend(item);
    while (this.feed.children.length > FEED_SIZE) this.feed.lastElementChild?.remove();
    window.setTimeout(() => item.remove(), FEED_MS);
  }

  hitmarker(killed: boolean): void {
    if (!this.crosshair) return;
    this.crosshair.classList.add("hit");
    this.crosshair.classList.toggle("kill", killed);
    window.clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => this.crosshair?.classList.remove("hit", "kill"), HITMARKER_MS);
  }

  damageFlash(): void {
    this.damage.classList.add("on");
    window.clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => this.damage.classList.remove("on"), DAMAGE_FLASH_MS);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function span(className: string, text: string): HTMLSpanElement {
  const s = el("span", className);
  s.textContent = text;
  return s;
}

function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
