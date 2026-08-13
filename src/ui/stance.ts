import type { Command } from "../game";
import { ALLY_STANCE_NAMES, type Actor, type AllyStance } from "../core/types";

const STANCES: readonly AllyStance[] = ["free", "guard", "hold", "vanguard"];

const STANCE_DESCRIPTIONS: Record<AllyStance, string> = {
  free: "隣接する敵に反撃し、見えている敵を追う。いなければ主のそばへ。",
  guard: "自分からは追わず、主の隣接圏内で隣接した敵にだけ反撃する。",
  hold: "指示した場所を動かず、隣接した敵にだけ反撃する。",
  vanguard: "主より先に、まだ見ていない場所や階段へ自律的に進む。",
};

interface Target {
  allyId: number | "all";
  label: string;
}

/**
 * 仲間への指示(構え)メニュー。
 * 対象(全員/個別)を選んでから、構えを選ぶ2段階のメニュー。
 */
export class StanceMenu {
  private open = false;
  private cursor = 0;
  private submenu: AllyStance[] | null = null;
  private subCursor = 0;
  private targets: Target[] = [];
  private emit: ((cmd: Command) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(allies: readonly Actor[], emit: (cmd: Command) => void): void {
    if (allies.length === 0) return;
    this.emit = emit;
    this.targets = [
      { allyId: "all", label: "全員に指示" },
      ...allies.map((a) => ({ allyId: a.id, label: a.name })),
    ];
    this.open = true;
    this.cursor = Math.min(this.cursor, this.targets.length - 1);
    this.submenu = null;
    this.root.style.display = "block";
    this.render();
  }

  hide(): void {
    this.open = false;
    this.submenu = null;
    this.root.style.display = "none";
  }

  /** キーを処理したら true。true のあいだ盤面側は入力を受け取らない */
  handleKey(code: string): boolean {
    if (!this.open) return false;

    if (code === "Escape" || code === "KeyT") {
      if (this.submenu) {
        this.submenu = null;
        this.render();
      } else {
        this.hide();
      }
      return true;
    }

    const move = (delta: number) => {
      if (this.submenu) {
        this.subCursor = wrap(this.subCursor + delta, this.submenu.length);
      } else {
        this.cursor = wrap(this.cursor + delta, this.targets.length);
      }
      this.render();
    };

    switch (code) {
      case "ArrowUp":
      case "KeyW":
      case "Numpad8":
        move(-1);
        return true;
      case "ArrowDown":
      case "KeyS":
      case "Numpad2":
        move(1);
        return true;
      case "Enter":
      case "NumpadEnter":
      case "Space":
        if (this.submenu) {
          const stance = this.submenu[this.subCursor]!;
          const target = this.targets[this.cursor]!;
          this.emit?.({ type: "setStance", allyId: target.allyId, stance });
          this.hide();
        } else {
          this.submenu = [...STANCES];
          this.subCursor = 0;
          this.render();
        }
        return true;
      default:
        return true; // メニュー中は他のキーを盤面に通さない
    }
  }

  private render(): void {
    this.root.replaceChildren();

    const title = document.createElement("h3");
    title.className = "menu-title";
    title.textContent = "指示";
    this.root.appendChild(title);

    const list = document.createElement("ul");
    list.setAttribute("role", "list");
    list.className = "menu-list";
    this.targets.forEach((target, index) => {
      const li = document.createElement("li");
      li.textContent = target.label;
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    if (this.submenu) {
      const sub = document.createElement("ul");
      sub.setAttribute("role", "list");
      sub.className = "menu-sub";
      this.submenu.forEach((stance, index) => {
        const li = document.createElement("li");
        li.textContent = ALLY_STANCE_NAMES[stance];
        if (index === this.subCursor) li.classList.add("selected");
        sub.appendChild(li);
      });
      this.root.appendChild(sub);

      const desc = document.createElement("div");
      desc.className = "menu-desc";
      desc.textContent = STANCE_DESCRIPTIONS[this.submenu[this.subCursor]!];
      this.root.appendChild(desc);
    }

    const hint = document.createElement("div");
    hint.className = "menu-hint";
    hint.textContent = "↑↓ 選ぶ / Enter 決定 / Esc もどる";
    this.root.appendChild(hint);
  }
}

function wrap(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}
