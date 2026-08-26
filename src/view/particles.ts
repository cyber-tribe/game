import * as THREE from "three";

/**
 * 戦闘パーティクルVFX(plan/game/archive/combat-vfx-particles.md)。
 *
 * 種別ごとに固定長のリングバッファを持つ THREE.Points を1つずつ(計3個)
 * 用意し、粒の生成・破棄をしない。位置計算は頂点シェーダーで
 * `spawnTime`/`lifetime`からの経過だけを見て行うため、CPU側は
 * 毎フレーム`uTime`を進めるだけで済む。
 */

const CAPACITY = 256;

/** 接地影(actorView.ts)と同じ方式: コード生成の放射状グラデーション */
function makeSoftDotTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.7)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

let sharedDotTexture: THREE.CanvasTexture | null | undefined;
function getDotTexture(): THREE.CanvasTexture | null {
  if (sharedDotTexture === undefined) sharedDotTexture = makeSoftDotTexture();
  return sharedDotTexture;
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 velocity;
  attribute float spawnTime;
  attribute float lifetime;
  attribute float sizeStart;
  attribute vec3 pColor;

  uniform float uTime;
  uniform float uGravity;
  uniform float uBaseSize;

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vColor = pColor;
    float age = uTime - spawnTime;
    // 生きている粒か(発火済み・寿命内)。分岐ではなく乗算のマスクにする。
    // 実機(iOSのMetal経由)ではシェーダーが fast-math 相当で最適化され、
    // 分岐の片側で作られた inf/NaN が「通らないはずの側」へ漏れて、寿命切れの
    // 粒が巨大な光の円や色付きの粒として描かれることがある(issue #551)。
    // そのため (1) どの経路でも inf/NaN を作らない(除算は max でガード)、
    // (2) 隠すかどうかはサイズ・不透明度への乗算で決める、の2本立てにする
    float alive = step(0.0, age) * step(age, lifetime) * step(1e-4, lifetime);
    float lifeT = clamp(age / max(lifetime, 1e-3), 0.0, 1.0);
    float clampedAge = min(age, lifetime);
    vec3 pos = position + velocity * clampedAge;
    pos.y += -0.5 * uGravity * clampedAge * clampedAge;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = mix(vec4(0.0, 0.0, 2.0, 1.0), projectionMatrix * mvPosition, alive);
    // 距離による拡大は近すぎる粒で発散する(-z が 0 に近づくと除算が暴れる)ので、
    // 分母と結果の両方を抑える。上限160pxで、画面を覆う巨大円は物理的に出せない。
    //
    // 係数は 6.0(以前は 300.0)。300 だと uBaseSize の26倍(2000px超)を要求して
    // 全粒が上限に張り付き、火花のはずが画面の1/3を覆う光球になっていた
    // (issue #551。計画書の未決事項「サイズの最終値はブルーム導入後の見た目で
    // 詰める」をここで確定させた)。distはmvPosition.z由来の実際のカメラ距離
    // そのもの(固定値ではない)なので、カメラの既定距離(plan/game/archive/
    // dungeon-camera-distance.md)を変えても3Dモデルと同じ比率で追従し、
    // 再調整は不要(11.5→8への変更時に実測でも確認済み)
    float dist = max(-mvPosition.z, 0.5);
    gl_PointSize = clamp(uBaseSize * sizeStart * (1.0 - lifeT * 0.4) * (6.0 / dist), 0.0, 160.0) * alive;
    vAlpha = (1.0 - lifeT) * alive;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D map;
  uniform float uAlphaScale;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    float a = tex.a * vAlpha * uAlphaScale;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * tex.rgb, a);
  }
