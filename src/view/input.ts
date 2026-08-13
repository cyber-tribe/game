import type { Dir } from "../core/grid";

export type ActionKey =
  | "confirm"
  | "wait"
  | "inventory"
  | "cancel"
  | "restart"
  | "rotateLeft"
  | "rotateRight"
  | "zoomIn"
  | "zoomOut"
  | "liftBarrel"
  | "throwBarrel"
  /** 向いている方向へ攻撃する。移動しない(plan/attack-button.md) */
  | "attack"
  /** 仲間への指示(構え)メニューを開く */
  | "orders"
  /** 樽守りの技メニューを開く */
  | "arts"
  /** フォトモード(plan/gallery-mode.md)の切り替え */
  | "photoMode"
  /** 操作説明の表示切り替え(plan/difficulty-modes.md アクセシビリティ節) */
  | "help";

/** テンキーはそのまま8方向に対応する。5は足踏み */
const NUMPAD_DIRS: Record<string, Dir> = {
  Numpad8: 0,
  Numpad9: 1,
  Numpad6: 2,
  Numpad3: 3,
  Numpad2: 4,
  Numpad1: 5,
  Numpad4: 6,
  Numpad7: 7,
};

/** 上の表を毎フレーム Object.entries し直さずに済ませるための控え */
const NUMPAD_DIR_ENTRIES: readonly (readonly [string, Dir])[] = Object.entries(NUMPAD_DIRS) as [
  string,
  Dir,
][];

/** 北を 0 として時計回りに並べた 8 方向。キーは "dx,dy" */
const DIR_BY_DELTA: Record<string, Dir> = {
  "0,-1": 0,
  "1,-1": 1,
  "1,0": 2,
  "1,1": 3,
  "0,1": 4,
  "-1,1": 5,
  "-1,0": 6,
  "-1,-1": 7,
};

const AXIS_KEYS = {
  north: ["ArrowUp", "KeyW"],
  south: ["ArrowDown", "KeyS"],
  west: ["ArrowLeft", "KeyA"],
  east: ["ArrowRight", "KeyD"],
} as const;

/**
 * 攻撃専用キー(plan/attack-button.md)。WASD移動クラスタの近くにある
 * 未使用キーから選んだ(README操作表・plan/attack-button.mdのアーカイブ
 * 注記に選定理由を記載)。`tools/playtest.mjs`・`src/main.ts`のデバッグ
 * 用ヘルパーからも参照するため、リテラルをここでexportしておく
 */
export const ATTACK_KEY_CODE = "KeyX";

/**
 * 一歩とダッシュを分けるしきい値(秒)。plan/step-movement-and-dash.md。
 * 方向キーをこの秒数未満で離せば1マスだけ進んで止まり(タップ)、これ以上
 * 押し続けると現状どおりの「押しっぱなしで歩き続ける」ダッシュに移行する。
 * 計画書の目安(250ms)をそのまま採用した。実装時に体感で確かめたが、
 * これより短いとタップのつもりが軽くダッシュへ化けやすく、長いとダッシュの
 * 立ち上がりがもたつく体感だったので、この値を初期値として固定してある
 * (チューニングの余地があるという計画書の注記どおり、この定数1つを
 * 直せば済むようにしてある)
 */
export const DASH_HOLD_THRESHOLD = 0.25;

const ACTION_KEYS: Record<string, ActionKey> = {
  Space: "confirm",
  Enter: "confirm",
  NumpadEnter: "confirm",
  Period: "wait",
  Numpad5: "wait",
  KeyI: "inventory",
  Escape: "cancel",
  KeyR: "restart",
  KeyQ: "rotateLeft",
  KeyE: "rotateRight",
  Equal: "zoomIn",
  Minus: "zoomOut",
  KeyF: "liftBarrel",
  KeyG: "throwBarrel",
  KeyT: "orders",
  KeyC: "arts",
  KeyP: "photoMode",
  KeyH: "help",
  [ATTACK_KEY_CODE]: "attack",
};

