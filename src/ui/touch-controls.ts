import { ATTACK_KEY_CODE, type Input } from "../view/input";

/**
 * タッチ操作(plan/touch-controls.md)。`Input.held`/`pending`はキーコードの
 * 中身を問わないため、仮想パッド・ボタンはキーボードと同じコード
 * ("ArrowUp"・"Space"等)を`Input.press`/`release`へ渡すだけで済み、
 * `src/core`・`src/game.ts`には一切手を入れていない。
 *
 * `plan/attack-button.md`(専用の攻撃キー)対応: パッドでの移動は敵の方向へ
 * 進むと「押し出し」になり(攻撃ではない)、常時表示のアクションボタン群に
 * 攻撃専用ボタン(`ATTACK_KEY_CODE`)を新設した。攻撃はプレイヤーが向いている
 * 方向へその場から動かず繰り出す。
 */

const DEAD_ZONE_RADIUS = 18;
const PAD_MAX_RADIUS = 46;
/** ドラッグ量(px)がこれを超えるたびに、視点回転を1段スナップさせる */
const ROTATE_STEP_PX = 64;
/** つまむ距離(px)がこれだけ変わるたびに、ズームを1段動かす */
const PINCH_STEP_PX = 48;

/** 8方向を、押しっぱなしにするキーコードの組で表す(Input.direction()がそのまま解釈する) */
const DIR_CODES: readonly (readonly string[])[] = [
  ["ArrowUp"], // N
  ["ArrowUp", "ArrowRight"], // NE
  ["ArrowRight"], // E
  ["ArrowDown", "ArrowRight"], // SE
  ["ArrowDown"], // S
  ["ArrowDown", "ArrowLeft"], // SW
  ["ArrowLeft"], // W
  ["ArrowUp", "ArrowLeft"], // NW
];

function dirCodesFor(dx: number, dy: number): readonly string[] {
  const angle = Math.atan2(dx, -dy); // 0 = 上、時計回り
  const sector = Math.round(angle / (Math.PI / 4)) & 7;
  return DIR_CODES[sector]!;
}

/**
 * 一度きりの操作(タップ)。押してすぐ離すのと同じ扱い。
 *
 * 実際のキーボードのkeydownと同じく、まず`Input.onKey`(もちもの・
 * めざめの階段の確認モーダル等、既存メニューの横取り口)に渡す。
 * 何らかのメニューが開いていればそちらが処理するため、タップした
 * ボタンがどの場面でも(例: 確認モーダルが開いているときに「決定」を
 * タップする、等)キーボードと同じように振る舞う
 */
function tap(input: Input, code: string): void {
  if (input.onKey?.(code, false)) return;
  input.press(code);
  input.release(code);
}

/**
 * 仮想パッドの方向入力を、前回の方向コード`prev`から`next`へ移す。
 *
 * 増えたぶんのコードは、アクションボタンのタップ(`tap`)と同じくまず
 * `Input.onKey`へ渡す。メニューが開いていればそちらがカーソル移動として
 * 消費するので、盤面用の`held`(押しっぱなし)には入れない。メニューが
 * 無ければ`onKey`はfalseを返すので、従来どおり`press`に落ちる。これで
 * 同じパッドが「メニュー中はカーソル、ダイブ中は移動」を兼ねる。
 *
 * 差分の基準に使うのは(実際にpressできたぶんではなく)要求された方向
 * `next`そのもの。倒しっぱなしのあいだ`pointermove`は何度も飛んでくるが、
 * 方向が変わらない限り「増えたぶん」は無くなるので、カーソルは倒すたびに
 * 1つだけ動く。押していないコードへの`release`は`held`から消すだけの
 * 空振りなので、メニューに吸われたコードを別途覚えておく必要はない。
 */
