import type { SaveSlotSummary } from "../save";

function formatLastPlayed(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * セーブ枠選択画面(plan/save-slots.md)。起動直後、拠点より前に表示する。
 * データの無い枠は「はじめる」表記にする。枠を選んだ状態で専用の「消す」
 * 操作(Delete)を用意し、確認を挟んでからでないと消えない(誤操作対策)。
 */
export class SlotSelectScreen {
  private open = false;
  private cursor = 0;
  private summaries: SaveSlotSummary[] = [];
  private onSelect: ((slot: number) => void) | null = null;
  private onDelete: ((slot: number) => void) | null = null;
  private confirmingDelete = false;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(summaries: SaveSlotSummary[], onSelect: (slot: number) => void, onDelete: (slot: number) => void): void {
    this.open = true;
    this.summaries = summaries;
    this.onSelect = onSelect;
    this.onDelete = onDelete;
    this.cursor = 0;
    this.confirmingDelete = false;
    this.root.style.display = "flex";
    this.render();
  }

  /** 削除直後など、選択を終了せずに一覧だけ最新化する */
  refresh(summaries: SaveSlotSummary[]): void {
    this.summaries = summaries;
    this.confirmingDelete = false;
    this.render();
  }

  hide(): void {
    this.open = false;
    this.onSelect = null;
    this.onDelete = null;
    this.root.style.display = "none";
  }

  handleKey(code: string): boolean {
    if (!this.open) return false;

    if (this.confirmingDelete) {
      if (code === "Enter" || code === "NumpadEnter") {
        this.onDelete?.(this.cursor);
      } else if (code === "Escape") {
        this.confirmingDelete = false;
        this.render();
      }
      return true;
    }

    switch (code) {
      case "ArrowUp":
      case "KeyW":
        this.cursor = (this.cursor + this.summaries.length - 1) % this.summaries.length;
        this.render();
        break;
      case "ArrowDown":
      case "KeyS":
        this.cursor = (this.cursor + 1) % this.summaries.length;
        this.render();
        break;
      case "Enter":
      case "NumpadEnter":
      case "Space":
        this.onSelect?.(this.cursor);
        break;
      case "Delete":
      case "Backspace":
        if (this.summaries[this.cursor]?.exists) {
          this.confirmingDelete = true;
          this.render();
        }
        break;
    }
    // 開いているあいだは、ダンジョン内操作などへキーを漏らさない
    return true;
  }

  private render(): void {
    this.root.replaceChildren();

    const box = document.createElement("div");
    box.className = "slot-box";

    const heading = document.createElement("h2");
    heading.textContent = "はじめる/続きから";
    box.appendChild(heading);

    const list = document.createElement("ul");
    this.summaries.forEach((summary, i) => {
      const row = document.createElement("li");
      row.className = "slot-row" + (i === this.cursor ? " selected" : "") + (!summary.exists ? " empty" : "");

      const name = document.createElement("span");
      name.className = "slot-name";
      name.textContent = `枠${summary.slot + 1}: ${summary.exists ? `地下${summary.deepest}階` : "はじめる"}`;
      row.appendChild(name);

      if (summary.exists) {
        const detail = document.createElement("span");
        detail.className = "slot-detail";
        detail.textContent = formatLastPlayed(summary.lastPlayedAt);
        row.appendChild(detail);
      }

      list.appendChild(row);
    });
    box.appendChild(list);

    const hint = document.createElement("p");
    hint.className = "slot-hint";
    hint.textContent = this.confirmingDelete
      ? "この枠を消します。Enterで消す / Escでやめる"
      : "↑↓ 選ぶ / Enter 決定 / Delete 消す(要確認)";
    box.appendChild(hint);

    this.root.appendChild(box);
  }
}