/**
 * キー入力。
 *
 * 押しっぱなしで歩き続けられることがこのジャンルでは大事なので、
 * 方向は「今押されているキーの組み合わせ」を毎フレーム見る方式にする。
 * 一度きりの操作(拾う、メニューを開く)は押した瞬間だけ拾う。
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pending: ActionKey[] = [];
  /** メニュー操作を横取りするための受け口 */
  onKey: ((code: string, shift: boolean) => boolean) | null = null;

  // ---- 一歩/ダッシュ(plan/step-movement-and-dash.md) ----------------
  /** 現在計測中の方向。direction() が変わる・null になるたびに計測をやり直す */
  private dashDir: Dir | null = null;
  /** dashDir を押し続けている秒数(update()で積み上げる) */
  private dashHeldFor = 0;
  /** この方向入力ぶんの「一歩」をすでに発行済みか */
  private tapMoveTaken = false;
  /**
   * この方向入力を打ち切り済みか(壁・押し出しでその場に留まった等)。
   * true の間は direction() が変わらない限り、一歩もダッシュも発行しない
   * (cancelDash() 参照)
   */
  private dirBlocked = false;

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (raw) => {
      const event = raw as KeyboardEvent;
      // 命名ダイアログ(plan/companion-naming.md)のtext inputに入力中は、
      // IMEでの日本語入力をそのまま使わせたいので、盤面側の入力処理を素通しする
      if (document.activeElement instanceof HTMLInputElement) return;
      if (event.repeat) return;
      if (this.onKey?.(event.code, event.shiftKey)) {
        event.preventDefault();
        return;
      }
      this.press(event.code);
      if (
        event.code.startsWith("Arrow") ||
        event.code.startsWith("Numpad") ||
        ACTION_KEYS[event.code]
      ) {
        event.preventDefault();
      }
    });

    target.addEventListener("keyup", (raw) => {
      this.release((raw as KeyboardEvent).code);
    });

    // 画面外に出たあいだのキーは押しっぱなし扱いにしない
    // (テスト実行時など window が無い環境では単に何もしない)
    if (typeof window !== "undefined") {
      window.addEventListener("blur", () => this.held.clear());
    }
  }

  /**
   * タッチ操作(plan/touch-controls.md)から、キーボードと同じ`held`/
   * `pending`へ直接注入するための入口。キーコードの中身を問わない
   * `direction()`等の実装はそのままに、仮想パッド・ボタンをキーボードと
   * 同じコード("ArrowUp"・"Space"等)で表現するだけで済む
   */
  press(code: string): void {
    this.held.add(code);
    const action = ACTION_KEYS[code];
    if (action) this.pending.push(action);
  }

  /** タッチの指を離した・ボタンを離したときに呼ぶ */
  release(code: string): void {
    this.held.delete(code);
  }

  /** 今押されている方向。押されていなければ null */
  direction(): Dir | null {
    // ここは毎フレーム呼ばれる。Object.entries や方向表をこの中で作ると
    // 1フレームごとに使い捨ての配列・オブジェクトが積み上がるので、
    // どちらもモジュール定数に出してある
    for (const [code, dir] of NUMPAD_DIR_ENTRIES) {
      if (this.held.has(code)) return dir;
    }
    const north = this.anyHeld(AXIS_KEYS.north);
    const south = this.anyHeld(AXIS_KEYS.south);
    const west = this.anyHeld(AXIS_KEYS.west);
    const east = this.anyHeld(AXIS_KEYS.east);

    const dy = (south ? 1 : 0) - (north ? 1 : 0);
    const dx = (east ? 1 : 0) - (west ? 1 : 0);
    if (dx === 0 && dy === 0) return null;

    return DIR_BY_DELTA[`${dx},${dy}`] ?? null;
  }

  private anyHeld(codes: readonly string[]): boolean {
    for (const code of codes) if (this.held.has(code)) return true;
    return false;
  }

  /**
   * 一歩/ダッシュの計測を1フレームぶん進める。呼び出し側(main.ts)は
   * ロック中・メニュー表示中かに関わらず、毎フレーム欠かさず呼ぶこと
   * (実際にキーを押していた実時間で判定したいので、移動コマンドを
   * 送れない間だけ計測が止まってしまうと、しきい値の意味がずれる)
   */
  update(dt: number): void {
    const dir = this.direction();
    if (dir === null || dir !== this.dashDir) {
      this.dashDir = dir;
      this.dashHeldFor = 0;
      this.tapMoveTaken = false;
      this.dirBlocked = false;
      return;
    }
    this.dashHeldFor += dt;
  }

  /**
   * しきい値(DASH_HOLD_THRESHOLD)を超えて同じ方向を押し続けているか。
   * true のあいだは、押しっぱなしで歩き続ける従来どおりの挙動になる
   */
  isDashing(): boolean {
    return !this.dirBlocked && this.dashDir !== null && this.dashHeldFor >= DASH_HOLD_THRESHOLD;
  }

  /**
   * この方向入力ぶんの「一歩」をまだ発行していなければ、発行済みに
   * 記録して true を返す(呼び出し側はそのまま1回だけ移動コマンドを
   * 送る)。タップ(短く押して離す)がしきい値未満で終わっても必ず
   * 1マスぶん進むのは、この最初の1回のおかげ
   */
  consumeTapMove(): boolean {
    if (this.dirBlocked || this.tapMoveTaken) return false;
    this.tapMoveTaken = true;
    return true;
  }

  /**
   * 移動が壁・押し出し失敗などでその場に留まったとき、呼び出し側から
   * 呼ぶ。以後は同じ方向入力(離すまで)で一歩もダッシュも発行しなく
   * なる。壁に向けてダッシュしても連打状態にならず、モンスターを
   * 押し出した場合もそこでダッシュが止まる(plan/step-movement-and-
   * dash.md の「壁バンプと同じ扱い」を、押し出しにも一律で適用する形)
   */
  cancelDash(): void {
    this.dirBlocked = true;
  }

  /** 向きだけ変えたいとき(Shift を押しながら) */
  get turnOnly(): boolean {
    return this.held.has("ShiftLeft") || this.held.has("ShiftRight");
  }

  /** 移動を急ぎたいとき。歩きっぱなしのときは自然と速くなる */
  get hurrying(): boolean {
    return this.held.has("ShiftLeft") === false && this.direction() !== null;
  }

  /** 一度きりの操作を取り出す。取り出したぶんは消える */
  takeAction(): ActionKey | null {
    return this.pending.shift() ?? null;
  }

  clearPending(): void {
    this.pending.length = 0;
  }
}
