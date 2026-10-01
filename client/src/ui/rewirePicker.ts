import { getRewire } from "@wire-lock/shared";

/**
 * The 1-of-3 Rewire cards shown while dead or before spawning (DESIGN.md §8b.4).
 * Pick with keys 1–3, or release the mouse (Esc) and click. Text only.
 */
export class RewirePicker {
  onPick: (id: string) => void = () => {};

  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly hint: HTMLParagraphElement;
  private readonly cards: HTMLDivElement;
  private offer: string[] = [];
  private key = "";
  private picked = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "rewire-picker";
    this.root.hidden = true;
    this.title = document.createElement("h2");
    this.cards = document.createElement("div");
    this.cards.className = "rewire-cards";
    this.hint = document.createElement("p");
    this.hint.className = "rewire-hint";
    this.root.append(this.title, this.cards, this.hint);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(offer: string[], title: string, pending: number): void {
    this.root.hidden = false;
    this.title.textContent = title;
    this.hint.textContent = `Press 1–${offer.length} to pick${pending > 1 ? ` · ${pending - 1} more after this` : ""} · or Esc and click`;
    const key = offer.join(",");
    if (key === this.key) return;
    this.key = key;
    this.offer = offer;
    this.picked = false;
    this.cards.replaceChildren(
      ...offer.map((id, i) => {
        const def = getRewire(id);
        const card = document.createElement("button");
        card.type = "button";
        card.className = `rewire-card rarity-${def?.rarity ?? "common"}`;
        const num = document.createElement("span");
        num.className = "rewire-key";
        num.textContent = String(i + 1);
        const name = document.createElement("strong");
        name.textContent = def?.name ?? id;
        const desc = document.createElement("p");
        desc.textContent = def?.description ?? "";
        const rarity = document.createElement("em");
        rarity.textContent = def?.rarity ?? "";
        card.append(num, name, desc, rarity);
        card.addEventListener("click", (e) => {
          e.stopPropagation();
          this.pickIndex(i);
        });
        return card;
      }),
    );
  }

  hide(): void {
    this.root.hidden = true;
    this.key = "";
  }

  /** Picks the i-th card (0-based). Returns false if there's nothing to pick. */
  pickIndex(i: number): boolean {
    const id = this.offer[i];
    if (!this.visible || this.picked || !id) return false;
    this.picked = true; // until the server's next offer arrives, ignore repeat presses
    this.cards.children[i]?.classList.add("chosen");
    this.onPick(id);
    return true;
  }
}
