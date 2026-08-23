import * as THREE from "three";

/**
 * まばたき・視線の微揺れ(plan/models/archive/eye-blink-liveliness.md)。
 *
 * 対象は`userData.blink`("white"または"pupil")を持つオブジェクトだけ。
 * 名前ではなくカスタムプロパティ(tools/models/common.pyのparent_to_bone、
 * glTF extras経由)で判別するので、種族ごとに目の命名が揃っていなくてよい。
 * 現状このタグを持つのはガルド・つぶてガエル・まぶたむしの3体(パイロット)。
 *
 * まばたきは白目・瞳のローカルY軸(上下、glTF書き出し後の上方向)スケールを
 * 一瞬0.05倍まで潰し、数フレームで戻す(新しいまぶたメッシュは作らない、
 * スライム系の潰し表現と同じ「スケールでごまかす」手法)。瞳だけ、待機中に
 * ごくわずかランダムな方向へ位置をずらす「サッケード」的な微揺れも足す
 * (視線が固定されて見えないようにする、ほぼ無料のおまけ)。
 */

const BLINK_MIN_INTERVAL = 2;
const BLINK_MAX_INTERVAL = 6;
/** 閉じ→止め→開きの秒数(24fpsの2〜3/1/2〜3フレーム相当) */
const BLINK_CLOSE_SECONDS = 0.1;
const BLINK_HOLD_SECONDS = 0.04;
const BLINK_OPEN_SECONDS = 0.12;
const BLINK_TOTAL_SECONDS = BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS + BLINK_OPEN_SECONDS;
const BLINK_MIN_SCALE = 0.05;

const SACCADE_MIN_INTERVAL = 2.5;
const SACCADE_MAX_INTERVAL = 5.5;
/** 瞳のバウンディング半径に対する、ずらす量の比率 */
const SACCADE_RADIUS_FRACTION = 0.12;

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** まばたきの経過秒数 → 上下スケールの倍率(1=全開、BLINK_MIN_SCALE=全閉) */
function blinkScaleAt(elapsed: number): number {
  if (elapsed < BLINK_CLOSE_SECONDS) {
    const t = elapsed / BLINK_CLOSE_SECONDS;
    return 1 - (1 - BLINK_MIN_SCALE) * t;
  }
  if (elapsed < BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS) {
    return BLINK_MIN_SCALE;
  }
  const t = (elapsed - BLINK_CLOSE_SECONDS - BLINK_HOLD_SECONDS) / BLINK_OPEN_SECONDS;
  return BLINK_MIN_SCALE + (1 - BLINK_MIN_SCALE) * Math.min(1, t);
}

interface EyeEntry {
  object: THREE.Object3D;
  baseScaleY: number;
}

interface PupilEntry {
  object: THREE.Object3D;
  baseX: number;
  baseY: number;
  radius: number;
}

/**
 * 1体ぶんのまばたき・サッケード管理。`ActorView`が`instance.root`から
 * 対象を集めて保持し、毎フレーム`update()`を呼ぶ。インスタンスごとに
 * 独立したランダムタイマーを持つので、同じ種族が画面に複数いても
 * まばたきのタイミングは揃わない。対象が無いモデルではupdate()は
 * 早期に抜けるだけで、余分なコストは掛からない。
 */
export class BlinkController {
  private readonly eyes: EyeEntry[] = [];
  private readonly pupils: PupilEntry[] = [];
  private blinkTimer = randRange(BLINK_MIN_INTERVAL, BLINK_MAX_INTERVAL);
  private blinkElapsed = 0;
  private saccadeTimer = randRange(SACCADE_MIN_INTERVAL, SACCADE_MAX_INTERVAL);

  constructor(root: THREE.Object3D) {
    root.traverse((obj) => {
      const kind = obj.userData.blink as string | undefined;
      if (kind !== "white" && kind !== "pupil") return;
      this.eyes.push({ object: obj, baseScaleY: obj.scale.y });
      if (kind === "pupil") {
        const geometry = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        geometry?.computeBoundingSphere();
        const radius = geometry?.boundingSphere?.radius ?? 0.02;
        this.pupils.push({ object: obj, baseX: obj.position.x, baseY: obj.position.y, radius });
      }
    });
  }

  update(dt: number): void {
    if (this.eyes.length === 0) return;

    if (this.blinkElapsed > 0 || this.blinkTimer <= 0) {
      this.blinkElapsed += dt;
      if (this.blinkElapsed >= BLINK_TOTAL_SECONDS) {
        this.blinkElapsed = 0;
        this.blinkTimer = randRange(BLINK_MIN_INTERVAL, BLINK_MAX_INTERVAL);
        this.setEyeScale(1);
      } else {
        this.setEyeScale(blinkScaleAt(this.blinkElapsed));
      }
    } else {
      this.blinkTimer -= dt;
    }

    if (this.pupils.length > 0) {
      this.saccadeTimer -= dt;
      if (this.saccadeTimer <= 0) {
        this.saccadeTimer = randRange(SACCADE_MIN_INTERVAL, SACCADE_MAX_INTERVAL);
        for (const pupil of this.pupils) {
          const r = pupil.radius * SACCADE_RADIUS_FRACTION;
          pupil.object.position.x = pupil.baseX + randRange(-r, r);
          pupil.object.position.y = pupil.baseY + randRange(-r, r);
        }
      }
    }
  }

  private setEyeScale(factor: number): void {
    for (const eye of this.eyes) eye.object.scale.y = eye.baseScaleY * factor;
  }
}
