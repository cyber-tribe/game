/**
 * 自動テストプレイ(plan/archive/auto-tester.md)の進行不能(ソフトロック)検知。
 * tools/auto-tester.mjs から使う、副作用のないモジュール。
 *
 * 判定は「HUD(プレイヤー位置を含む)が変化しないまま、移動を試した方向が
 * ひととおり出そろった」こと。以前は『3方向以上』で報告していたが、これだと
 * 行き止まりの通路(3方向が壁で1方向だけ開いている)にいるだけで報告が出た。
 * 壁への体当たりはログを1行も出さないためHUDのJSONが完全に同一のままになり、
 * ランダムな方向選択が開いている1方向をたまたま引かないあいだ
 * (20ターンぶんの移動でおよそ(3/4)^12 ≒ 3%)、本物の進行不能と区別が
 * つかなかった。全方向を試して1つも位置が変わらないことを条件にすれば、
 * 開いている方向がある限り必ずそこを通って位置が変わり、計測がやり直される。
 */

/** この連続ターン数、HUD状態が変化しなければ進行不能の疑いとする */
export const SOFTLOCK_TURNS = 20;

/** 移動に使う方向キー。このすべてを試して駄目だったときだけ報告する */
export const MOVE_DIRECTIONS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export class SoftlockDetector {
  #turns;
  #required;
  #lastHudJson = null;
  #unchanged = 0;
  #tried = new Set();

  constructor({ turns = SOFTLOCK_TURNS, directions = MOVE_DIRECTIONS } = {}) {
    this.#turns = turns;
    this.#required = new Set(directions);
  }

  /** 連続で変化していないターン数 */
  get unchangedTurns() {
    return this.#unchanged;
  }

  /** この計測のあいだに試した移動方向 */
  get triedDirections() {
    return [...this.#tried];
  }

  /** 計測をやり直す(HUDの控えは残す) */
  reset() {
    this.#unchanged = 0;
    this.#tried.clear();
  }

  /**
   * 毎ターンの先頭でHUDのJSONを渡す。変化していれば計測をやり直す。
   * 変化していれば true を返す
   */
  observe(hudJson) {
    const changed = hudJson !== this.#lastHudJson;
    this.#lastHudJson = hudJson;
    if (changed) {
      this.reset();
      return true;
    }
    this.#unchanged++;
    return false;
  }

  /** 実際に移動を試した方向を記録する */
  noteDirection(direction) {
    if (this.#required.has(direction)) this.#tried.add(direction);
  }

  /**
   * 進行不能の疑いとして報告すべきなら true(そのとき計測はやり直される)。
   * 全方向を試したうえで、そのすべてで位置が変わらなかった場合だけ true になる
   */
  takeReport() {
    if (this.#unchanged < this.#turns) return false;
    for (const direction of this.#required) {
      if (!this.#tried.has(direction)) return false;
    }
    this.reset();
    return true;
  }
}
