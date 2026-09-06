import { rotateDir, type Dir } from "../core/grid";

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
  /** 抱えている中身を正面(塞がっていれば足元)に放つ(plan/game/archive/barrel-arts.md) */
  | "openBarrel"
  /** 向いている方向へ攻撃する。移動しない(plan/attack-button.md) */
  | "attack"
  /** 仲間への指示(構え)メニューを開く */
  | "orders"
  /** 樽守りの技メニューを開く */
  | "arts"
  /** フォトモード(plan/gallery-mode.md)の切り替え */
  | "photoMode"
  /** 操作説明の表示切り替え(plan/difficulty-modes.md アクセシビリティ節) */
  | "help"
  /**
   * システム系の「≡」メニュー(アクセシビリティ・音・設定)を開く
   * (plan/game/archive/village-scoped-menus.md)。村でもダイブ中でも開ける
   */
  | "systemMenu";

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

/** 方向に関わるキーコードの一覧(タップの取りこぼし対策のtimerを張るかどうかの判定用) */
const DIRECTION_KEY_CODES: ReadonlySet<string> = new Set<string>([
  ...Object.keys(NUMPAD_DIRS),
  ...AXIS_KEYS.north,
  ...AXIS_KEYS.south,
  ...AXIS_KEYS.west,
  ...AXIS_KEYS.east,
]);

/**
 * タップ取りこぼし対策のフォールバックtimer(setTimeout)の遅延(ミリ秒)。
 * 一歩/ダッシュの計測(update(dt))は本来render loop(requestAnimationFrame)
 * 頻度で回る前提だが、自動テスト(tools/auto-tester.mjs)のような重い
 * ソフトウェア描画環境ではrender loopが数百msに1回まで間引かれることがあり、
 * 「短く押してすぐ離す」タップがrender loopの1周も回らないまま完結すると、
 * update()が一度も新しい方向を検知できず、タップが丸ごと失われていた
 * (#745/#746/#747/#748の低確信度レポートの実際の原因。auto-tester.mjs
 * 側の再生ロック待ちを直した#745コメントの修正後も再発し続けていたのは、
 * 原因がロック待ちではなくrender loopの間引きそのものだったため)。
 * render loopに頼らず、setTimeoutで独立にフォールバックすることで、
 * render loopがどれだけ間引かれてもこの遅延の範囲でタップが確定する
 */
