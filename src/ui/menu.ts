import type { Command } from "../game";
import type { PlayerState } from "../entities/player";
import { t } from "../i18n";
import { itemDef } from "../items/catalog";
import { displayName, isEquipped } from "../items/inventory";
import { createMenuDesc, createMenuHint, createMenuList, createMenuTitle, wrap } from "./util";

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

    this.root.appendChild(createMenuTitle(t("ui.menu.inventory", { count: items.length, max: player.inventory.maxSize })));

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = t("menu.empty");
      this.root.appendChild(empty);
    }

    const list = createMenuList();
    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = displayName(player.inventory, item);
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    const selected = items[this.cursor];
    if (selected) {
      this.root.appendChild(createMenuDesc(itemDef(selected.defId).description));
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

    this.root.appendChild(createMenuHint(t("menu.hint")));

    // 所持数が多いとリストが内側スクロールになる(issue #553)。カーソルの
    // 移動先が見える位置まで運ぶ(拠点画面の列と同じ手法)。サブメニューを
    // 開いているあいだはそちらのカーソルを優先する
    const selectedRow = this.submenu
      ? this.root.querySelector(".menu-sub li.selected")
      : this.root.querySelector(".menu-list li.selected");
    selectedRow?.scrollIntoView({ block: "nearest" });
  }
}
