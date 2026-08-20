/**
 * ボスの間の扉を開ける前の確認モーダル(plan/game/dungeon-boss-rooms.md)。
 * 扉のすぐ前に立って確定操作(Space/Enter)をしたときに出す。
 * `src/ui/stairs-confirm.ts` と同じ流儀(既定カーソルは誤操作防止のため
 * 「やめる」、モーダルの開閉自体はターンを消費しない)。
 */

export type DoorChoiceKey = "open" | "cancel";

export interface DoorChoice {
  key: DoorChoiceKey;
  label: string;
}

/** 「やめる」を必ず末尾に置く(既定カーソル=末尾、という既存方針を踏襲) */
export function doorChoices(): DoorChoice[] {
  return [
    { key: "open", label: "扉をあける" },
    { key: "cancel", label: "やめる" },
  ];
}

export function moveDoorCursor(cursor: number, code: string, length: number): number {
  switch (code) {
    case "ArrowUp":
    case "ArrowLeft":
    case "KeyW":
    case "KeyA":
      return (cursor + length - 1) % length;
    case "ArrowDown":
    case "ArrowRight":
    case "KeyS":
    case "KeyD":
      return (cursor + 1) % length;
    default:
      return cursor;
  }
}

export interface DoorConfirmOptions {
  /** 扉の向こうで待つボスの名前。確認文言に添える */
  bossName: string;
  onOpen: () => void;
}

const MOVE_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
]);

export class DoorConfirmModal {
  private open = false;
  private readonly choices: DoorChoice[] = doorChoices();
  private cursor = this.choices.length - 1;
  private opts: DoorConfirmOptions | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(opts: DoorConfirmOptions): void {
    this.opts = opts;
    this.cursor = this.choices.length - 1;
    this.open = true;
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

    if (code === "Escape") {
      this.hide();
      return true;
    }
    if (MOVE_CODES.has(code)) {
      this.cursor = moveDoorCursor(this.cursor, code, this.choices.length);
      this.render();
      return true;
    }
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
      const choice = this.choices[this.cursor];
      this.hide();
      if (choice.key === "open") this.opts?.onOpen();
      return true;
    }
    return true;
  }

  private render(): void {
    this.root.replaceChildren();

    const title = document.createElement("h3");
    title.className = "menu-title";
    title.textContent = "確認";
    this.root.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "menu-desc";
    desc.textContent = `${this.opts?.bossName ?? "何か"}の気配がする。扉をあけますか?`;
    this.root.appendChild(desc);

    const list = document.createElement("ul");
    list.setAttribute("role", "list");
    list.className = "menu-list";
    this.choices.forEach((choice, index) => {
      const li = document.createElement("li");
      li.textContent = choice.label;
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    const hint = document.createElement("div");
    hint.className = "menu-hint";
    hint.textContent = "↑↓ 選ぶ / Enter 決定 / Esc やめる";
    this.root.appendChild(hint);
  }
}