const TAP_FALLBACK_DELAY_MS = 80;

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
  KeyV: "openBarrel",
  KeyT: "orders",
  KeyC: "arts",
  KeyP: "photoMode",
  KeyH: "help",
  KeyM: "systemMenu",
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

  /**
   * カメラの向き(90度単位、0〜3)。`direction()`が返す方角をこのぶん回して、
   * 画面基準で入れた入力をワールドの方角へ直す(issue #463)。
   *
   * カメラを回すと「画面の上」と「ワールドの北」がずれる。仮想パッドは
   * 見た目の方向へ倒す操作なので、補正しないと倒した向きと歩く向きが
   * 噛み合わなくなる。矢印キー・テンキーも同じ経路なので一緒に補正される
   * (Q/Eで回したあと「↑=画面奥」になる)。
   *
   * 呼び出し側(main.ts)が毎フレーム今の値を入れる。カメラが回らない場面
   * (村なか歩き)では0のままにしておけばよい
   */
  cameraQuadrant = 0;

  // ---- 一歩/ダッシュ(plan/step-movement-and-dash.md) ----------------
  /** 現在計測中の方向。direction() が変わる・null になるたびに計測をやり直す */
  private dashDir: Dir | null = null;
  /** dashDir を押し続けている秒数(update()で積み上げる) */
  private dashHeldFor = 0;
  /**
   * この方向入力を打ち切り済みか(壁・押し出しでその場に留まった等)。
   * true の間は direction() が変わらない限り、一歩もダッシュも発行しない
   * (cancelDash() 参照)
   */
  private dirBlocked = false;
  /**
   * まだ取り出されていない「一歩」の向き(TAP_FALLBACK_DELAY_MSのコメント
   * 参照)。direction()の変化を検知した瞬間に確定するので、その後キーが
   * 離されて現在のdirection()がnullに戻っていても、確定時点の向きへ
   * ちゃんと1マス進める。新しい変化が来ると上書きされる(最新の1件だけ
   * 覚えておけばよい。壁バンプ等で立ち消えになった古いタップを後から
   * 遅れて発行してしまわないよう、キューに積まず単一値にしてある)
   */
  private pendingTapDir: Dir | null = null;
  private tapFallbackHandle: ReturnType<typeof setTimeout> | null = null;

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
    if (DIRECTION_KEY_CODES.has(code)) this.scheduleTapFallback();
  }

  /** タッチの指を離した・ボタンを離したときに呼ぶ */
  release(code: string): void {
    this.held.delete(code);
    if (DIRECTION_KEY_CODES.has(code)) this.scheduleTapFallback();
  }

  /**
   * TAP_FALLBACK_DELAY_MS後にcommitDirection()を1回だけ呼ぶ。方向に
   * 関わるキーが押される・離されるたびに呼び直し、直前の予約は
   * 取り消す(斜め入力のように複数キーがほぼ同時に変化するとき、
   * 呼び出しのたびに確定させてしまうと1回の斜め移動のつもりが
   * 直交2回分の移動に化けてしまう。render loop(update())が1フレーム
   * 分のキー変化をまとめて見るのと同じことを、独立のtimerでも再現する)
   */
  private scheduleTapFallback(): void {
    if (this.tapFallbackHandle !== null) clearTimeout(this.tapFallbackHandle);
    this.tapFallbackHandle = setTimeout(() => {
      this.tapFallbackHandle = null;
      this.commitDirection();
    }, TAP_FALLBACK_DELAY_MS);
    (this.tapFallbackHandle as unknown as { unref?: () => void }).unref?.();
  }

  /**
   * direction()の変化を検知し、変化していればdashDir/dashHeldFor/
   * dirBlockedを計測し直す(変化していなければ何もしない)。update(dt)と
   * press()/release()経由のscheduleTapFallback()の両方から呼ばれる
   * 共通ロジック。変化を検知して初めて1マスぶんのタップが確定するので、
   * ここでpendingTapDirへ積む。戻り値は「このフレーム(または呼び出し)で
   * 変化を検知したか」
   */
  private commitDirection(): boolean {
    const dir = this.direction();
    if (dir === this.dashDir) return false;
    this.dashDir = dir;
    this.dashHeldFor = 0;
    this.dirBlocked = false;
    if (dir !== null) this.pendingTapDir = dir;
    return true;
  }

  /**
   * 今押されている方向。押されていなければ null。
   *
   * 返すのは画面基準ではなくワールドの方角(`cameraQuadrant`で補正済み)。
   * 移動・向き変えはどちらもこの`Dir`をそのまま使うので、補正はここ1箇所で
   * 全体に効く
   */
  direction(): Dir | null {
    const screenDir = this.screenDirection();
    return screenDir === null ? null : rotateDir(screenDir, -2 * this.cameraQuadrant);
  }

  /** カメラの向きを考えない、押されているキーそのままの方向 */
  private screenDirection(): Dir | null {
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
    if (this.commitDirection()) return;
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
   * まだ取り出されていない「一歩」があれば、その向きを1回だけ取り出す
   * (呼び出し側はそのまま1回だけ移動コマンドを送る)。タップ(短く押して
   * 離す)がしきい値未満で終わっても必ず1マスぶん進むのは、これのおかげ。
   * 取り出す時点の direction()(押されているキー)ではなく、確定した
   * 時点の向きを返すので、render loopが間引かれてキーがもう離されて
   * いても正しい向きへ進める(TAP_FALLBACK_DELAY_MSのコメント参照)
   */
  takeTapMove(): Dir | null {
    const dir = this.pendingTapDir;
    this.pendingTapDir = null;
    return dir;
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
