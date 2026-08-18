import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ParticleSystem } from "../src/view/particles";

/**
 * パーティクルのリングバッファが inf/NaN の温床にならないこと(issue #551)。
 *
 * 実機(iOSのMetal経由)ではシェーダーが fast-math 相当で最適化され、
 * 分岐の片側で作られた inf/NaN が漏れて、寿命切れの粒が巨大な光の円や
 * 色付きの粒として描かれることがある。デスクトップGLでは偶然見えないため、
 * ここでは「シェーダーに極端な値・除算の暴れを持ち込まない」という
 * CPU側の不変条件を留めておく。
 */

function makePools(): THREE.Points[] {
  const scene = new THREE.Scene();
  new ParticleSystem(scene);
  const points: THREE.Points[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Points).isPoints) points.push(o as THREE.Points);
  });
  return points;
}

function attr(points: THREE.Points, name: string): Float32Array {
  return (points.geometry.getAttribute(name) as THREE.BufferAttribute).array as Float32Array;
}

describe("view/particles.ts: リングバッファの安全な初期値 (#551)", () => {
  it("プールは3種類(スパーク・バースト・砂埃)ある", () => {
    expect(makePools()).toHaveLength(3);
  });

  it("未発火スロットは lifetime=0 で死んでいる(aliveマスクの前提)", () => {
    for (const p of makePools()) {
      for (const v of attr(p, "lifetime")) expect(v).toBe(0);
    }
  });

  it("番兵値に桁の大きい値を使わない(fp16でinfに化ける -1e9 の再発防止)", () => {
    for (const p of makePools()) {
      for (const name of ["position", "velocity", "spawnTime", "lifetime", "sizeStart", "pColor"]) {
        for (const v of attr(p, name)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThanOrEqual(1e4);
        }
      }
    }
  });

  it("発生させた粒の属性はすべて有限値", () => {
    const scene = new THREE.Scene();
    const system = new ParticleSystem(scene);
    system.update(0.5);
    system.spawnHitSpark(new THREE.Vector3(3, 0.5, 4), new THREE.Vector2(1, 0), true);
    system.spawnDefeatBurst(new THREE.Vector3(1, 0.5, 1), new THREE.Color(0x66cc88));
    system.spawnExplosionSparks(new THREE.Vector3(2, 0.5, 2), 1.5);
    system.spawnFootDust(new THREE.Vector3(0, 0, 0));
    const points: THREE.Points[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Points).isPoints) points.push(o as THREE.Points);
    });
    for (const p of points) {
      for (const name of ["position", "velocity", "spawnTime", "lifetime", "sizeStart", "pColor"]) {
        for (const v of attr(p, name)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("シェーダーは除算ガード・aliveマスク・サイズ上限を持つ", () => {
    // シェーダー文字列の検査は壊れやすいが、この3つは #551 の再発防止の
    // 本体なので、消えたらテストで気づけるようにしておく
    const p = makePools()[0]!;
    const vs = (p.material as THREE.ShaderMaterial).vertexShader;
    expect(vs).toContain("max(lifetime,");
    expect(vs).toContain("float alive = step(");
    expect(vs).toMatch(/gl_PointSize = clamp\(/);
  });
});
