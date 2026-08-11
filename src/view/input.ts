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
  /** 仲間への指示(構え)メニューを開く */
  | "orders";

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

const AXIS_KEYS = {
  north: ["ArrowUp", "KeyW"],
  south: ["ArrowDown", "KeyS"],
  west: ["ArrowLeft", "KeyA"],
  east: ["ArrowRight", "KeyD"],
} as const;

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

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (raw) => {
      const event = raw as KeyboardEvent;
      if (event.repeat) return;
      if (this.onKey?.(event.code, event.shiftKey)) {
        event.preventDefault();
        return;
      }
      this.held.add(event.code);
      const action = ACTION_KEYS[event.code];
      if (action) {
        this.pending.push(action);
        event.preventDefault();
      }
      if (event.code.startsWith("Arrow") || event.code.startsWith("Numpad")) {
        event.preventDefault();
      }
    });

    target.addEventListener("keyup", (raw) => {
      this.held.delete((raw as KeyboardEvent).code);
    });

    // 画面外に出たあいだのキーは押しっぱなし扱いにしない
    window.addEventListener("blur", () => this.held.clear());
  }

  /** 今押されている方向。押されていなければ null */
  direction(): Dir | null {
    for (const [code, dir] of Object.entries(NUMPAD_DIRS)) {
      if (this.held.has(code)) return dir;
    }
    const north = AXIS_KEYS.north.some((k) => this.held.has(k));
    const south = AXIS_KEYS.south.some((k) => this.held.has(k));
    const west = AXIS_KEYS.west.some((k) => this.held.has(k));
    const east = AXIS_KEYS.east.some((k) => this.held.has(k));

    const dy = (south ? 1 : 0) - (north ? 1 : 0);
    const dx = (east ? 1 : 0) - (west ? 1 : 0);
    if (dx === 0 && dy === 0) return null;

    // 北を 0 として時計回りに並べた 8 方向へ落とす
    const table: Record<string, Dir> = {
      "0,-1": 0,
      "1,-1": 1,
      "1,0": 2,
      "1,1": 3,
      "0,1": 4,
      "-1,1": 5,
      "-1,0": 6,
      "-1,-1": 7,
    };
    return table[`${dx},${dy}`] ?? null;
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
