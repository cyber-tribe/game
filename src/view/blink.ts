import * as THREE from "three";

/**
 * まばたき・視線の微揺れ(plan/models/archive/eye-blink-liveliness.md、
 * plan/models/garudo-face-qa.md 第9段階)。
 *
 * 対象は`userData.blink`を持つオブジェクトだけ。名前ではなくカスタム
 * プロパティ(tools/models/common.pyのparent_to_bone、glTF extras経由)で
 * 判別するので、種族ごとに目の命名が揃っていなくてよい。
 *
 * 方式は2つある。どちらも同じ「まばたきの進み具合」(0=開、1=閉)で動く。
 *
 * - `"eyelid"`: **テクスチャの切り替え**。目のためだけの板は貼らない。
 *   顔のUV島だけを別マテリアルにしてあり、その1枚に
 *   open / half / closed を横に並べたアトラスが入っている。UVの
 *   オフセットだけを動かして切り替える。潰して閉じると設定画の目の形が
 *   崩れるので、閉じ目は設定画の「眠そう」から取った専用の絵。
 *   `blinkTiles`(コマ数)と`blinkMaterial`(顔のマテリアル名)を持つ。
 *   glTFの複数プリミティブはthreeでは子メッシュに分かれるので、
 *   タグの付いたノードの子孫からマテリアル名で顔を探す。
 * - `"white"` / `"pupil"`: 上下スケールを一瞬潰す従来方式(モンスター)。
 *   目が球で、絵として閉じ目を持たない種族向け。
 *
 * 瞳(`"pupil"`)には、待機中にごくわずかランダムな方向へ位置をずらす
 * 「サッケード」的な微揺れも足す(視線が固定されて見えないようにする)。
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

/**
 * まばたきの経過秒数 → 進み具合(0=全開、1=全閉)。
 * open → half → closed → half → open は、この値が0→1→0と動くことで
 * 起きる(コマ数ぶんに量子化するのは表示側)。
 */
export function blinkAmountAt(elapsed: number): number {
  if (elapsed < BLINK_CLOSE_SECONDS) return elapsed / BLINK_CLOSE_SECONDS;
  if (elapsed < BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS) return 1;
  const t = (elapsed - BLINK_CLOSE_SECONDS - BLINK_HOLD_SECONDS) / BLINK_OPEN_SECONDS;
  return Math.max(0, 1 - Math.min(1, t));
}

interface EyeEntry {
  object: THREE.Object3D;
  baseScaleY: number;
}

interface LidEntry {
  /** インスタンス専用に複製したテクスチャ。offset.xだけを動かす */
  map: THREE.Texture;
  tiles: number;
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
  private readonly lids: LidEntry[] = [];
  private readonly pupils: PupilEntry[] = [];
  private blinkTimer = randRange(BLINK_MIN_INTERVAL, BLINK_MAX_INTERVAL);
  private blinkElapsed = 0;
  private saccadeTimer = randRange(SACCADE_MIN_INTERVAL, SACCADE_MAX_INTERVAL);
  private lastTile = -1;

  constructor(root: THREE.Object3D) {
    root.traverse((obj) => {
      const kind = obj.userData.blink as string | undefined;
      if (kind === "eyelid") {
        this.lids.push(...this.adoptLids(obj));
        return;
      }
      if (kind !== "white" && kind !== "pupil") return;
      this.eyes.push({ object: obj, baseScaleY: obj.scale.y });
      if (kind === "pupil") {
        const geometry = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        geometry?.computeBoundingSphere();
        const radius = geometry?.boundingSphere?.radius ?? 0.02;
        this.pupils.push({ object: obj, baseX: obj.position.x, baseY: obj.position.y, radius });
      }
    });
    if (this.lids.length > 0) this.setTile(0);
  }

  /**
   * まぶたのパッチをこのインスタンス専用にする。
   *
   * assets.instantiate は SkeletonUtils.clone を使っており、マテリアルも
   * テクスチャも同じモデルの全インスタンス(とキャッシュしている元データ)で
   * 共有される。そこへ offset を書き込むと、1体がまばたきしただけで
   * 同じ種族が全員同時に目を閉じる。マテリアルとテクスチャを複製して、
   * **テクスチャの参照を持つ**(あとで別の処理がマテリアルを複製しても、
   * 複製先は同じテクスチャを指すので効き続ける)。
   */
  private adoptLids(tagged: THREE.Object3D): LidEntry[] {
    const wanted = String(tagged.userData.blinkMaterial ?? "");
    const tiles = Number(tagged.userData.blinkTiles) || 1;
    const out: LidEntry[] = [];
    tagged.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!material?.map) return;
      if (wanted && material.name !== wanted) return;
      const own = material.clone() as THREE.MeshStandardMaterial;
      const map = material.map.clone();
      map.needsUpdate = true;
      own.map = map;
      mesh.material = own;
      out.push({ map, tiles });
    });
    return out;
  }

  update(dt: number): void {
    if (this.eyes.length === 0 && this.lids.length === 0) return;

    if (this.blinkElapsed > 0 || this.blinkTimer <= 0) {
      this.blinkElapsed += dt;
      if (this.blinkElapsed >= BLINK_TOTAL_SECONDS) {
        this.blinkElapsed = 0;
        this.blinkTimer = randRange(BLINK_MIN_INTERVAL, BLINK_MAX_INTERVAL);
        this.apply(0);
      } else {
        this.apply(blinkAmountAt(this.blinkElapsed));
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

  /** amount: 0=全開 1=全閉 */
  private apply(amount: number): void {
    const factor = 1 - (1 - BLINK_MIN_SCALE) * amount;
    for (const eye of this.eyes) eye.object.scale.y = eye.baseScaleY * factor;
    if (this.lids.length > 0) this.setTile(amount);
  }

  /**
   * 進み具合をコマへ量子化して貼り替える。3コマなら
   * 0.0→open / 0.5→half / 1.0→closed。同じコマなら書き込まない
   * (毎フレームのテクスチャ更新を避ける)。
   */
  private setTile(amount: number): void {
    const first = this.lids[0]!;
    const index = Math.min(first.tiles - 1, Math.max(0, Math.round(amount * (first.tiles - 1))));
    if (index === this.lastTile) return;
    this.lastTile = index;
    for (const lid of this.lids) lid.map.offset.x = index / lid.tiles;
  }
}
