import * as THREE from "three";

/**
 * 口の開閉をテクスチャで切り替える(plan/models/akubitokage-remake.md、
 * handbook/cage-and-2d3d-split.md)。
 *
 * あくびとかげの「大あくび」は、下顎を別メッシュに割って回す方式
 * (方式1)を一度きりの技術スパイクとして試し、閉口時に口内が輪郭から
 * はみ出すため棄却した。代わりに、顔のUV島だけを別マテリアルにして
 * 「閉じ / 半開き / 大あくび」を横に並べたアトラスを貼り、UVの
 * オフセットだけを動かす。3Dの顎ボーンは頬と喉のふくらみを担い、
 * 口そのものは絵が開く。
 *
 * コマの選択は**顎ボーンの静止姿勢からの開き角**から決める。
 * クリップ側にタイミングのカーブを二重に持たせないので、
 * アニメーションを直せば口の絵も自動で追従する。
 *
 * 必要なglTF extras(モデル側で付ける):
 * - `mouthTiles`    アトラスのコマ数(左端が閉じ)
 * - `mouthMaterial` 顔のマテリアル名
 * - `mouthBone`     顎のボーン名
 * - `mouthOpenDeg`  コマ最大(いちばん右)に対応する開き角(度)
 *
 * 対象を持たないモデルでは`update()`は即座に抜ける。
 */

interface MouthEntry {
  /** インスタンス専用に複製したテクスチャ。offset.xだけを動かす */
  map: THREE.Texture;
  tiles: number;
}

/**
 * glTFのノード名は three の GLTFLoader が `PropertyBinding.sanitizeNodeName`
 * を通すので、`.` などが落ちることがある。Blender側の名前をそのまま
 * 探して見つからなければ、同じ規則で正規化して探し直す。
 */
function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const direct = root.getObjectByName(name);
  if (direct) return direct;
  const sanitized = THREE.PropertyBinding.sanitizeNodeName(name);
  return root.getObjectByName(sanitized) ?? null;
}

export class MouthController {
  private readonly parts: MouthEntry[] = [];
  private bone: THREE.Object3D | null = null;
  private readonly rest = new THREE.Quaternion();
  private openRad = Math.PI / 3;
  private lastTile = -1;

  /**
   * `root`は必ず**アニメーションを1フレームも進める前**に渡すこと。
   * 顎ボーンの現在の姿勢を「静止姿勢」として控えるため、既に口が
   * 開いた状態で作ると、その角度が0として基準になってしまう。
   */
  constructor(root: THREE.Object3D) {
    root.traverse((obj) => {
      const tiles = Number(obj.userData.mouthTiles);
      if (!Number.isFinite(tiles) || tiles < 2) return;
      const wanted = String(obj.userData.mouthMaterial ?? "");
      const openDeg = Number(obj.userData.mouthOpenDeg);
      if (Number.isFinite(openDeg) && openDeg > 0) {
        this.openRad = THREE.MathUtils.degToRad(openDeg);
      }
      const boneName = String(obj.userData.mouthBone ?? "");
      if (boneName && !this.bone) {
        this.bone = findBone(root, boneName);
        if (this.bone) this.rest.copy(this.bone.quaternion);
      }
      this.parts.push(...this.adopt(obj, wanted, tiles));
    });
    if (this.parts.length > 0) this.setTile(0);
  }

  /**
   * 顔のパッチをこのインスタンス専用にする。
   *
   * assets.instantiate は SkeletonUtils.clone を使っており、マテリアルも
   * テクスチャも同じモデルの全インスタンス(とキャッシュしている元データ)で
   * 共有される。そこへ offset を書き込むと、1体があくびしただけで同じ
   * 種族が全員同時に口を開ける(BlinkControllerと同じ理由)。
   */
  private adopt(tagged: THREE.Object3D, wanted: string, tiles: number): MouthEntry[] {
    const out: MouthEntry[] = [];
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

  /** 顎ボーンの静止姿勢からの開き具合(0=閉じ、1=最大)。 */
  openAmount(): number {
    if (!this.bone) return 0;
    const dot = Math.min(1, Math.abs(this.rest.dot(this.bone.quaternion)));
    const angle = 2 * Math.acos(dot);
    return Math.min(1, angle / this.openRad);
  }

  /** ActorViewが毎フレーム呼ぶ。ミキサーを進めた**後**に呼ぶこと。 */
  update(): void {
    if (this.parts.length === 0 || !this.bone) return;
    this.setTile(this.openAmount());
  }

  /**
   * 開き具合をコマへ量子化して貼り替える。3コマなら
   * 0.0→閉じ / 0.5→半開き / 1.0→大あくび。同じコマなら書き込まない。
   */
  private setTile(amount: number): void {
    const first = this.parts[0]!;
    const index = Math.min(first.tiles - 1, Math.max(0, Math.round(amount * (first.tiles - 1))));
    if (index === this.lastTile) return;
    this.lastTile = index;
    for (const part of this.parts) part.map.offset.x = index / part.tiles;
  }
}
