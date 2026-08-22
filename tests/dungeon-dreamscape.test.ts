import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildDreamSky, recolorDreamSky } from "../src/view/renderer";

/**
 * 夢空(plan/models/archive/dungeon-dreamscape.mdの「1. 夢の演出言語」)。
 * ダンジョンは石造りの遺跡ではなくヨリシロの夢の中(design/world.md)なので、
 * 天井の代わりに頂点カラーのグラデーションドームを頭上に置く
 */
describe("view/renderer.ts: 夢空(buildDreamSky/recolorDreamSky)", () => {
  it("半球ドームで、頂点カラーを持つ", () => {
    const sky = buildDreamSky();
    expect(sky.geometry).toBeInstanceOf(THREE.SphereGeometry);
    recolorDreamSky(sky, new THREE.Color(0xffffff), new THREE.Color(0x000000));
    expect(sky.geometry.attributes.color).toBeDefined();
  });

  it("地平線際(horizon)〜天頂(zenith)へ、高さに応じてグラデーションする", () => {
    const sky = buildDreamSky();
    const horizon = new THREE.Color(0xffffff);
    const zenith = new THREE.Color(0x000000);
    recolorDreamSky(sky, horizon, zenith);

    const position = sky.geometry.attributes.position!;
    const color = sky.geometry.attributes.color as THREE.BufferAttribute;
    let lowestY = Infinity;
    let highestY = -Infinity;
    let lowIndex = 0;
    let highIndex = 0;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < lowestY) { lowestY = y; lowIndex = i; }
      if (y > highestY) { highestY = y; highIndex = i; }
    }
    // 最も低い頂点は地平線色(白)に近く、最も高い頂点は天頂色(黒)に近い
    expect(color.getX(lowIndex)).toBeGreaterThan(color.getX(highIndex));
  });

  it("背面から見る(カメラを内側に包む)向きになっている", () => {
    const sky = buildDreamSky();
    const material = sky.material as THREE.MeshBasicMaterial;
    expect(material.side).toBe(THREE.BackSide);
    expect(material.fog).toBe(false);
  });
});
