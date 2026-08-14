import * as THREE from "three";
import type { DamageFx } from "./stage";
import { displayActorName } from "../entities/naming";
import { ALLY_STANCE_NAMES, BARREL_NAMES } from "../entities/displayNames";
import { MAX_SATIETY, type PlayerState, expToNext } from "../entities/player";
import { t } from "../i18n";
import {
  STATUS_CONFUSE,
  STATUS_SEAL,
  STATUS_SLEEP,
  type Actor,
  type AllyActor,
  type StatusKind,
  hasStatus,
} from "../core/types";

const MAX_LOG_LINES = 6;

/**
 * 色だけに頼らない状態異常表示(plan/difficulty-modes.md アクセシビリティ節)。
 * 記号(形)とラベルの両方で区別し、色の識別に頼らない
 */
const STATUS_DISPLAY: Partial<Record<StatusKind, string>> = {
  [STATUS_SLEEP]: "◐ねむり",
  [STATUS_CONFUSE]: "✳こんらん",
  [STATUS_SEAL]: "◆封じ",
};

export function activeStatusLabels(actor: Actor): string[] {
  return (Object.keys(STATUS_DISPLAY) as StatusKind[])
    .filter((kind) => hasStatus(actor, kind))
    .map((kind) => STATUS_DISPLAY[kind]!);
}

/**
 * 画面まわりの表示。3D の上に重ねた DOM で作る。
 * 文字は DOM のほうが圧倒的に読みやすく、レイアウトも素直に書ける。
 */
export class Hud {
  private readonly depthEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly hpTextEl: HTMLElement;
  private readonly hpFillEl: HTMLElement;
  private readonly satietyFillEl: HTMLElement;
  private readonly satietyTextEl: HTMLElement;
  private readonly expEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly carryEl: HTMLElement;
  private readonly alliesEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly fxLayer: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly lines: string[] = [];

  constructor(private readonly root: HTMLElement) {
    this.depthEl = must(root, "#hud-depth");
    this.levelEl = must(root, "#hud-level");
    this.hpTextEl = must(root, "#hud-hp-text");
    this.hpFillEl = must(root, "#hud-hp-fill");
    this.satietyFillEl = must(root, "#hud-satiety-fill");
    this.satietyTextEl = must(root, "#hud-satiety-text");
    this.expEl = must(root, "#hud-exp");
    this.statusEl = must(root, "#hud-status");
    this.carryEl = must(root, "#hud-carry");
    this.alliesEl = must(root, "#allies");
    this.logEl = must(root, "#log");
    this.fxLayer = must(root, "#fx");
    this.overlayEl = must(root, "#overlay");
    // 多言語対応の土台(plan/i18n-foundation.md): HTML側に直書きしていた見出しをt()で差し替える
    must(root, "#hud-hp-label").textContent = t("ui.hud.hp");
    must(root, "#hud-satiety-label").textContent = t("ui.hud.satiety");
  }

  update(player: PlayerState, depth: number, allies: readonly AllyActor[] = []): void {
    this.depthEl.textContent = t("hud.depth", { depth });
    this.levelEl.textContent = t("hud.level", { level: player.level });

    const hpRatio = Math.max(0, player.hp) / player.maxHp;
    this.hpTextEl.textContent = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    this.hpFillEl.style.width = `${hpRatio * 100}%`;
    this.hpFillEl.dataset.level = hpRatio < 0.25 ? "danger" : hpRatio < 0.5 ? "warn" : "ok";

    const satietyRatio = player.satiety / MAX_SATIETY;
    this.satietyFillEl.style.width = `${satietyRatio * 100}%`;
    this.satietyTextEl.textContent = `${Math.ceil(player.satiety)}`;
    this.satietyFillEl.dataset.level =
      satietyRatio <= 0 ? "danger" : satietyRatio < 0.2 ? "warn" : "ok";

    const next = expToNext(player);
    this.expEl.textContent = next === null ? t("hud.expMax") : t("hud.expToNext", { next });

    const statuses = activeStatusLabels(player);
    this.statusEl.textContent = statuses.join(" / ");
    this.statusEl.style.display = statuses.length > 0 ? "block" : "none";

    // 抱えているタル。何を持っているかで投げた結果がまるで変わるので常に出す
    if (player.carrying) {
      this.carryEl.textContent = t("hud.carrying", { name: BARREL_NAMES[player.carrying.kind] });
      this.carryEl.dataset.kind = player.carrying.kind;
      this.carryEl.style.display = "block";
    } else {
      this.carryEl.style.display = "none";
    }

    this.renderAllies(allies);
  }

