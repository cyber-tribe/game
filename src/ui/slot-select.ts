import type { SaveSlotSummary } from "../save";
import { resolveText } from "../entities/inputText";
import { currentInputMode } from "./inputMode";

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
 * 操作(Delete、またはタップの削除ボタン、plan/game/save-delete-touch.md)を
 * 用意し、確認を挟んでからでないと消えない(誤操作対策)。
 */
export class SlotSelectScreen {
  private open = false;
  private cursor = 0;
  private summaries: SaveSlotSummary[] = [];
  private onSelect: ((slot: number) => void) | null = null;
  private onDelete: ((slot: number) => void) | null = null;
  /**
   * 設定画面の「セーブデータの管理」(plan/game/save-delete-touch.md)から
   * 開いたときだけ渡される。渡されていれば、この画面は起動時の必須選択
   * ではなく管理用に開いたものなので、Escape/「もどる」で呼び出し元へ戻れる
   */
  private onClose: (() => void) | null = null;
  private confirmingDelete = false;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(
    summaries: SaveSlotSummary[],
    onSelect: (slot: number) => void,
    onDelete: (slot: number) => void,
    onClose?: () => void,
  ): void {
    this.open = true;
    this.summaries = summaries;
    this.onSelect = onSelect;
    this.onDelete = onDelete;
    this.onClose = onClose ?? null;
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
    this.onClose = null;
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
      case "Escape":
        if (this.onClose) {
          const onClose = this.onClose;
          this.hide();
          onClose();
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
    list.setAttribute("role", "list");
    this.summaries.forEach((summary, i) => {
      const row = document.createElement("li");
      row.className = "slot-row" + (i === this.cursor ? " selected" : "") + (!summary.exists ? " empty" : "");

      const name = document.createElement("span");
      name.className = "slot-name";
      name.textContent = `枠${summary.slot + 1}: ${summary.exists ? `地下${summary.deepest}階` : "はじめる"}`;
      row.appendChild(name);

      // タッチ操作向け(#274): この画面はキー入力しか受け付けておらず、
      // タップしても何も起きなかった。タップした枠をそのまま選ぶ
      // (キーボードの「↑↓で選んでEnter」を1回のタップにまとめた形)
      row.addEventListener("click", () => {
        if (this.confirmingDelete) return;
        this.cursor = i;
        this.onSelect?.(i);
      });

      if (summary.exists) {
        // 日時と削除ボタンをまとめて右端に置く(slot-rowのspace-betweenは
        // slot-nameとこのグループの2要素のあいだだけに効かせたいため)
        const right = document.createElement("span");
        right.className = "slot-row-right";

        const detail = document.createElement("span");
        detail.className = "slot-detail";
        detail.textContent = formatLastPlayed(summary.lastPlayedAt);
        right.appendChild(detail);

        // スマホからの削除(plan/game/save-delete-touch.md): Deleteキーが
        // 無いタッチ環境でも枠を消せるよう、常設の削除ボタンを置く
        // (空の枠には出さない)。行タップの選択とは独立して確認へ入る
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "slot-delete-btn";
        deleteButton.textContent = "削除";
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.cursor = i;
          this.confirmingDelete = true;
          this.render();
        });
        right.appendChild(deleteButton);

        row.appendChild(right);
      }

      list.appendChild(row);
    });
    box.appendChild(list);

    if (this.confirmingDelete) {
      const target = this.summaries[this.cursor];
      const warning = document.createElement("p");
      warning.className = "slot-confirm";
      warning.textContent =
        `枠${(target?.slot ?? this.cursor) + 1}のデータを削除する。` +
        "持ちもの・仲間・記録がすべて消え、元に戻せない。";
      box.appendChild(warning);

      // タップできる確認/取り消し(plan/game/save-delete-touch.md): ソフトウェア
      // キーボードにEscapeが無いスマホでも確定・取り消しの両方が行えるよう、
      // naming-dialog.tsと同じ「常設ボタン+ヒント文言をキー/タッチで出し分け」
      // の形にする。安全側の「やめる」を先に置く
      const actions = document.createElement("div");
      actions.className = "slot-confirm-actions";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "slot-confirm-btn";
      cancelButton.textContent = "やめる";
      cancelButton.addEventListener("click", () => {
        this.confirmingDelete = false;
        this.render();
      });
      actions.appendChild(cancelButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "slot-confirm-btn slot-confirm-btn-danger";
      deleteButton.textContent = "本当に削除する";
      deleteButton.addEventListener("click", () => this.onDelete?.(this.cursor));
      actions.appendChild(deleteButton);

      box.appendChild(actions);
    }

    const hint = document.createElement("p");
    hint.className = "slot-hint";
    if (this.confirmingDelete) {
      hint.textContent = resolveText(
        { keyboard: "Enterで消す / Escでやめる", touch: "ボタンで消す / やめる" },
        currentInputMode(),
      );
    } else {
      hint.textContent = resolveText(
        {
          keyboard: "↑↓ 選ぶ / Enter 決定 / Delete 消す(要確認)",
          touch: "タップで選ぶ / 削除ボタンで消す(要確認)",
        },
        currentInputMode(),
      );
    }
    box.appendChild(hint);

    this.root.appendChild(box);
  }
}
