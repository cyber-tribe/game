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
