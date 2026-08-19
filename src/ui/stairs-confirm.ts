/**
 * 階段を降りる前の確認モーダル(plan/stairs-confirm-modal.md)。
 * 「急にマップが変わって何が起きたのかわからない」という報告を受け、
 * 階段の上での確定操作(Space)から即座に降下させず、一度確認を挟む。
 * モーダルを開いて閉じるだけではターンを消費しない(既存のメニュー類と同じ)。
 *
 * めざめの階段(チェックポイント階)の上では「ここで区切って持ち帰る」を
 * 含む3択になる(plan/game/checkpoint-stairs-menu.md)。区切りは既存の
 * Rキーとまったく同じ経路(bankコマンド→bankRun)を呼ぶだけで、
 * 新しい帰還処理は持たない。通常の階段は従来どおり2択のまま。
 */

/** 選択肢の意味。descend=降りる / bank=区切って持ち帰る / cancel=やめる */
export type StairsChoiceKey = "descend" | "bank" | "cancel";

export interface StairsChoice {
  key: StairsChoiceKey;
  label: string;
  /** 選択肢の下に添える1行説明。空文字なら表示しない */
  desc: string;
}

/**
 * 階段確認モーダルの選択肢一覧(表示順)。checkpoint=trueなら
 * めざめの階段用の3択、falseなら従来の2択。
 * 「やめる」は必ず末尾に置く(既定カーソルが末尾=やめる、という
 * 誤操作防止の既存方針を維持するため)
 */
export function stairsChoices(checkpoint: boolean): StairsChoice[] {
  if (!checkpoint) {
    return [
      { key: "descend", label: "降りる", desc: "" },
      { key: "cancel", label: "やめる", desc: "" },
    ];
  }
  return [
    { key: "descend", label: "つぎの階へ降りる", desc: "区切らずに、さらに深くへ進む" },
    {
      key: "bank",
      label: "ここで区切って持ち帰る",
      desc: "持ちものと仲間を持ち帰って、今回の探索を終える",
    },
    { key: "cancel", label: "やめる", desc: "階段の上にとどまる" },
  ];
}

/**
 * カーソル移動。上下どちらのキーでも端で折り返す(2択のときは
 * どのキーでもトグルになり、従来の挙動と一致する)
 */
export function moveStairsCursor(cursor: number, code: string, length: number): number {
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

export interface StairsConfirmOptions {
  /** めざめの階段(チェックポイント階)なら3択になる */
  checkpoint: boolean;
  onDescend: () => void;
  /** 「ここで区切って持ち帰る」。checkpoint=trueのときだけ使われる */
  onBank: () => void;
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

export class StairsConfirmModal {
  private open = false;
  private choices: StairsChoice[] = stairsChoices(false);
  /** 誤操作防止を優先し、既定の選択は末尾の「やめる」にする(計画書の未決事項への回答) */
  private cursor = this.choices.length - 1;
  private opts: StairsConfirmOptions | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(opts: StairsConfirmOptions): void {
    this.opts = opts;
    this.choices = stairsChoices(opts.checkpoint);
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
      this.cursor = moveStairsCursor(this.cursor, code, this.choices.length);
      this.render();
      return true;
    }
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
      const choice = this.choices[this.cursor];
      this.hide();
      if (choice.key === "descend") this.opts?.onDescend();
      else if (choice.key === "bank") this.opts?.onBank();
      return true;
    }
    return true; // モーダル中は他のキーを盤面に通さない
  }

  private render(): void {
    this.root.replaceChildren();

    const title = document.createElement("h3");
    title.className = "menu-title";
    title.textContent = "確認";
    this.root.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "menu-desc";
    desc.textContent = this.opts?.checkpoint
      ? "めざめの階段だ。どうする?"
      : "この先へ降りますか?";
    this.root.appendChild(desc);

    const list = document.createElement("ul");
    list.setAttribute("role", "list");
    list.className = "menu-list";
    this.choices.forEach((choice, index) => {
      const li = document.createElement("li");
      li.textContent = choice.label;
      if (choice.desc !== "") {
        const note = document.createElement("div");
        note.className = "choice-desc";
        note.textContent = choice.desc;
        li.appendChild(note);
      }
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