`;

interface PoolConfig {
  gravity: number;
  baseSize: number;
  blending: THREE.Blending;
  depthWrite: boolean;
  /**
   * 1粒あたりの不透明度の上限。加算合成のプールは粒が重なると輝度が積み上がり、
   * ブルーム(renderer.tsのUnrealBloomPass、閾値0.9)がその明部を巨大な光の円に
   * 膨らませてしまう(issue #551)。粒単体の見た目を保ちつつ、重なっても
   * 閾値を大きく超えないところまで下げるための係数
   */
  alphaScale: number;
}

/** 1種別ぶんの固定長パーティクルプール */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly velocityAttr: THREE.BufferAttribute;
  private readonly spawnTimeAttr: THREE.BufferAttribute;
  private readonly lifetimeAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private cursor = 0;

  constructor(config: PoolConfig) {
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3);
    this.velocityAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3);
    // 未発火スロットは spawnTime=0 / lifetime=0。シェーダーの alive マスクが
    // lifetime<1e-4 を死んだ粒として扱う。以前は spawnTime を -1e9 にしていたが、
    // 桁の大きい番兵値は実機の縮小精度(fp16相当)で inf に化けて
    // 計算全体を汚しうるので、小さい値で成立する形にしてある(issue #551)
    this.spawnTimeAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY), 1);
    this.lifetimeAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY), 1);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY).fill(1), 1);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3).fill(1), 3);
    this.geometry.setAttribute("position", this.positionAttr);
    this.geometry.setAttribute("velocity", this.velocityAttr);
    this.geometry.setAttribute("spawnTime", this.spawnTimeAttr);
    this.geometry.setAttribute("lifetime", this.lifetimeAttr);
    this.geometry.setAttribute("sizeStart", this.sizeAttr);
    this.geometry.setAttribute("pColor", this.colorAttr);
    // 全粒が常時「発火済みだが寿命切れ」の状態から始まるよう、
    // 描画範囲は毎フレーム全体(CAPACITY)のままでよい(頂点シェーダー側で隠す)
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: config.gravity },
        uBaseSize: { value: config.baseSize },
        uAlphaScale: { value: config.alphaScale },
        map: { value: getDotTexture() },
      },
      transparent: true,
      depthWrite: config.depthWrite,
      blending: config.blending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setTime(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }

  /**
   * count個の粒を発生させる。velocityFn(i) は粒ごとの初速を返す
   * (呼び出し側が扇状・放射状などの散らし方を決める)。
   */
  emit(
    time: number,
    origin: THREE.Vector3,
    count: number,
    lifetime: number,
    color: THREE.Color,
    sizeScale: number,
    velocityFn: (i: number) => THREE.Vector3,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      this.positionAttr.setXYZ(slot, origin.x, origin.y, origin.z);
      const v = velocityFn(i);
      this.velocityAttr.setXYZ(slot, v.x, v.y, v.z);
      this.spawnTimeAttr.setX(slot, time);
      this.lifetimeAttr.setX(slot, lifetime);
      this.sizeAttr.setX(slot, sizeScale * (0.8 + Math.random() * 0.4));
      this.colorAttr.setXYZ(slot, color.r, color.g, color.b);
    }
    this.positionAttr.needsUpdate = true;
    this.velocityAttr.needsUpdate = true;
    this.spawnTimeAttr.needsUpdate = true;
    this.lifetimeAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}

const SPARK_COLOR = new THREE.Color(0xffcf8a);
const DUST_COLOR = new THREE.Color(0x9a8a6a);

/** 扇状に散る初速を作る。dir が無ければ全方位に散る */
function randomBurstVelocity(speed: number, dir: THREE.Vector2 | null, spreadRad: number): THREE.Vector3 {
  const baseAngle = dir ? Math.atan2(dir.x, dir.y) : Math.random() * Math.PI * 2;
  const angle = baseAngle + (Math.random() - 0.5) * spreadRad;
  const upward = 0.4 + Math.random() * 0.6;
  const s = speed * (0.6 + Math.random() * 0.5);
  return new THREE.Vector3(Math.sin(angle) * s, upward * s * 0.6, Math.cos(angle) * s);
}

export class ParticleSystem {
  private readonly root = new THREE.Group();
  private readonly spark: ParticlePool;
  private readonly burst: ParticlePool;
  private readonly dust: ParticlePool;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.spark = new ParticlePool({
      gravity: 2.2,
      baseSize: 90,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaScale: 0.5,
    });
    this.burst = new ParticlePool({
      gravity: 1.6,
      baseSize: 110,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaScale: 0.5,
    });
    this.dust = new ParticlePool({
      gravity: 0.6,
      baseSize: 70,
      blending: THREE.NormalBlending,
      depthWrite: false,
      // 砂埃は通常合成で積み上がらないため下げない
      alphaScale: 1,
    });
    this.root.add(this.spark.points, this.burst.points, this.dust.points);
    scene.add(this.root);
  }

  update(dt: number): void {
    this.time += dt;
    this.spark.setTime(this.time);
    this.burst.setTime(this.time);
    this.dust.setTime(this.time);
  }

  /** 被弾のヒットスパーク。攻撃方向へ扇状に散る(方向不明なら全方位) */
  spawnHitSpark(origin: THREE.Vector3, dir: THREE.Vector2 | null, critical: boolean): void {
    const count = critical ? 14 : 9;
    const speed = critical ? 3.4 : 2.4;
    const sizeScale = critical ? 1.5 : 1;
    this.spark.emit(this.time, origin, count, 0.28, SPARK_COLOR, sizeScale, () =>
      randomBurstVelocity(speed, dir, Math.PI * 0.7));
  }

  /** 撃破時、体色の粒が散る「夢のかけら」演出 */
  spawnDefeatBurst(origin: THREE.Vector3, color: THREE.Color): void {
    this.burst.emit(this.time, origin, 20, 0.6, color, 1, () =>
      randomBurstVelocity(2.0, null, Math.PI * 2));
  }

  /** 爆発。既存の拡大球に重ねる大量の火花 */
  spawnExplosionSparks(origin: THREE.Vector3, radius: number): void {
    this.spark.emit(this.time, origin, 40, 0.5, SPARK_COLOR, 1.4, () =>
      randomBurstVelocity(2.5 + radius, null, Math.PI * 2));
  }

  /** 歩行の足元の砂埃 */
  spawnFootDust(origin: THREE.Vector3): void {
    this.dust.emit(this.time, origin, 3, 0.7, DUST_COLOR, 1, () =>
      randomBurstVelocity(0.4, null, Math.PI * 2));
  }
}
