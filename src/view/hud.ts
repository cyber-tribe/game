import * as THREE from "three";
import type { DamageFx } from "./stage";
import { displayActorName } from "../entities/naming";
import { ALLY_STANCE_NAMES, BARREL_NAMES } from "../entities/displayNames";
import { MAX_SATIETY, type PlayerState, expToNext } from "../entities/player";
import { t, type LocaleKey } from "../i18n";
import type { CaptureOutlook, CaptureTier } from "../game";
import {
  BANNER_FADE_MS,
  bannerVisible,
  fadeBanner,
  showBanner,
  type BannerState,
  INITIAL_BANNER_STATE,
} from "../entities/messageBanner";
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
 * 全文ログ(タッチ「≡」→ログの全画面モーダル、plan/game/mobile-layout-redesign.md)の
 * 保持上限。MAX_LOG_LINES(デスクトップの縦長ログパネル・バグ報告用recentLog)とは
 * 別枠で持ち、そちら側の挙動は変えない
 */
const MAX_FULL_LOG_LINES = 300;

/** 全画面のお知らせに添えるボタン(plan/game/gameover-touch-return.md) */
export interface OverlayAction {
  label: string;
  onSelect: () => void;
}

/**
 * 色だけに頼らない状態異常表示(plan/difficulty-modes.md アクセシビリティ節)。
 * 記号(形)とラベルの両方で区別し、色の識別に頼らない
 */
const STATUS_DISPLAY: Partial<Record<StatusKind, string>> = {
  [STATUS_SLEEP]: "◐ねむり",
  [STATUS_CONFUSE]: "✳こんらん",
  [STATUS_SEAL]: "◆封じ",
};

/**
 * 捕獲の入りやすさ3段階の表示(plan/game/barrel-capture-clarity.md)。
 * 状態異常表示と同じく、色だけでなく記号(◎○△)でも区別できるようにしてある
 */
