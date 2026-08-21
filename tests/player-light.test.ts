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

  /**
   * #718: 光源が主人公の頭上にほぼ直上(距離1未満)にあると、decay 2の
   * 減衰式では放射照度が床(距離2以上)の何倍にも跳ね上がり、主人公だけが
   * ブルームで白飛びして見える。高さを離すほど頭部までの距離が伸び、
   * 逆二乗則で照度が急激に下がる。
   */
  it("光源の高さは、頭上すぐ(距離1未満)にならない程度に離してある", () => {
    // 主人公の頭部はおおよそY 1.0〜1.2(モデルの実測に基づくおおまかな
    // 目安。issue #718の切り分けと同じ見積もり)。光源との距離をこれより
    // 十分離すことで、頭部が至近距離の過剰照度を浴びなくなる
    const approxHeadHeight = 1.2;
    expect(PLAYER_LIGHT.height - approxHeadHeight).toBeGreaterThanOrEqual(1.5);
  });

  it("主人公モデルが浴びる放射照度は、床とおおむね同程度に収まる", () => {
    // THREE.jsのPointLightが使う物理準拠の距離減衰(decay=2)をそのまま
    // 計算する。cutoff(distance)による窓関数は、この距離域ではほぼ1のため省略
    const irradianceAt = (distance: number) =>
      PLAYER_LIGHT.intensity / Math.max(distance ** PLAYER_LIGHT.decay, 0.01);

    // 頭部までの距離(上の見積もりと同じ)と、直下の床までの距離(=光源の高さ)
    const headDistance = PLAYER_LIGHT.height - 1.2;
    const floorDistance = PLAYER_LIGHT.height;

    // #718以前(height 2.0)は主人公が床の6倍以上明るく、これが白飛びの
    // 原因だった。光源を離しても幾何学的に頭部の方が床の直下より近い
    // ままなので完全な同倍率(1倍)にはできないが、3倍以内には収まって
    // いることを確認する(元の6倍超から半分以下まで抑えられている)
    expect(irradianceAt(headDistance)).toBeLessThanOrEqual(irradianceAt(floorDistance) * 3);
  });
});
