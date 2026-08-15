import { describe, expect, it } from "vitest";
import { PLAYER_LIGHT } from "../src/view/renderer";

/**
 * 松明(プレイヤーに付いてまわる点光源)の強さ。
 *
 * トゥーンの階調マップ(tests/toon-gradient.test.ts)と同じく、上下どちらへ
 * 振っても絵が壊れる値なので両側を留めておく。
 *
 *  - 減衰が緩すぎる: 足元1〜2マスが過剰に明るくなり、床・壁の陰影が飛んで
 *    「明るすぎる」状態になる(issue #524。以前の decay 1.4 がこれ)
 *  - 強すぎ/弱すぎ: 洞窟が白っぽくなる、または足元が見えなくなる
 */
describe("view/renderer.ts: 松明の光", () => {
  it("減衰は物理準拠(2)以上。至近距離だけが過剰に明るくならない", () => {
    expect(PLAYER_LIGHT.decay).toBeGreaterThanOrEqual(2);
  });

  it("強さは、洞窟を照らせるが飛ばさない範囲に収まっている", () => {
    expect(PLAYER_LIGHT.intensity).toBeGreaterThanOrEqual(20);
    expect(PLAYER_LIGHT.intensity).toBeLessThanOrEqual(45);
  });

  it("届く距離は、視界の境界が不自然に切れない程度に確保する", () => {
    // 視界(部屋の広さ)より短いと、床が途中で急に暗く切り落とされて見える
    expect(PLAYER_LIGHT.distance).toBeGreaterThanOrEqual(10);
  });
});
