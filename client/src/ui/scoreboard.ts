export interface ScoreRow {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  status: "" | "dead" | "away";
  me: boolean;
}

/** Tab scoreboard, also shown at the end of a round (DESIGN.md §9.3). Text only. */
export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLTableSectionElement;
  private lastKey = "";

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "scoreboard";
    this.root.hidden = true;
    this.title = document.createElement("h2");
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const h of ["Player", "Kills", "Deaths", ""]) head.insertCell().textContent = h;
    this.body = table.createTBody();
    this.root.append(this.title, table);
    parent.appendChild(this.root);
  }

  update(visible: boolean, title: string, rows: ScoreRow[]): void {
    this.root.hidden = !visible;
    if (!visible) return;

    const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
    const key = title + JSON.stringify(sorted);
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.title.textContent = title;
    this.body.replaceChildren();
    for (const r of sorted) {
      const tr = this.body.insertRow();
      if (r.me) tr.className = "me";
      tr.insertCell().textContent = r.name;
      tr.insertCell().textContent = String(r.kills);
      tr.insertCell().textContent = String(r.deaths);
      tr.insertCell().textContent = r.status;
    }
  }
}
