import { describe, expect, it } from "vitest";
import { forcedLandscapePointerDelta, shouldForceLandscape } from "../src/entities/orientation";

describe("entities/orientation.ts: shouldForceLandscape(plan/game/archive/forced-landscape.md)", () => {
  it("タッチ端末かつ縦持ちのときだけ強制横向きにする", () => {
    expect(shouldForceLandscape(true, true)).toBe(true);
  });

  it("タッチ端末でも横持ちなら強制横向きにしない", () => {
    expect(shouldForceLandscape(true, false)).toBe(false);
  });

  it("縦長ウィンドウでもタッチ端末でなければ(マウス・トラックパッド等)強制横向きにしない", () => {
    expect(shouldForceLandscape(false, true)).toBe(false);
  });

  it("タッチでも縦持ちでもなければ強制横向きにしない", () => {
    expect(shouldForceLandscape(false, false)).toBe(false);
  });
});

describe("entities/orientation.ts: forcedLandscapePointerDelta(plan/game/archive/forced-landscape.md)", () => {
  it("forced-landscapeが無効なら生の差分をそのまま返す", () => {
    expect(forcedLandscapePointerDelta(10, 20, false)).toEqual({ dx: 10, dy: 20 });
  });

  it("forced-landscapeが有効なら90度回転の逆変換(dx,dy)->(dy,-dx)を適用する", () => {
    expect(forcedLandscapePointerDelta(10, 20, true)).toEqual({ dx: 20, dy: -10 });
  });

  it("右方向(画面上でのclientX増加)への生ドラッグは、見た目どおり上方向への移動に読み替わる", () => {
    // 画面上で右へ動かした(dx=+1, dy=0)とき、回転後の見た目では上方向(dy=-1)への移動に対応する
    expect(forcedLandscapePointerDelta(1, 0, true)).toEqual({ dx: 0, dy: -1 });
  });

  it("下方向(画面上でのclientY増加)への生ドラッグは、見た目どおり右方向への移動に読み替わる", () => {
    // 画面上で下へ動かした(dx=0, dy=+1)とき、回転後の見た目では右方向(dx=+1)への移動に対応する
    const { dx, dy } = forcedLandscapePointerDelta(0, 1, true);
    expect(dx).toBe(1);
    // dy は計算上 -0 になりうる(-1 * 0)。toBe/toEqualはObject.is基準で-0 !== 0と
    // 判定されてしまうため、値としての等しさ(== 0)で比較する
    expect(dy == 0).toBe(true);
  });

  it("距離(hypot)は回転不変で保たれる", () => {
    const raw = { dx: 3, dy: 4 };
    const corrected = forcedLandscapePointerDelta(raw.dx, raw.dy, true);
    expect(Math.hypot(corrected.dx, corrected.dy)).toBeCloseTo(Math.hypot(raw.dx, raw.dy));
  });
});
