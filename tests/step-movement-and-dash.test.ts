import { describe, expect, it } from "vitest";
import { DASH_HOLD_THRESHOLD, Input } from "../src/view/input";

/**
 * 一歩/ダッシュ(plan/step-movement-and-dash.md)。実際のキー入力は
 * `Input.press`/`release`(タッチ操作 tests/plan/archive/touch-controls.md
 * が使っているのと同じ入口)で模擬し、`update(dt)`をフレームのように
 * 繰り返し呼んで検証する。実時間のfake timerは使わず、dtを直接積み上げる
 * (この機能自体がdt積算の状態機械のため、それが一番素直に確かめられる)。
 *
 * src/main.ts の step() がやっているのと同じ判定(タップなら
 * consumeTapMove()、それ以外はisDashing())を1フレームぶんまとめた
 * ヘルパーを使い、「このフレームで移動コマンドを送るか」を数える
 */
function pollMove(input: Input): boolean {
  // src/main.ts の step() も、方向が無いフレームでは
  // consumeTapMove()/isDashing() を呼ばない(direction() === null で
  // 早期returnする)。ここでも同じ順序を守る
  if (input.direction() === null) return false;
  return input.consumeTapMove() || input.isDashing();
}

/** 1フレームぶん(dt秒)進め、そのフレームで移動を送るならtrueを返す */
function frame(input: Input, dt: number): boolean {
  input.update(dt);
  return pollMove(input);
}

describe("一歩/ダッシュ", () => {
  it("しきい値未満で離すタップは、複数フレームまたいでポーリングしても1回しか移動を送らない", () => {
    const input = new Input(new EventTarget());
    input.press("ArrowUp");

    const submitted: boolean[] = [];
    // しきい値よりだいぶ手前で離す。フレームは16ms刻みで数回ポーリングする
    for (let i = 0; i < 5; i++) {
      submitted.push(frame(input, 0.016));
    }
    input.release("ArrowUp");
    submitted.push(frame(input, 0.016));

    expect(submitted.filter(Boolean)).toHaveLength(1);
    // 最初のフレームでこそ送っている(タップは押した瞬間に一歩)
    expect(submitted[0]).toBe(true);
  });

  it("しきい値を超えて押し続けると、以後は毎フレーム移動を送り続ける(ダッシュ)", () => {
    const input = new Input(new EventTarget());
    input.press("ArrowDown");

    let submittedCount = 0;
    let elapsed = 0;
    const dt = 0.05;
    // しきい値の何倍か分、押し続けたことにする
    while (elapsed < DASH_HOLD_THRESHOLD * 4) {
      if (frame(input, dt)) submittedCount++;
      elapsed += dt;
    }

    // 最初のタップ1回 + しきい値超過後の複数回、で2回より多く送られているはず
    expect(submittedCount).toBeGreaterThan(2);
    expect(input.isDashing()).toBe(true);
  });

  it("しきい値到達前に離してすぐ押し直すと、タップ扱いに戻る", () => {
    const input = new Input(new EventTarget());
    input.press("ArrowLeft");
    // 最初のタップぶんを消費させる
    expect(frame(input, 0.01)).toBe(true);
    // しきい値未満で離す
    frame(input, 0.05);
    input.release("ArrowLeft");
    frame(input, 0.001);

    expect(input.isDashing()).toBe(false);

    // すぐに押し直す
    input.press("ArrowLeft");
    // 再度、最初のフレームで一歩ぶん送られる(ダッシュの続きにはならない)
    expect(frame(input, 0.01)).toBe(true);
    expect(input.isDashing()).toBe(false);
  });

  it("ダッシュ中にcancelDash()が呼ばれると、同じ方向を押し続けていても以後は移動を送らない", () => {
    const input = new Input(new EventTarget());
    input.press("ArrowRight");

    // しきい値を超えるまで押し続けてダッシュに入る
    let elapsed = 0;
    while (elapsed < DASH_HOLD_THRESHOLD + 0.05) {
      frame(input, 0.05);
      elapsed += 0.05;
    }
    expect(input.isDashing()).toBe(true);

    // 壁バンプ・敵の押し出しなどでその場に留まった、という通知
    input.cancelDash();

    // 同じ方向を押したままさらに時間が経っても、一歩もダッシュも発行しない
    let submittedAfterCancel = 0;
    for (let i = 0; i < 10; i++) {
      if (frame(input, 0.05)) submittedAfterCancel++;
    }
    expect(submittedAfterCancel).toBe(0);
    expect(input.isDashing()).toBe(false);

    // 離して押し直せば、また新規のタップから始まる
    input.release("ArrowRight");
    frame(input, 0.001);
    input.press("ArrowRight");
    expect(frame(input, 0.01)).toBe(true);
  });

  it("方向を変える(斜め入力に切り替わる等)と、新しい入力として計測し直す", () => {
    const input = new Input(new EventTarget());
    input.press("ArrowUp");
    expect(frame(input, 0.01)).toBe(true); // 上へのタップ

    // 右も押して右上の斜めに変わる = direction()の戻り値が変わる
    input.press("ArrowRight");
    // 方向が変わった最初のフレームでも、新規タップとして1回だけ送る
    expect(frame(input, 0.01)).toBe(true);
    // 直後はまだダッシュ扱いではない
    expect(input.isDashing()).toBe(false);
  });
});
