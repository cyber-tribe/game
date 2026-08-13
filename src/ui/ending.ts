import { CREDIT_REGIONS, creditMonsterNames, creditVillagerNames } from "../entities/credits";

/**
 * エンドロール(plan/ending-sequence.md)。自動スクロールではなく、既存の
 * メッセージイベント送り(決定キーで次へ進む)と同じ操作で、章立てされた
 * 一覧を数ページに分けて送る。新しい入力・新しいUIコンポーネントの型は
 * 増やさない
 */

interface CreditPage {
  title: string;
  items?: readonly string[];
  lines?: readonly string[];
}

function buildPages(): readonly CreditPage[] {
  return [
    { title: "地方", items: CREDIT_REGIONS },
    { title: "夢のかけら", items: creditMonsterNames() },
    { title: "村の人々", items: creditVillagerNames() },
    {
      title: "",
      lines: ["山は、また静かな寝息に戻った。", "村の日常と、夢に潜る日々は、これからも続いていく。"],
    },
  ];
}

export class EndingScreen {
  private open = false;
  private page = 0;
  private onFinish: (() => void) | null = null;
  private readonly pages = buildPages();

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(onFinish: () => void): void {
    this.onFinish = onFinish;
    this.page = 0;
    this.open = true;
    this.root.style.display = "flex";
    this.render();
  }

  private close(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  /** キーを処理したら true。true のあいだ盤面側は入力を受け取らない */
  handleKey(code: string): boolean {
    if (!this.open) return false;

    switch (code) {
      case "Enter":
      case "NumpadEnter":
      case "Space":
        if (this.page >= this.pages.length - 1) {
          this.close();
          this.onFinish?.();
        } else {
          this.page++;
          this.render();
        }
        return true;
      default:
        return true; // 表示中は他のキーを盤面に通さない
    }
  }

  private render(): void {
    this.root.replaceChildren();
    const page = this.pages[this.page]!;

    const box = document.createElement("div");
    box.className = "ending-box";

    if (page.title) {
      const title = document.createElement("h2");
      title.textContent = page.title;
      box.appendChild(title);
    }

    if (page.items) {
      const list = document.createElement("ul");
      list.setAttribute("role", "list");
      for (const item of page.items) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
      box.appendChild(list);
    }

    if (page.lines) {
      for (const line of page.lines) {
        const p = document.createElement("p");
        p.textContent = line;
        box.appendChild(p);
      }
    }

    const hint = document.createElement("p");
    hint.className = "ending-hint";
    hint.textContent =
      this.page >= this.pages.length - 1 ? "Enter / Space で拠点にもどる" : "Enter / Space で次へ";
    box.appendChild(hint);

    this.root.appendChild(box);
  }
}
