import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BlinkController } from "../src/view/blink";

/**
 * まばたき・視線の微揺れ(plan/models/archive/eye-blink-liveliness.md)。
 */

function makeEye(kind: "white" | "pupil", radius = 0.05): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6));
  mesh.userData.blink = kind;
  return mesh;
}

/**
 * テクスチャ切り替え方式の顔(ガルド)。open/half/closedの3コマ。
 * glTFでは顔は本体メッシュの別プリミティブなので、threeでは
 * 「タグの付いたノード + マテリアル名で選ぶ子メッシュ」になる。
 */
function makeFace(shared?: THREE.MeshStandardMaterial): {
  node: THREE.Object3D;
  face: THREE.Mesh;
} {
  const node = new THREE.Group();
  node.userData.blink = "eyelid";
  node.userData.blinkTiles = 3;
  node.userData.blinkMaterial = "garudo_face";
  const material = shared ?? new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  material.name = "garudo_face";
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const bodyMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  bodyMat.name = "garudo_body";
  node.add(face, new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bodyMat));
  return { node, face };
}

function offsetOf(mesh: THREE.Mesh): number {
  return ((mesh.material as THREE.MeshStandardMaterial).map as THREE.Texture).offset.x;
}

/** 60fps相当の刻みで、指定秒数ぶんupdateを回す */
function runFrames(blink: BlinkController, seconds: number, fps = 60): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) blink.update(dt);
}

describe("view/blink.ts: BlinkController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("userData.blinkを持たないrootではupdate()が何もしない(クラッシュしない)", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.1)));
    const blink = new BlinkController(root);
    expect(() => runFrames(blink, 10)).not.toThrow();
  });

  it("一定時間後、白目・瞳のY軸スケールを一瞬0.05倍まで潰し、また全開に戻す", () => {
    // Math.randomを0で固定すると、まばたき間隔は最短(2秒)になる
    vi.spyOn(Math, "random").mockReturnValue(0);

    const root = new THREE.Group();
    const white = makeEye("white");
    const pupil = makeEye("pupil");
    root.add(white, pupil);
    const blink = new BlinkController(root);

    expect(white.scale.y).toBe(1);

    // 2秒(最短間隔)経過するまでは全開のまま
    runFrames(blink, 1.9);
    expect(white.scale.y).toBeCloseTo(1);
    expect(pupil.scale.y).toBeCloseTo(1);

    // まばたきの最中(全閉付近)を捉える
    runFrames(blink, 0.2);
    expect(white.scale.y).toBeLessThan(0.5);
    expect(pupil.scale.y).toBeLessThan(0.5);
    expect(white.scale.y).toBeGreaterThanOrEqual(0.05);

    // 一連の動作(閉じ→止め→開き、既定で0.26秒)が終わると全開に戻る
    runFrames(blink, 1);
    expect(white.scale.y).toBeCloseTo(1);
    expect(pupil.scale.y).toBeCloseTo(1);
  });

  it("白目・瞳以外(userData.blinkが無いオブジェクト)のスケールは変えない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const root = new THREE.Group();
    const white = makeEye("white");
    const other = new THREE.Mesh(new THREE.SphereGeometry(0.1));
    root.add(white, other);
    const blink = new BlinkController(root);

    runFrames(blink, 2.1);
    expect(other.scale.y).toBe(1);
  });

  it("同じ種族を複数体作っても、初期タイマーは個体ごとに乱数で決まる(同期しない)", () => {
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;

    const rootA = new THREE.Group();
    rootA.add(makeEye("white"), makeEye("pupil"));
    new BlinkController(rootA);
    const afterA = spy.mock.calls.length;

    const rootB = new THREE.Group();
    rootB.add(makeEye("white"), makeEye("pupil"));
    new BlinkController(rootB);
    const afterB = spy.mock.calls.length;

    // それぞれの構築で、まばたき・サッケードの初期タイマーぶん乱数を引いている
    expect(afterA).toBeGreaterThan(before);
    expect(afterB).toBeGreaterThan(afterA);
  });

  it("テクスチャ方式では、顔のUVオフセットが open→half→closed→half→open と動く", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 間隔を最短(2秒)に固定

    const root = new THREE.Group();
    const { node, face } = makeFace();
    root.add(node);
    const blink = new BlinkController(root);

    // 3コマなので 0 / 1/3 / 2/3
    expect(offsetOf(face)).toBeCloseTo(0);

    runFrames(blink, 1.9);
    expect(offsetOf(face)).toBeCloseTo(0); // まだ開いている

    const seen = new Set<number>();
    for (let t = 0; t < 0.3; t += 1 / 240) {
      blink.update(1 / 240);
      seen.add(Number(offsetOf(face).toFixed(4)));
    }
    // 途中で半目(1/3)と閉じ(2/3)の両方を通る
    expect(seen.has(Number((1 / 3).toFixed(4)))).toBe(true);
    expect(seen.has(Number((2 / 3).toFixed(4)))).toBe(true);

    runFrames(blink, 1);
    expect(offsetOf(face)).toBeCloseTo(0); // 開いた状態へ戻る
  });

  it("顔以外のマテリアル(本体)のUVは動かさない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const root = new THREE.Group();
    const { node } = makeFace();
    root.add(node);
    const bodyMesh = node.children[1] as THREE.Mesh;
    const blink = new BlinkController(root);
    runFrames(blink, 2.15);
    expect(offsetOf(bodyMesh)).toBe(0);
  });

  it("顔のテクスチャは個体ごとに複製される(1体閉じても他が閉じない)", () => {
    // SkeletonUtils.clone はマテリアルもテクスチャも共有するので、
    // 複製しないと同じ種族が全員同時にまばたきしてしまう
    const shared = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const a = makeFace(shared);
    const b = makeFace(shared);
    const rootA = new THREE.Group();
    rootA.add(a.node);
    const rootB = new THREE.Group();
    rootB.add(b.node);
    new BlinkController(rootA);
    new BlinkController(rootB);

    const mapA = (a.face.material as THREE.MeshStandardMaterial).map!;
    const mapB = (b.face.material as THREE.MeshStandardMaterial).map!;
    expect(mapA).not.toBe(mapB);
    expect(mapA).not.toBe(shared.map);

    mapA.offset.x = 2 / 3;
    expect(mapB.offset.x).toBeCloseTo(0);
  });

  it("瞳だけ、待機中に位置がバウンディング半径の範囲内でランダムにずれる(サッケード)", () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // タイマーを最長にしつつ、オフセットも最大側に固定

    const root = new THREE.Group();
    const pupilRadius = 0.05;
    const pupil = makeEye("pupil", pupilRadius);
    pupil.position.set(0.1, 0.2, 0.3);
    root.add(pupil);
    const blink = new BlinkController(root);

    const baseX = pupil.position.x;
    const baseY = pupil.position.y;
    const baseZ = pupil.position.z;

    // サッケードの最長間隔(5.5秒)を超えるまで進める
    runFrames(blink, 6);

    // ずれは半径のごく一部(SACCADE_RADIUS_FRACTION=0.12 * 半径)に収まる
    const maxOffset = pupilRadius * 0.12;
    expect(Math.abs(pupil.position.x - baseX)).toBeLessThanOrEqual(maxOffset + 1e-9);
    expect(Math.abs(pupil.position.y - baseY)).toBeLessThanOrEqual(maxOffset + 1e-9);
    // 奥行き(Z、protrusion方向)はサッケードで動かさない
    expect(pupil.position.z).toBe(baseZ);
  });
});
