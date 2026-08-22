import type { Command } from "../application/dungeonRun/game";
import { ALLY_STANCE_NAMES } from "../entities/displayNames";
import type { AllyActor, AllyStance } from "../core/types";
import { createMenuDesc, createMenuHint, createMenuList, createMenuTitle, wrap } from "./util";

const STANCES: readonly AllyStance[] = ["free", "guard", "hold", "vanguard", "dreamArtsCareful"];

const STANCE_DESCRIPTIONS: Record<AllyStance, string> = {
  free: "隣接する敵に反撃し、見えている敵を追う。いなければ主のそばへ。",
  guard: "自分からは追わず、主の隣接圏内で隣接した敵にだけ反撃する。",
  hold: "指示した場所を動かず、隣接した敵にだけ反撃する。",
  vanguard: "主より先に、まだ見ていない場所や階段へ自律的に進む。",
  dreamArtsCareful: "動きはおまかせと同じ。ゆめわざの自動発動だけを控える。",
};

/** 「タルわざを頼む」の対象を表す特別なallyId。実在の仲間idとは重ならない文字列にしてある */
const BARREL_ART_TARGET = "barrelArt" as const;

interface Target {
  allyId: number | "all" | typeof BARREL_ART_TARGET;
  label: string;
}

/** 構えを選ぶ通常のサブメニューか、タルわざを頼む仲間を選ぶサブメニューか */
type Submenu =
  | { mode: "stance"; options: readonly AllyStance[] }
  | { mode: "barrelArt"; options: readonly AllyActor[] };

/**
 * 仲間への指示(構え)メニュー。
 * 対象(全員/個別)を選んでから、構えを選ぶ2段階のメニュー。
 *
 * タルわざ(plan/game/archive/barrel-arts.md): 空のタルを抱えていて、
 * タルわざを覚えた仲間がいるときだけ、対象の先頭に「タルわざを頼む」が
 * 現れる。選ぶと、通常の構え選択の代わりにタルわざ持ちの仲間一覧が出る
 */
export class StanceMenu {
  private open = false;
  private cursor = 0;
  private submenu: Submenu | null = null;
  private subCursor = 0;
  private targets: Target[] = [];
  private barrelArtAllies: readonly AllyActor[] = [];
  private emit: ((cmd: Command) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(
    allies: readonly AllyActor[],
    emit: (cmd: Command) => void,
    opts?: { barrelArtAllies: readonly AllyActor[] },
  ): void {
    if (allies.length === 0) return;
    this.emit = emit;
    this.barrelArtAllies = opts?.barrelArtAllies ?? [];
    this.targets = [
      ...(this.barrelArtAllies.length > 0
        ? [{ allyId: BARREL_ART_TARGET, label: "タルわざを頼む" }]
        : []),
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
        this.subCursor = wrap(this.subCursor + delta, this.submenu.options.length);
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
        if (this.submenu?.mode === "stance") {
          const stance = this.submenu.options[this.subCursor]!;
          const target = this.targets[this.cursor]!;
          this.emit?.({ type: "setStance", allyId: target.allyId as number | "all", stance });
          this.hide();
        } else if (this.submenu?.mode === "barrelArt") {
          const ally = this.submenu.options[this.subCursor]!;
          this.emit?.({ type: "castBarrelArt", allyId: ally.id });
          this.hide();
        } else {
          const target = this.targets[this.cursor]!;
          this.submenu =
            target.allyId === BARREL_ART_TARGET
              ? { mode: "barrelArt", options: this.barrelArtAllies }
              : { mode: "stance", options: STANCES };
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

    this.root.appendChild(createMenuTitle("指示"));

    const list = createMenuList();
    this.targets.forEach((target, index) => {
      const li = document.createElement("li");
      li.textContent = target.label;
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    if (this.submenu?.mode === "stance") {
      const sub = document.createElement("ul");
      sub.setAttribute("role", "list");
      sub.className = "menu-sub";
      this.submenu.options.forEach((stance, index) => {
        const li = document.createElement("li");
        li.textContent = ALLY_STANCE_NAMES[stance];
        if (index === this.subCursor) li.classList.add("selected");
        sub.appendChild(li);
      });
      this.root.appendChild(sub);

      this.root.appendChild(createMenuDesc(STANCE_DESCRIPTIONS[this.submenu.options[this.subCursor]!]));
    } else if (this.submenu?.mode === "barrelArt") {
      const sub = document.createElement("ul");
      sub.setAttribute("role", "list");
      sub.className = "menu-sub";
      this.submenu.options.forEach((ally, index) => {
        const li = document.createElement("li");
        li.textContent = ally.name;
        if (index === this.subCursor) li.classList.add("selected");
        sub.appendChild(li);
      });
      this.root.appendChild(sub);
      this.root.appendChild(createMenuDesc("抱えているからのタルを、選んだ仲間のタルわざで変える。"));
    }

    this.root.appendChild(createMenuHint("↑↓ 選ぶ / Enter 決定 / Esc もどる"));
  }
}
