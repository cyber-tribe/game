import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TOON_GRADIENT_STEPS, collectOutlineTargets, outlineColorFor } from "../src/view/assets";

/**
 * トゥーンシェーディングの階調マップ(plan/game/archive/toon-shading-pipeline.md、
 * plan/models/archive/visual-quality-uplift.md施策C)。
 *
 * 上下どちらに振っても絵が壊れる値なので、両側の境界をテストで留めておく。
 *
 *  - 上げすぎ: 受光面が飽和して「発光している」ように白飛びする(issue #484)。
 *    既存のライト強度は置き換え前のMeshStandardMaterial(PBR、エネルギー保存で
 *    暗めに出る)向けに調整されており、ランバート系のMeshToonMaterialが同じ
 *    光量を受けると255段では飛ぶ
 *  - 下げすぎ: 陰の面が黒く潰れてモンスターの配色が読めなくなる(最暗部を
 *    85まで持ち上げてあるのはこのため)
 */
describe("view/assets.ts: トゥーンの階調マップ", () => {
  it("影・暗め中間・明るめ中間・ハイライトの4階調(visual-quality-uplift.md)", () => {
    expect(TOON_GRADIENT_STEPS).toHaveLength(4);
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
    expect(TOON_GRADIENT_STEPS.at(-1)).toBeLessThanOrEqual(230);
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

/**
 * 輪郭線の色(plan/models/archive/visual-quality-uplift.md施策C「純黒をやめ、
 * 各モデルの基色を暗く濁した色にする」)。一律の黒(0x0a0a0c)をやめ、
 * モデル本体の色相を残しつつ暗く・薄く濁した色を導く
 */
describe("view/assets.ts: outlineColorFor(輪郭線の色)", () => {
  function toonMaterial(hex: number): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({ color: new THREE.Color(hex) });
  }

  it("色相は基色と同じまま、暗く濁った色になる(赤なら暗い臙脂)", () => {
    const red = outlineColorFor(toonMaterial(0xff2020));
    const hsl = { h: 0, s: 0, l: 0 };
    red.getHSL(hsl);
    const baseHsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(0xff2020).getHSL(baseHsl);

    expect(hsl.h).toBeCloseTo(baseHsl.h, 2);
    expect(hsl.l).toBeLessThan(0.15); // 純黒ではないが十分暗い
    expect(hsl.s).toBeLessThan(baseHsl.s); // 彩度は元より濁っている(低い)
  });

  it("色相が違えばモデルごとに輪郭線の色も変わる(一律の黒ではない)", () => {
    const red = outlineColorFor(toonMaterial(0xff2020));
    const blue = outlineColorFor(toonMaterial(0x2040ff));
    expect(red.getHex()).not.toBe(blue.getHex());
  });

  it("配列マテリアル(複数マテリアル)は先頭の色から導く", () => {
    const fromArray = outlineColorFor([toonMaterial(0x30a060), toonMaterial(0xff2020)]);
    const fromFirst = outlineColorFor(toonMaterial(0x30a060));
    expect(fromArray.getHex()).toBe(fromFirst.getHex());
  });

  it("色を持たないマテリアルは既定色にフォールバックする(白飛び・例外を出さない)", () => {
    const glow = new THREE.MeshBasicMaterial(); // .colorはあるが、色相を意図的に読めない状況を想定
    (glow as unknown as { color: undefined }).color = undefined;
    expect(() => outlineColorFor(glow)).not.toThrow();
  });
});

/**
 * 輪郭線(Inverted Hull)の対象集め。
 *
 * ここは一度落ちている。ボーンへ剛体で親化した非スキンメッシュのうち
 * `userData.blink` のあるものだけを対象にしていたため、**ガルドの髪と耳に
 * 輪郭線が1本も付いていなかった**。髪はキャラクターで一番大きな
 * シルエットなので、抜けていると絵の印象が変わる。
 */
describe("view/assets.ts: 輪郭線を付ける対象", () => {
  const meshNamed = (name: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x808080 }),
    );
    mesh.name = name;
    return mesh;
  };

  it("ボーン親化の非スキンメッシュ(髪・耳)も対象に入る", () => {
    const root = new THREE.Object3D();
    root.add(meshNamed("garudo_hair"), meshNamed("garudo_ear"));
    const { rigid } = collectOutlineTargets(root);
    expect(rigid.map((m) => m.name).sort()).toEqual(["garudo_ear", "garudo_hair"]);
  });

  it("まばたきの指定が無くても外さない(これで髪が抜けていた)", () => {
    const root = new THREE.Object3D();
    const hair = meshNamed("garudo_hair");
    expect(hair.userData.blink).toBeUndefined();
    root.add(hair);
    expect(collectOutlineTargets(root).rigid).toHaveLength(1);
  });

  it("輪郭線メッシュ自身は対象にしない(二重に生えない)", () => {
    const root = new THREE.Object3D();
    root.add(meshNamed("garudo_hair"), meshNamed("garudo_hair__outline"));
    const { rigid } = collectOutlineTargets(root);
    expect(rigid.map((m) => m.name)).toEqual(["garudo_hair"]);
  });

  it("半透明メッシュには付けない(泡が黒い球になる)", () => {
    const root = new THREE.Object3D();
    const bubble = meshNamed("oonebosuke_bubble");
    bubble.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    root.add(bubble);
    expect(collectOutlineTargets(root).rigid).toHaveLength(0);
  });

  it("発光が主のメッシュには付けない(光の粒に暗い輪が出る)", () => {
    const root = new THREE.Object3D();
    const gleam = meshNamed("oonebosuke_bubble_gleam");
    gleam.material = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0.6, 0.6, 0.6) });
    root.add(gleam);
    expect(collectOutlineTargets(root).rigid).toHaveLength(0);
  });

  it("スキン付きメッシュは剛体側に混ざらない(付け方が別)", () => {
    const root = new THREE.Object3D();
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x808080 }),
    );
    skinned.name = "garudo";
    root.add(skinned, meshNamed("garudo_hair"));
    const { skinned: sk, rigid } = collectOutlineTargets(root);
    expect(sk.map((m) => m.name)).toEqual(["garudo"]);
    expect(rigid.map((m) => m.name)).toEqual(["garudo_hair"]);
  });
});
