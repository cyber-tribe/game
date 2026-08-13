import { describe, expect, it } from "vitest";
// @ts-expect-error -- tools配下は型定義のない素のmjs(tests/auto-tester-fingerprint.test.tsと同じ扱い)
import { MOVE_DIRECTIONS, SOFTLOCK_TURNS, SoftlockDetector } from "../tools/softlock-detector.mjs";

/**
 * #396: 自動検知の「softlock-suspected」が、実際には進行不能ではない場面で出る。
 *
 * 壁への体当たりはログを1行も出さないため、HUDのJSON(プレイヤー位置を含む)は
 * 完全に同一のままになる。旧実装は「3方向以上試した」だけで報告していたので、
 * 行き止まりの通路(3方向が壁・1方向だけ開いている)にいるあいだ、ランダムな
 * 方向選択が開いている1方向をたまたま引かなければ報告が出てしまっていた。
 */

/** HUDのJSONを組み立てる。位置が変わればJSONも変わる(実物のreadHudと同じ性質) */
function hud(x: number, y: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ screen: "dungeon", depth: 2, pos: { x, y }, hp: 25, status: "playing", allies: 0, ...extra });
}

/** 指定した方向だけを試しながら、HUDが変化しないまま指定ターン数ぶん回す */
function stall(detector: SoftlockDetector, directions: readonly string[], turns: number, at = hud(5, 5)): boolean {
  let reported = false;
  for (let i = 0; i < turns; i++) {
    detector.observe(at);
    if (detector.takeReport()) reported = true;
    detector.noteDirection(directions[i % directions.length]!);
  }
  return reported;
}

describe("tools/softlock-detector.mjs: 進行不能の疑い検知(#396)", () => {
  it("全方向を試して位置が1マスも変わらなければ、進行不能の疑いとして報告する", () => {
    const detector = new SoftlockDetector();
    expect(stall(detector, MOVE_DIRECTIONS, SOFTLOCK_TURNS + 5)).toBe(true);
  });

  it("行き止まり(3方向だけ試した)では報告しない —— これが#396の誤検知", () => {
    const detector = new SoftlockDetector();
    // 開いている1方向(ArrowRight)を引かないまま、壁の3方向だけを延々と試す
    const walls = ["ArrowUp", "ArrowDown", "ArrowLeft"];
    expect(stall(detector, walls, SOFTLOCK_TURNS * 5)).toBe(false);
  });

  it("HUDが変化したら計測はやり直される(試した方向の記録も消える)", () => {
    const detector = new SoftlockDetector();
    // 全方向を試しつつ、あと1ターンで報告に届くところまで進める
    stall(detector, MOVE_DIRECTIONS, SOFTLOCK_TURNS - 1);
    expect(detector.unchangedTurns).toBeGreaterThan(0);

    detector.observe(hud(6, 5)); // 実際に動けた(位置が変わった)
    expect(detector.unchangedTurns).toBe(0);
    expect(detector.triedDirections).toEqual([]);
  });

  it("位置が同じでもHUDの他の値(HP等)が変われば、計測はやり直される", () => {
    const detector = new SoftlockDetector();
    stall(detector, MOVE_DIRECTIONS, SOFTLOCK_TURNS - 1);

    detector.observe(hud(5, 5, { hp: 24 })); // 殴られた = 進行はしている
    expect(detector.unchangedTurns).toBe(0);
  });

  it("報告は1回きりで、同じ停滞のまま二重に報告しない(報告後は計測をやり直す)", () => {
    const detector = new SoftlockDetector();
    let reports = 0;
    for (let i = 0; i < SOFTLOCK_TURNS * 2 + 2; i++) {
      detector.observe(hud(5, 5));
      if (detector.takeReport()) reports++;
      detector.noteDirection(MOVE_DIRECTIONS[i % MOVE_DIRECTIONS.length]!);
    }
    // 2回ぶんの停滞は起きているが、報告の間に計測がやり直されるので2回まで
    expect(reports).toBe(2);
  });

  it("停滞していても移動をまったく試していなければ報告しない(メニュー操作だけで放置した場合)", () => {
    const detector = new SoftlockDetector();
    for (let i = 0; i < SOFTLOCK_TURNS * 3; i++) {
      detector.observe(hud(5, 5));
      expect(detector.takeReport()).toBe(false); // noteDirectionを一度も呼ばない
    }
  });

  it("reset()で計測をやり直せる(拠点・村へ移った直後の誤検知よけ)", () => {
    const detector = new SoftlockDetector();
    stall(detector, MOVE_DIRECTIONS, SOFTLOCK_TURNS - 1);
    detector.reset();
    expect(detector.unchangedTurns).toBe(0);
    expect(detector.triedDirections).toEqual([]);
  });
});
