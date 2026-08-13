import type { Command } from "../game";
import type { PlayerState } from "../entities/player";
import { t } from "../i18n";
import { itemDef } from "../items/catalog";
import { displayName, isEquipped } from "../items/inventory";

type Choice = { label: string; run: () => void };

/**
 * 持ち物メニュー。
 *
 * キーボードだけで完結させる。アイテムを選ぶと、そのアイテムに対して
 * できることだけを並べた小さなメニューを出す。草に「装備」を出しても仕方がない。
 */
export class InventoryMenu {
  private open = false;
  private cursor = 0;
  private submenu: Choice[] | null = null;
  private subCursor = 0;
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
    this.cursor = Math.min(this.cursor, Math.max(0, player.inventory.items.length - 1));
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
    if (!this.open || !this.player) return false;

    const items = this.player.inventory.items;
    const list = this.submenu;

    if (code === "Escape" || code === "KeyI") {
      if (list) {
        this.submenu = null;
        this.render();
      } else {
        this.hide();
      }
      return true;
    }

    const move = (delta: number) => {
      if (list) {
        this.subCursor = wrap(this.subCursor + delta, list.length);
      } else if (items.length > 0) {
        this.cursor = wrap(this.cursor + delta, items.length);
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
        if (list) {
          const choice = list[this.subCursor];
          this.submenu = null;
          this.hide();
          choice?.run();
        } else if (items.length > 0) {
          this.submenu = this.choicesFor(this.cursor);
          this.subCursor = 0;
          this.render();
        }
        return true;
      default:
        return true; // メニュー中は他のキーを盤面に通さない
    }
  }

  private choicesFor(index: number): Choice[] {
    const player = this.player!;
    const emit = this.emit!;
    const item = player.inventory.items[index];
    if (!item) return [];
    const def = itemDef(item.defId);

    const choices: Choice[] = [];
    if (
      def.category === "weapon" ||
      def.category === "shield" ||
      def.category === "head" ||
      def.category === "charm"
    ) {
      choices.push({
        label: isEquipped(player.inventory, item.uid) ? t("menu.unequip") : t("menu.equip"),
        run: () => emit({ type: "equip", uid: item.uid }),
      });
    } else if (def.category !== "material") {
      // 素材(ほこら粉・刻印石)はゲンドの工房専用で、ダンジョン内で「つかう」ことはできない
      choices.push({
        label: def.category === "food" ? t("menu.eat") : def.category === "staff" ? t("menu.wave") : t("menu.use"),
        run: () => emit({ type: "use", uid: item.uid }),
      });
    }
    choices.push({ label: t("menu.throw"), run: () => emit({ type: "throw", uid: item.uid }) });
    choices.push({ label: t("menu.drop"), run: () => emit({ type: "drop", uid: item.uid }) });
    return choices;
  }

  private render(): void {
    const player = this.player;
    if (!player) return;
    const items = player.inventory.items;

    this.root.replaceChildren();

    const title = document.createElement("h3");
    title.className = "menu-title";
    title.textContent = t("ui.menu.inventory", { count: items.length, max: player.inventory.maxSize });
    this.root.appendChild(title);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = t("menu.empty");
      this.root.appendChild(empty);
    }

    const list = document.createElement("ul");
    // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulの
    // list roleが一部環境で外れるため、明示的に付け直す
    list.setAttribute("role", "list");
    list.className = "menu-list";
    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = displayName(player.inventory, item);
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    const selected = items[this.cursor];
    if (selected) {
      const desc = document.createElement("div");
      desc.className = "menu-desc";
      desc.textContent = itemDef(selected.defId).description;
      this.root.appendChild(desc);
    }

    if (this.submenu) {
      const sub = document.createElement("ul");
      sub.setAttribute("role", "list");
      sub.className = "menu-sub";
      this.submenu.forEach((choice, index) => {
        const li = document.createElement("li");
        li.textContent = choice.label;
        if (index === this.subCursor) li.classList.add("selected");
        sub.appendChild(li);
      });
      this.root.appendChild(sub);
    }

    const hint = document.createElement("div");
    hint.className = "menu-hint";
    hint.textContent = t("menu.hint");
    this.root.appendChild(hint);
  }
}

function wrap(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}
