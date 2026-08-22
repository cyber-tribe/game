import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DungeonView } from "../src/view/dungeonMesh";
import type { Assets } from "../src/view/assets";
import { makeEmptyFloor } from "./helpers/floor";

function fakeAssets(): Assets {
  return {
    has: () => true,
    instantiate: () => ({ root: new THREE.Group(), mixer: null, actions: new Map() }),
    instancingSource: () => ({ geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshBasicMaterial() }),
    loadInBackground: () => {},
  } as unknown as Assets;
}

/**
 * 夢のもや(plan/models/archive/dungeon-dreamscape.mdの「1. 夢の演出言語」)。
 * フロアの外周を虚空ではなく、淡い霧が渦を巻く空間にする
 */
describe("view/dungeonMesh.ts: 夢のもや", () => {
  it("フロアの外周4辺ぶんの板が積まれる", () => {
    const scene = new THREE.Scene();
    const view = new DungeonView(scene, fakeAssets());
    const floor = makeEmptyFloor({ depth: 1, width: 10, height: 8 });
    view.build(floor);

    const mistMeshes = scene.children
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry);
    expect(mistMeshes).toHaveLength(4);
  });

  it("時間経過でゆっくり明滅する(不透明度が変化する)", () => {
    const scene = new THREE.Scene();
    const view = new DungeonView(scene, fakeAssets());
    view.build(makeEmptyFloor({ depth: 1, width: 10, height: 8 }));

    view.animate(0);
    const mist = scene.children
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .find((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry)!;
    const opacityAt0 = (mist.material as THREE.MeshBasicMaterial).opacity;

    view.animate(6); // sin(6*0.25) はsin(0)と十分に違う値になる
    const opacityAt6 = (mist.material as THREE.MeshBasicMaterial).opacity;
    expect(opacityAt6).not.toBeCloseTo(opacityAt0, 3);
  });

  it("フロアを作り直しても、もやの板が増え続けない(2回目もちょうど4枚)", () => {
    const scene = new THREE.Scene();
    const view = new DungeonView(scene, fakeAssets());
    view.build(makeEmptyFloor({ depth: 1, width: 10, height: 8 }));
    view.build(makeEmptyFloor({ depth: 2, width: 14, height: 10 }));

    const mistMeshes = scene.children
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .flatMap((o) => (o instanceof THREE.Group ? o.children : [o]))
      .filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry);
    expect(mistMeshes).toHaveLength(4);
  });
});
