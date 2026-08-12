import * as THREE from "three";
import type { Assets } from "./assets";
import { ActorView } from "./actorView";

/**
 * 図鑑ギャラリー(plan/gallery-mode.md)。1体のモデルを待機モーションで
 * 回転台に乗せて眺める、ダンジョンの盤面とは別の小さな見せ場。
 */
export class GalleryView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly turntable = new THREE.Group();
  private current: ActorView | null = null;
  private currentModel: string | null = null;
  private currentSilhouette = false;

  constructor(private readonly assets: Assets) {
    this.scene.background = new THREE.Color(0x090b16);
    this.scene.add(this.turntable);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    this.camera.position.set(0, 1.5, 4.4);
    this.camera.lookAt(0, 0.9, 0);

    this.scene.add(new THREE.AmbientLight(0x8fa0d8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.55);
    rim.position.set(-3, 2, -3.5);
    this.scene.add(rim);
  }

  /** 表示するモデルを切り替える。同じ内容ならやり直さない */
  show(model: string, silhouette: boolean): void {
    if (this.currentModel === model && this.currentSilhouette === silhouette) return;
    // モデルは起動時に一部だけ読み、残りは背景で追いかけている。まだ届いて
    // いなければ今回は何もしない。show は毎フレーム呼ばれるので、届いた
    // ところで自然に表示される
    if (!this.assets.has(model)) {
      this.assets.loadInBackground([model]);
      return;
    }
    this.clear();
    this.currentModel = model;
    this.currentSilhouette = silhouette;
    const view = new ActorView(this.assets.instantiate(model), { x: 0, y: 0 }, 4);
    if (silhouette) applySilhouette(view.root);
    this.current = view;
    this.turntable.add(view.root);
  }

  clear(): void {
    this.current?.dispose();
    this.current = null;
    this.currentModel = null;
  }

  update(dt: number): void {
    this.current?.update(dt);
    // ゆっくり自動回転する回転台。プレイヤー操作は増やさない
    this.turntable.rotation.y += dt * 0.5;
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * 図鑑の「見た」段階(まだ「捕まえた」ではない)は、影絵のような
 * シルエット表示に留める(plan/gallery-mode.mdの「隠さない」方針の応用)
 */
function applySilhouette(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = new THREE.MeshBasicMaterial({ color: 0x05060a });
    }
  });
}
