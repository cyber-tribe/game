/**
 * 階段を降りる前の確認モーダル(plan/stairs-confirm-modal.md)。
 * 「急にマップが変わって何が起きたのかわからない」という報告を受け、
 * 階段の上での確定操作(Space)から即座に降下させず、一度確認を挟む。
 * モーダルを開いて閉じるだけではターンを消費しない(既存のメニュー類と同じ)
 */
export class StairsConfirmModal {
  private open = false;
  /** 誤操作防止を優先し、既定の選択は「やめる」寄りにする(計画書の未決事項への回答) */
  private cursor: 0 | 1 = 1;
  private onDescend: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(onDescend: () => void): void {
    this.onDescend = onDescend;
    this.cursor = 1;
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

    switch (code) {
      case "Escape":
        this.hide();
        return true;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
      case "KeyW":
      case "KeyS":
      case "KeyA":
      case "KeyD":
        this.cursor = this.cursor === 0 ? 1 : 0;
        this.render();
        return true;
      case "Enter":
      case "NumpadEnter":
      case "Space":
        if (this.cursor === 0) this.onDescend?.();
        this.hide();
        return true;
      default:
        return true; // モーダル中は他のキーを盤面に通さない
    }
  }

  private render(): void {
    this.root.replaceChildren();

    const title = document.createElement("h3");
    title.className = "menu-title";
    title.textContent = "確認";
    this.root.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "menu-desc";
    desc.textContent = "この先へ降りますか?";
    this.root.appendChild(desc);

    const list = document.createElement("ul");
    list.setAttribute("role", "list");
    list.className = "menu-list";
    (["降りる", "やめる"] as const).forEach((label, index) => {
      const li = document.createElement("li");
      li.textContent = label;
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
