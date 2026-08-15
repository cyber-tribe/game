import { describe, expect, it } from "vitest";
import { TOON_GRADIENT_STEPS } from "../src/view/assets";

/**
 * トゥーンシェーディングの階調マップ(plan/game/archive/toon-shading-pipeline.md)。
 *
 * 上下どちらに振っても絵が壊れる値なので、両側の境界をテストで留めておく。
 *
 *  - 上げすぎ: 受光面が飽和して「発光している」ように白飛びする(issue #484)。
 *    既存のライト強度は置き換え前のMeshStandardMaterial(PBR、エネルギー保存で
 *    暗めに出る)向けに調整されており、ランバート系のMeshToonMaterialが同じ
 *    光量を受けると255段では飛ぶ
 *  - 下げすぎ: 陰の面が黒く潰れてモンスターの配色が読めなくなる(最暗部を
 *    90まで持ち上げてあるのはこのため)
 */
describe("view/assets.ts: トゥーンの階調マップ", () => {
  it("影・中間・ハイライトの3階調", () => {
    expect(TOON_GRADIENT_STEPS).toHaveLength(3);
  });

  it("暗いほうから順に並んでいる(NearestFilterで段として読まれる)", () => {
    const steps = [...TOON_GRADIENT_STEPS];
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("最暗部は潰れない明るさを保つ", () => {
    expect(TOON_GRADIENT_STEPS[0]).toBeGreaterThanOrEqual(80);
  });

  it("ハイライトは飽和しない(255まで上げない)", () => {
    // 255だと受光面がアルベドそのままの明るさで出て白飛びする(issue #484)
    expect(TOON_GRADIENT_STEPS[2]).toBeLessThanOrEqual(230);
  });

  it("段が潰れず、階調として見分けられる幅がある", () => {
    for (let i = 1; i < TOON_GRADIENT_STEPS.length; i++) {
      expect(TOON_GRADIENT_STEPS[i]! - TOON_GRADIENT_STEPS[i - 1]!).toBeGreaterThanOrEqual(30);
    }
  });

  it("0〜255に収まっている(Uint8Arrayに入れるため)", () => {
    for (const step of TOON_GRADIENT_STEPS) {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(255);
    }
  });
});
