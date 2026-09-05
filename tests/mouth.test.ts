import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MouthController } from "../src/view/mouth";

/**
 * 口の開閉のテクスチャ切り替え(handbook/cage-and-2d3d-split.md)。
 *
 * glTFでは顔は本体メッシュの別プリミティブなので、threeでは
 * 「タグの付いたノード + マテリアル名で選ぶ子メッシュ」になる。
 * 顎ボーンはアーマチュアの子として同じrootの下にいる。
 */
function makeRig(shared?: THREE.MeshStandardMaterial): {
  root: THREE.Object3D;
  face: THREE.Mesh;
  jaw: THREE.Object3D;
} {
  const root = new THREE.Group();
  root.userData.mouthTiles = 3;
  root.userData.mouthMaterial = "akubitokage_face_mat";
  root.userData.mouthBone = "snout-jaw";
  root.userData.mouthOpenDeg = 60;
  const material = shared ?? new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  material.name = "akubitokage_face_mat";
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const skinMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  skinMat.name = "akubitokage_skin";
  root.add(face, new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skinMat));
  const jaw = new THREE.Bone();
  jaw.name = "snout-jaw";
  // 静止姿勢は原点回転とは限らない(Blenderのボーンの向きが焼かれている)
  jaw.quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0));
  root.add(jaw);
  return { root, face, jaw };
}

function offsetOf(mesh: THREE.Mesh): number {
  return ((mesh.material as THREE.MeshStandardMaterial).map as THREE.Texture).offset.x;
}

/** 顎を静止姿勢から deg だけ開く */
function openJaw(jaw: THREE.Object3D, rest: THREE.Quaternion, deg: number): void {
  const delta = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-deg),
  );
  jaw.quaternion.copy(rest).multiply(delta);
}

describe("view/mouth.ts: MouthController", () => {
  it("userData.mouthTilesを持たないrootではupdate()が何もしない", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.1)));
    const mouth = new MouthController(root);
    expect(() => mouth.update()).not.toThrow();
    expect(mouth.openAmount()).toBe(0);
  });

  it("顎の開き角をコマへ量子化してUVオフセットを動かす", () => {
    const { root, face, jaw } = makeRig();
    const rest = jaw.quaternion.clone();
    const mouth = new MouthController(root);
    expect(offsetOf(face)).toBeCloseTo(0);

    openJaw(jaw, rest, 30);   // 半分 → 真ん中のコマ
    mouth.update();
    expect(offsetOf(face)).toBeCloseTo(1 / 3);

    openJaw(jaw, rest, 60);   // 最大 → 右端のコマ
    mouth.update();
    expect(offsetOf(face)).toBeCloseTo(2 / 3);

    openJaw(jaw, rest, 0);    // 閉じ → 左端へ戻る
    mouth.update();
    expect(offsetOf(face)).toBeCloseTo(0);
  });

  it("最大を超える開き角でも右端のコマで止まる", () => {
    const { root, face, jaw } = makeRig();
    const rest = jaw.quaternion.clone();
    const mouth = new MouthController(root);
    openJaw(jaw, rest, 110);
    mouth.update();
    expect(mouth.openAmount()).toBe(1);
    expect(offsetOf(face)).toBeCloseTo(2 / 3);
  });

  it("顔以外のマテリアルには触らない", () => {
    const { root, jaw } = makeRig();
    const rest = jaw.quaternion.clone();
    const skin = root.children[1] as THREE.Mesh;
    const mouth = new MouthController(root);
    openJaw(jaw, rest, 60);
    mouth.update();
    expect(offsetOf(skin)).toBe(0);
  });

  it("インスタンスごとにマテリアルとテクスチャを複製する(1体のあくびで全員が開かない)", () => {
    const shared = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const a = makeRig(shared);
    const b = makeRig(shared);
    const restA = a.jaw.quaternion.clone();
    const mouthA = new MouthController(a.root);
    new MouthController(b.root);
    openJaw(a.jaw, restA, 60);
    mouthA.update();
    expect(offsetOf(a.face)).toBeCloseTo(2 / 3);
    expect(offsetOf(b.face)).toBe(0);
    expect(shared.map!.offset.x).toBe(0);
  });
});
