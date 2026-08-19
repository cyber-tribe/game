/**
 * レベルアップ時のスキル選択モーダル(plan/game/archive/run-build-skills.md)。
 * 3択+説明1行。選ぶまでゲームは進まない(StairsConfirmModalと違い、
 * Escapeでの取り消しは無い)。
 */
import type { RunSkillId } from "../core/types";
import { RUN_SKILLS } from "../entities/runSkills";
import { createMenuDesc, createMenuHint, createMenuList, createMenuTitle, wrap } from "./util";

export interface SkillChoiceOptions {
  candidates: readonly RunSkillId[];
  onChoose: (id: RunSkillId) => void;
}

const MOVE_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
]);

export class SkillChoiceModal {
  private open = false;
  private cursor = 0;
  private opts: SkillChoiceOptions | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(opts: SkillChoiceOptions): void {
    this.opts = opts;
    this.cursor = 0;
    this.open = true;
    this.root.style.display = "block";
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  /** キーを処理したら true。選ぶまでは常にtrueを返し、他の入力を一切通さない */
  handleKey(code: string): boolean {
    if (!this.open) return false;
    const candidates = this.opts?.candidates ?? [];

    if (MOVE_CODES.has(code)) {
      this.cursor = wrap(this.cursor + 1, candidates.length);
      this.render();
      return true;
    }
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
      const id = candidates[this.cursor];
      const opts = this.opts;
      if (id && opts) {
        this.hide();
        opts.onChoose(id);
      }
      return true;
    }
    return true; // Escapeを含め、選ぶまでは他のキーを無効にする
  }

  private render(): void {
    this.root.replaceChildren();

    this.root.appendChild(createMenuTitle("レベルアップ! スキルを選ぶ"));

    const candidates = this.opts?.candidates ?? [];
    const list = createMenuList();
    candidates.forEach((id, index) => {
      const li = document.createElement("li");
      li.textContent = RUN_SKILLS[id].name;
      if (index === this.cursor) li.classList.add("selected");
      list.appendChild(li);
    });
    this.root.appendChild(list);

    const current = candidates[this.cursor];
    if (current) this.root.appendChild(createMenuDesc(RUN_SKILLS[current].description));

    this.root.appendChild(createMenuHint("↑↓ 選ぶ / Enter 決定"));
  }
}
