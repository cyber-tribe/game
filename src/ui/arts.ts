import type { Command } from "../application/dungeonRun/game";
import { artsForLevel } from "../entities/arts";
import type { PlayerState } from "../entities/player";
import { createMenuDesc, createMenuHint, createMenuList, createMenuTitle, wrap } from "./util";

/**
 * 樽守りの技(plan/protagonist-arts.md、アーカイブ済み)メニュー。
 * 習得済みの技だけを一覧し、クールダウン中のものは選べないが理由が分かるようにする。
 */
export class ArtsMenu {
  private open = false;
  private cursor = 0;
  private player: PlayerState | null = null;
  private emit: ((cmd: Command) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(player: PlayerState, emit: (cmd: Command) => void): void {
    this.player = player;
    this.emit = emit;
    this.open = true;
    this.cursor = 0;
    this.root.style.display = "block";
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  /** キーを処理したら true。true のあいだ盤面側は入力を受け取らない */
  handleKey(code: string): boolean {
    if (!this.open) return false;
    const player = this.player;
    if (!player) return false;

    if (code === "Escape" || code === "KeyC") {
      this.hide();
      return true;
    }

    const known = artsForLevel(player.level);

    switch (code) {
      case "ArrowUp":
      case "KeyW":
      case "Numpad8":
        this.cursor = wrap(this.cursor - 1, known.length);
        this.render();
        return true;
      case "ArrowDown":
      case "KeyS":
      case "Numpad2":
        this.cursor = wrap(this.cursor + 1, known.length);
        this.render();
        return true;
      case "Enter":
      case "NumpadEnter":
      case "Space": {
        const chosen = known[this.cursor];
        if (chosen) this.emit?.({ type: "useArt", id: chosen.id });
        this.hide();
        return true;
      }
      default:
        return true; // メニュー中は他のキーを盤面に通さない
    }
  }

  private render(): void {
    const player = this.player;
    this.root.replaceChildren();
    if (!player) return;

    this.root.appendChild(createMenuTitle("技"));

    const known = artsForLevel(player.level);
    if (known.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = "まだ覚えている技がない。";
      this.root.appendChild(empty);
    } else {
      const list = createMenuList();
      known.forEach((art, index) => {
        const cooldown = player.artCooldowns[art.id] ?? 0;
        const li = document.createElement("li");
        li.textContent = cooldown > 0 ? `${art.name}(あと${cooldown}ターン)` : art.name;
        if (cooldown > 0) li.classList.add("disabled");
        if (index === this.cursor) li.classList.add("selected");
        list.appendChild(li);
      });
      this.root.appendChild(list);

      this.root.appendChild(createMenuDesc(known[this.cursor]?.description ?? ""));
    }

    this.root.appendChild(createMenuHint("↑↓ 選ぶ / Enter 繰り出す / Esc もどる"));
  }
}
