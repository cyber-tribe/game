import * as THREE from "three";
import type { DamageFx } from "./stage";
import { MAX_SATIETY, type PlayerState, expToNext } from "../entities/player";
import { STATUS_CONFUSE, STATUS_SLEEP, hasStatus } from "../core/types";

const MAX_LOG_LINES = 6;

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
    this.logEl = must(root, "#log");
    this.fxLayer = must(root, "#fx");
    this.overlayEl = must(root, "#overlay");
  }

  update(player: PlayerState, depth: number): void {
    this.depthEl.textContent = `地下 ${depth} 階`;
    this.levelEl.textContent = `Lv ${player.level}`;

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
    this.expEl.textContent = next === null ? "経験値 最大" : `次のLvまで ${next}`;

    const statuses: string[] = [];
    if (hasStatus(player, STATUS_SLEEP)) statuses.push("ねむり");
    if (hasStatus(player, STATUS_CONFUSE)) statuses.push("こんらん");
    this.statusEl.textContent = statuses.join(" / ");
    this.statusEl.style.display = statuses.length > 0 ? "block" : "none";
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

  showOverlay(title: string, detail: string, hint: string): void {
    this.overlayEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "overlay-box";
    const h = document.createElement("h2");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = detail;
    const small = document.createElement("p");
    small.className = "hint";
    small.textContent = hint;
    box.append(h, p, small);
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = "flex";
  }

  hideOverlay(): void {
    this.overlayEl.style.display = "none";
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