export function applyPadDirCodes(
  input: Input,
  prev: readonly string[],
  next: readonly string[],
): readonly string[] {
  for (const code of prev) {
    if (!next.includes(code)) input.release(code);
  }
  for (const code of next) {
    if (prev.includes(code)) continue;
    if (input.onKey?.(code, false)) continue;
    input.press(code);
  }
  return next;
}

/** クリック/タップの両方で一度きりの操作を割り当てる。要素自体もタップ判定を邪魔しないようにする */
function bindTap(el: HTMLElement, code: string, input: Input, onAfter?: () => void): void {
  el.style.touchAction = "none";
  el.addEventListener("click", (e) => {
    e.preventDefault();
    tap(input, code);
    onAfter?.();
  });
}

export class TouchControls {
  private readonly padKnob: HTMLElement;
  private readonly menu: HTMLElement;

  private padPointerId: number | null = null;
  private padOrigin: { x: number; y: number } | null = null;
  private padDragCodes: readonly string[] = [];
  private padLeftDeadZone = false;

  private rotatePointerId: number | null = null;
  private rotateStartX = 0;

  private readonly pinchPointers = new Map<number, { x: number; y: number }>();
  private pinchBaseDist: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly input: Input,
    /**
     * 「ログ」メニュー項目(plan/game/mobile-layout-redesign.md)専用。既存の
     * data-code方式(キーコードへ変換してInputへ渡すだけ)には乗らない、
     * 全文ログモーダルを開くというHUD側の操作なので、コールバックで直接つなぐ
     */
    private readonly onOpenLog: () => void,
  ) {
    this.root.innerHTML = `
      <div class="touch-pad" id="touchPad">
        <div class="touch-pad-knob"></div>
      </div>
      <div class="touch-actions">
        <button type="button" class="touch-btn touch-btn-attack" data-code="${ATTACK_KEY_CODE}">攻撃</button>
        <button type="button" class="touch-btn" data-code="KeyF">タル</button>
        <button type="button" class="touch-btn" data-code="KeyG">投げる</button>
        <button type="button" class="touch-btn" data-code="KeyI">道具</button>
        <button type="button" class="touch-btn touch-btn-confirm" data-code="Space">決定</button>
      </div>
      <button type="button" class="touch-menu-btn">≡</button>
      <div class="touch-menu" style="display:none">
        <button type="button" data-code="KeyT">仲間へ指示</button>
        <button type="button" data-code="KeyC">樽守りの技</button>
        <button type="button" data-code="KeyR">区切り/再挑戦</button>
        <button type="button" data-code="KeyP">フォトモード</button>
        <button type="button" data-code="KeyH">操作説明</button>
        <button type="button" data-action="log">ログ</button>
      </div>
    `;

    this.padKnob = this.root.querySelector<HTMLElement>(".touch-pad-knob")!;
    this.menu = this.root.querySelector<HTMLElement>(".touch-menu")!;

    this.wirePad();
    this.wireActionButtons();
    this.wireMenu();
    this.wireGestures();

    // タッチ操作中の誤発動防止(plan/game/archive/touch-gesture-guard.md):
    // パッド・ボタンの長押しでiOSの選択/コンテキストメニューが出るのを防ぐ
    this.root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private wirePad(): void {
    const pad = this.root.querySelector<HTMLElement>(".touch-pad")!;
    pad.style.touchAction = "none";

    pad.addEventListener("pointerdown", (e) => {
      if (this.padPointerId !== null) return;
      pad.setPointerCapture(e.pointerId);
      this.padPointerId = e.pointerId;
      this.padOrigin = { x: e.clientX, y: e.clientY };
      this.padDragCodes = [];
      this.padLeftDeadZone = false;
    });

    pad.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.padPointerId || !this.padOrigin) return;
      const dx = e.clientX - this.padOrigin.x;
      const dy = e.clientY - this.padOrigin.y;
      const dist = Math.hypot(dx, dy);

      const clamped = Math.min(dist, PAD_MAX_RADIUS);
      const knobScale = dist === 0 ? 0 : clamped / dist;
      this.padKnob.style.transform = `translate(${dx * knobScale}px, ${dy * knobScale}px)`;

      const nextCodes = dist < DEAD_ZONE_RADIUS ? [] : dirCodesFor(dx, dy);
      if (dist >= DEAD_ZONE_RADIUS) this.padLeftDeadZone = true;
      this.setDirCodes(nextCodes);
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.padPointerId) return;
      this.setDirCodes([]);
      this.padKnob.style.transform = "";
      // パッドの中央から動かさずに離した = その場で待つ、というタップ扱いにする
      // (plan/touch-controls.mdが軸とした案。連打防止のため1タップにつき1回だけ)
      if (!this.padLeftDeadZone) tap(this.input, "Period");
      this.padPointerId = null;
      this.padOrigin = null;
    };
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
  }

  private setDirCodes(next: readonly string[]): void {
    this.padDragCodes = applyPadDirCodes(this.input, this.padDragCodes, next);
  }

  private wireActionButtons(): void {
    this.root.querySelectorAll<HTMLElement>(".touch-btn").forEach((btn) => {
      const code = btn.dataset.code!;
      bindTap(btn, code, this.input);
    });
  }

  private wireMenu(): void {
    const toggle = this.root.querySelector<HTMLElement>(".touch-menu-btn")!;
    toggle.style.touchAction = "none";
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      this.menu.style.display = this.menu.style.display === "none" ? "flex" : "none";
    });

    this.menu.querySelectorAll<HTMLElement>("button[data-code]").forEach((btn) => {
      const code = btn.dataset.code!;
      bindTap(btn, code, this.input, () => {
        this.menu.style.display = "none";
      });
    });

    // 「ログ」(plan/game/mobile-layout-redesign.md): 他の項目と違いキーコードが無いので、
    // 直接コールバックを呼ぶだけの専用配線にする
    const logBtn = this.menu.querySelector<HTMLElement>('button[data-action="log"]')!;
    logBtn.style.touchAction = "none";
    logBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.menu.style.display = "none";
      this.onOpenLog();
    });
  }

  /** 視点回転(1本指ドラッグ)・ズーム(2本指ピンチ)。ビューポート上での操作なので、盤面の3D描画に直接触れず既存のキーへ変換する */
  private wireGestures(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pinchPointers.size === 1 && this.rotatePointerId === null) {
        this.rotatePointerId = e.pointerId;
        this.rotateStartX = e.clientX;
      } else if (this.pinchPointers.size === 2) {
        // 2本目が触れた時点で回転は打ち切り、ピンチに切り替える
        this.rotatePointerId = null;
        this.pinchBaseDist = this.currentPinchDistance();
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !this.pinchPointers.has(e.pointerId)) return;
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pinchPointers.size >= 2) {
        const dist = this.currentPinchDistance();
        if (dist !== null && this.pinchBaseDist !== null) {
          const delta = dist - this.pinchBaseDist;
          if (Math.abs(delta) >= PINCH_STEP_PX) {
            tap(this.input, delta > 0 ? "Equal" : "Minus");
            this.pinchBaseDist = dist;
          }
        }
        return;
      }

      if (this.rotatePointerId === e.pointerId) {
        const delta = e.clientX - this.rotateStartX;
        if (Math.abs(delta) >= ROTATE_STEP_PX) {
          tap(this.input, delta > 0 ? "KeyE" : "KeyQ");
          this.rotateStartX = e.clientX;
        }
      }
    });

    const release = (e: PointerEvent) => {
      this.pinchPointers.delete(e.pointerId);
      if (this.rotatePointerId === e.pointerId) this.rotatePointerId = null;
      if (this.pinchPointers.size < 2) this.pinchBaseDist = null;
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
  }

  private currentPinchDistance(): number | null {
    if (this.pinchPointers.size < 2) return null;
    const [a, b] = [...this.pinchPointers.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y);
  }
}
