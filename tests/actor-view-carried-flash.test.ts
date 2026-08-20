import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { ActorView } from "../src/view/actorView";

// このテスト環境(vitestのnode環境)には window が無く、ActorView.flash() が
// 内部で使う window.setTimeout/clearTimeout が呼べない。Node のグローバルな
// setTimeout/clearTimeout をそのまま window として貼っておけば十分動く。
beforeEach(() => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * #684: タルを頭上に持ち上げていると、被弾のたびにタルが赤く光って見える。
 *
 * ActorView.flash() は ensureOwnMaterials() で this.root を traverse し、
 * 見つかった全メッシュのマテリアルを複製して赤く染める(同じ種族が
 * 全員光ってしまう問題への対策)。setCarried() で頭上のタルも root の
 * 子にしているため、この走査にタルのメッシュまで巻き込まれ、被弾する
 * たびにタルまで赤発光していた。タルは攻撃を受けて痛がる主体ではないので、
 * 走査からは除外されるべき。
 */
describe("view/actorView.ts: flash() とcarried(#684)", () => {
  function makeMesh(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0, 0, 0) });
    return new THREE.Mesh(geometry, material);
  }

  it("タルを持っている状態で被弾しても、タルのマテリアルは赤くならない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    const barrel = new THREE.Group();
    const barrelMesh = makeMesh();
    barrel.add(barrelMesh);
    view.setCarried(barrel);

    view.flash(new THREE.Scene());

    const barrelMaterial = barrelMesh.material as THREE.MeshStandardMaterial;
    expect(barrelMaterial.emissive.r).toBeCloseTo(0);
    expect(barrelMaterial.emissive.g).toBeCloseTo(0);
    expect(barrelMaterial.emissive.b).toBeCloseTo(0);
  });

  it("タルを持っている状態でも、キャラ本体のメッシュはこれまで通り赤く光る", () => {
    const root = new THREE.Group();
    const bodyMesh = makeMesh();
    root.add(bodyMesh);
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });

    view.setCarried(new THREE.Group());
    view.flash(new THREE.Scene());

    const bodyMaterial = bodyMesh.material as THREE.MeshStandardMaterial;
    expect(bodyMaterial.emissive.r).toBeCloseTo(0.75);
  });

  it("被弾後にタルを持っても、既に複製済みのため以後の被弾でタルは光らない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    // 先に一度被弾させ、ownMaterials を確定させる(タルを持つ前の被弾)
    view.flash(new THREE.Scene());

    const barrel = new THREE.Group();
    const barrelMesh = makeMesh();
    barrel.add(barrelMesh);
    view.setCarried(barrel);

    view.flash(new THREE.Scene());

    const barrelMaterial = barrelMesh.material as THREE.MeshStandardMaterial;
    expect(barrelMaterial.emissive.r).toBeCloseTo(0);
  });

  it("タルを持ったまま被弾しても、頭上の位置に付いてきたまま残る", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    const barrel = new THREE.Group();
    barrel.add(makeMesh());
    view.setCarried(barrel);
    view.flash(new THREE.Scene());

    expect(view.carriedObject).toBe(barrel);
    expect(barrel.parent).toBe(view.root);
    expect(barrel.position.y).toBeCloseTo(1.02);
  });
});