  private renderAllies(allies: readonly AllyActor[]): void {
    if (allies.length === 0) {
      this.alliesEl.style.display = "none";
      return;
    }
    this.alliesEl.style.display = "block";
    this.alliesEl.replaceChildren();

    const title = document.createElement("div");
    title.className = "allies-title";
    title.textContent = t("hud.alliesTitle");
    this.alliesEl.appendChild(title);

    for (const ally of allies) {
      const row = document.createElement("div");
      row.className = "ally-row";

      const name = document.createElement("span");
      name.className = "ally-name";
      name.textContent = displayActorName(ally);

      const hp = document.createElement("span");
      hp.className = "ally-hp";
      hp.textContent = `${Math.max(0, ally.hp)} / ${ally.maxHp}`;

      const bar = document.createElement("div");
      bar.className = "ally-bar";
      const fill = document.createElement("i");
      fill.setAttribute("aria-hidden", "true"); // 隣のHPテキストと重複するので、読み上げからは隠す
      const ratio = Math.max(0, ally.hp) / ally.maxHp;
      fill.style.width = `${ratio * 100}%`;
      fill.dataset.level = ratio < 0.3 ? "danger" : ratio < 0.6 ? "warn" : "ok";
      bar.appendChild(fill);

      const stance = document.createElement("div");
      stance.className = "ally-stance";
      stance.textContent = t("hud.stance", { name: ALLY_STANCE_NAMES[ally.stance ?? "free"] });

      row.append(name, hp);
      this.alliesEl.append(row, bar, stance);

      const allyStatuses = activeStatusLabels(ally);
      if (allyStatuses.length > 0) {
        const status = document.createElement("div");
        status.className = "ally-status";
        status.textContent = allyStatuses.join(" / ");
        this.alliesEl.append(status);
      }
    }
  }

  /** バグ報告ボタン(plan/bug-report-button.md)向け。直近のログをそのまま読む */
  get recentLog(): readonly string[] {
    return this.lines;
  }

  log(text: string): void {
    this.lines.push(text);
    while (this.lines.length > MAX_LOG_LINES) this.lines.shift();
    this.logEl.replaceChildren(
      ...this.lines.map((line, index) => {
        const div = document.createElement("div");
        div.textContent = line;
        // 古い行ほど薄くして、最新の行に目が行くようにする
        div.style.opacity = String(0.35 + (0.65 * (index + 1)) / this.lines.length);
        return div;
      }),
    );
  }

  /** ダメージや回復の数字を、対象の頭上に浮かせて流す */
  spawnDamage(fx: DamageFx, camera: THREE.Camera, canvas: HTMLElement): void {
    const projected = fx.world.clone().project(camera);
    if (projected.z > 1) return;
    const rect = canvas.getBoundingClientRect();
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;

    const el = document.createElement("div");
    el.className = "damage";
    if (fx.heal) el.classList.add("heal");
    if (fx.critical) el.classList.add("critical");
    el.textContent = fx.heal ? `+${fx.amount}` : `${fx.amount}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.fxLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  /**
   * 力尽きた・踏破・樽比べ終了の各オーバーレイ(plan/game/archive/gameover-touch-return.md)。
   * onReturnはRキーと全く同じ処理経路(App.handleGlobalAction("restart"))を渡してもらい、
   * ここでは新しい戻り方を作らずボタンのクリックからそれを呼ぶだけにする
   */
  showOverlay(title: string, detail: string, hint: string, onReturn: () => void): void {
    this.overlayEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "overlay-box";
    const h = document.createElement("h2");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = detail;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overlay-return-button";
    button.textContent = t("hud.overlayReturn");
    button.addEventListener("click", onReturn);
    const small = document.createElement("p");
    small.className = "hint";
    small.textContent = hint;
    box.append(h, p, button, small);
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = "flex";
  }

  hideOverlay(): void {
    this.overlayEl.style.display = "none";
  }

  /**
   * 操作の一括確認(plan/difficulty-modes.md アクセシビリティ節)。
   * 現在使っているキー配置をいつでも呼び出せるようにする
   */
  showKeyHelp(lines: readonly string[]): void {
    this.overlayEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "overlay-box";
    const h = document.createElement("h2");
    h.textContent = t("hud.keyHelpTitle");
    box.appendChild(h);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      box.appendChild(p);
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = t("hud.keyHelpHint");
    box.appendChild(hint);
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = "flex";
  }

  get element(): HTMLElement {
    return this.root;
  }
}

function must(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`HUD の要素が見つからない: ${selector}`);
  return el;
}