const CAPTURE_TIER_LABELS: Record<CaptureTier, LocaleKey> = {
  likely: "hud.captureTier.likely",
  even: "hud.captureTier.even",
  hard: "hud.captureTier.hard",
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
  private readonly captureEl: HTMLElement;
  private readonly alliesEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly fxLayer: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly lines: string[] = [];

  // メッセージ帯(タッチ専用、plan/game/mobile-layout-redesign.md)
  private readonly fullLines: string[] = [];
  private readonly bannerEl: HTMLElement;
  private bannerState: BannerState = INITIAL_BANNER_STATE;
  private bannerFadeTimer: ReturnType<typeof setTimeout> | null = null;
  /** モーダルが開いているあいだ帯を伏せる(issue #461)。main.tsが毎フレーム教える */
  private bannerModalOpen = false;

  // 全文ログモーダル(「≡」→ログ、同上)
  private readonly logModalEl: HTMLElement;
  private readonly logModalListEl: HTMLElement;
  private logModalOpen = false;

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
    this.captureEl = must(root, "#hud-capture");
    this.alliesEl = must(root, "#allies");
    this.logEl = must(root, "#log");
    this.fxLayer = must(root, "#fx");
    this.overlayEl = must(root, "#overlay");
    this.bannerEl = must(root, "#logBanner");
    this.logModalEl = must(root, "#logModal");
    this.logModalListEl = must(root, "#logModalList");
    // 多言語対応の土台(plan/i18n-foundation.md): HTML側に直書きしていた見出しをt()で差し替える
    must(root, "#hud-hp-label").textContent = t("ui.hud.hp");
    must(root, "#hud-satiety-label").textContent = t("ui.hud.satiety");
    must(root, "#logModalTitle").textContent = t("ui.hud.logModalTitle");
    const closeBtn = must(root, "#logModalClose");
    closeBtn.textContent = t("ui.hud.logModalClose");
    closeBtn.addEventListener("click", () => this.hideLogModal());
    // 背景(#logModal自身)をタップしても閉じる。中身の箱側でクリックを止め、
    // 誤ってその上をタップしても閉じないようにする
    this.logModalEl.addEventListener("click", () => this.hideLogModal());
    must(root, "#logModalBox").addEventListener("click", (e) => e.stopPropagation());
  }

  /**
   * @param captureOutlook 空のタルを抱えているときの、投げ先のモンスターの
   *   入りやすさ(plan/game/barrel-capture-clarity.md)。null なら何も出さない
   */
  update(
    player: PlayerState,
    depth: number,
    allies: readonly AllyActor[] = [],
    captureOutlook: CaptureOutlook | null = null,
    /**
     * 仲間のレベルアップ・ゆめわざ習得(plan/game/archive/companion-leveling-and-arts.md)。
     * ここに含まれるidの行にだけ、一瞬光るCSSクラスを立てる
     */
    highlightAllyIds: ReadonlySet<number> = new Set(),
  ): void {
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

    // 捕獲の見込み(plan/game/barrel-capture-clarity.md)。空のタルを抱えて
    // モンスターに向いているあいだだけ、対象名の横に3段階の目安を出す
    if (captureOutlook) {
      this.captureEl.textContent = t("hud.captureOutlook", {
        name: captureOutlook.name,
        tier: t(CAPTURE_TIER_LABELS[captureOutlook.tier]),
      });
      this.captureEl.dataset.tier = captureOutlook.tier;
      this.captureEl.style.display = "block";
    } else {
      this.captureEl.style.display = "none";
    }

    this.renderAllies(allies, highlightAllyIds);
  }

  private renderAllies(allies: readonly AllyActor[], highlightAllyIds: ReadonlySet<number>): void {
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
      // 1体ぶんを入れ物で包む(issue #552)。タッチ端末のCSSがこの入れ物を
      // flex行にして「名前+小さなHPバー」の1行へ圧縮する。デスクトップは
      // 中身がブロックのまま縦に積まれるので見た目は変わらない
      const box = document.createElement("div");
      box.className = "ally";
      // 仲間のレベルアップ・ゆめわざ習得(plan/game/archive/companion-leveling-and-arts.md):
      // 一瞬光らせる。DOMは毎回作り直すので、クラスを立てるだけでCSSの
      // アニメーションが最初から再生される(JS側でタイマーを持つ必要が無い)
      if (highlightAllyIds.has(ally.id)) box.classList.add("ally-flash");
      box.append(row, bar, stance);

      const allyStatuses = activeStatusLabels(ally);
      if (allyStatuses.length > 0) {
        const status = document.createElement("div");
        status.className = "ally-status";
        status.textContent = allyStatuses.join(" / ");
        box.append(status);
      }
      this.alliesEl.append(box);
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

    // メッセージ帯・全文ログ(タッチ専用、plan/game/mobile-layout-redesign.md)。
    // デスクトップの#log(上のthis.lines)とは別枠の履歴を持つ
    this.fullLines.push(text);
    while (this.fullLines.length > MAX_FULL_LOG_LINES) this.fullLines.shift();
    this.bannerState = showBanner(this.fullLines);
    this.renderBanner();
    this.resetBannerFadeTimer();
    if (this.logModalOpen) this.renderLogModal();
  }

  private renderBanner(): void {
    this.bannerEl.replaceChildren(
      ...this.bannerState.lines.map((line, index, arr) => {
        const div = document.createElement("div");
        div.textContent = line;
        // 最新行だけ強調し、古い行は薄くする(デスクトップの#logと同じ考え方)
        div.style.opacity = index === arr.length - 1 ? "1" : "0.6";
        return div;
      }),
    );
    // `faded`は「見せない状態」を表すクラス。フェード満了だけでなく、
    // モーダルで伏せているあいだも同じ見た目(opacity: 0)にする
    this.bannerEl.classList.toggle("faded", !bannerVisible(this.bannerState, this.bannerModalOpen));
  }

  /**
   * モーダル(もちもの・指示・技・確認・拠点・命名)の開閉を受け取る。
   * 毎フレーム呼ばれるので、変化が無ければ何もしない。
   *
   * 伏せているあいだはフェードの計測を止める。モーダルを見ているうちに
   * 4秒を使い切ってしまうと、閉じた時点ではもう消えていて「装備した」等の
   * 直前のメッセージが一度も読めないため。閉じたらそこから数え直す
   */
  setBannerModalOpen(open: boolean): void {
    if (open === this.bannerModalOpen) return;
    this.bannerModalOpen = open;
    if (open) {
      this.clearBannerFadeTimer();
    } else if (!this.bannerState.faded) {
      this.resetBannerFadeTimer();
    }
    this.renderBanner();
  }

  /**
   * 無操作でのフェードアウト(plan/game/mobile-layout-redesign.md、未決事項への回答:
   * 3〜5秒案のうち中間の4秒を採用。実装ノート参照)。新しいメッセージが来るたびに
   * タイマーを取り消して積み直す
   */
  private resetBannerFadeTimer(): void {
    this.clearBannerFadeTimer();
    // モーダルで伏せているあいだは数えない。閉じたときにsetBannerModalOpenが
    // 積み直すので、閉じた瞬間からあらためて4秒見せられる
    if (this.bannerModalOpen) return;
    this.bannerFadeTimer = setTimeout(() => {
      this.bannerState = fadeBanner(this.bannerState);
      this.renderBanner();
    }, BANNER_FADE_MS);
  }

  private clearBannerFadeTimer(): void {
    if (this.bannerFadeTimer === null) return;
    clearTimeout(this.bannerFadeTimer);
    this.bannerFadeTimer = null;
  }

  /** 全文ログモーダル(「≡」→ログ)を開く。開いている間は最新の行を末尾に表示しスクロールする */
  showLogModal(): void {
    this.logModalOpen = true;
    this.renderLogModal();
    this.logModalEl.classList.add("open");
  }

  hideLogModal(): void {
    this.logModalOpen = false;
    this.logModalEl.classList.remove("open");
  }

  private renderLogModal(): void {
    this.logModalListEl.replaceChildren(
      ...this.fullLines.map((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
      }),
    );
    this.logModalListEl.scrollTop = this.logModalListEl.scrollHeight;
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
   * 全画面のお知らせ。`action`を渡すと、押せるボタンを1つ添える。
   *
   * このオーバーレイは`inset: 0`・`pointer-events: auto`で画面全体を覆うため、
   * 下にあるタッチUI(仮想パッド・「≡」メニュー)へのタップをすべて奪う。
   * キーボードの案内文だけを出していると、タッチ端末では拠点に戻る手段が
   * 1つも無くなり詰んでしまう(plan/game/gameover-touch-return.md)。
   * ボタンはキーと同じ処理を呼ぶだけで、新しい戻り方は作らない
   */
  showOverlay(title: string, detail: string, hint: string, action?: OverlayAction): void {
    this.overlayEl.innerHTML = "";
    // showKeyHelp()がタップ閉じ用に残したハンドラが、次にこのオーバーレイを
    // 使い回すときまで残っていると、意図せず閉じてしまう(タップしても
    // finish()側の「拠点へ戻る」処理は通らないので中途半端な状態になる)
    this.overlayEl.onclick = null;
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
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "overlay-button";
      button.textContent = action.label;
      button.addEventListener("click", () => action.onSelect());
      box.appendChild(button);
    }
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = "flex";
  }

  hideOverlay(): void {
    this.overlayEl.style.display = "none";
    this.overlayEl.onclick = null;
  }

  /**
   * 操作の一括確認(plan/difficulty-modes.md アクセシビリティ節)。
   * 現在使っているキー配置をいつでも呼び出せるようにする。
   * `hint`(閉じ方の案内)は呼び出し側(main.ts)がタッチ/キーボードで
   * 出し分けたものを渡す(plan/game/mobile-layout-redesign.md、文言のタッチ対応。
   * hud.tsはui層のmatchMedia判定に依存しないため、ここでは受け取るだけにする)。
   * `onClose`を渡すと、この全画面オーバーレイ自体をタップしても閉じられる
   * ようにする。タッチ端末では「≡」ボタン自体がオーバーレイの下に隠れて
   * 押せなくなる(plan/game/mobile-layout-redesign.md、タップで閉じられない
   * と行き止まりになるため必須)。デスクトップでは物理Hキーで閉じられる
   * ため、main.ts側はタッチのときだけ渡す想定(渡さなければ従来どおり
   * クリックしても何も起きない)
   */
  showKeyHelp(lines: readonly string[], hint: string = t("hud.keyHelpHint"), onClose?: () => void): void {
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
    const hintEl = document.createElement("p");
    hintEl.className = "hint";
    hintEl.textContent = hint;
    box.appendChild(hintEl);
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = "flex";
    this.overlayEl.onclick = onClose ? () => onClose() : null;
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
