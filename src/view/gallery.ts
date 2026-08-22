import * as THREE from "three";
import type { Assets } from "./assets";
import { ActorView } from "./actorView";
import { currentInputMode } from "../ui/inputMode";
import { interiorFilmOffset } from "./villageInterior";

/** 手動操作(plan/gallery-interactive-camera.md)が無いまま、この秒数が経つと自動回転を再開する */
const AUTO_ROTATE_RESUME_SEC = 5;
/** 手動回転(Q/E)1回あたりの角度 */
const ROTATE_STEP = Math.PI / 6;
/** ズーム(+/-)の可動範囲。カメラ位置ベクトルへの倍率(ダンジョン内ズームの距離とは別の範囲) */
const ZOOM_SCALE_MIN = 0.55;
const ZOOM_SCALE_MAX = 1.7;
const ZOOM_STEP = 0.12;

/**
 * スマホ(pointer: coarse)だけ、視錐台を右へずらしてモデルを解説パネル
 * (#gallery-info、画面左側)の反対側に寄せる(issue #838: パネルが
 * 回転台の真上に重なり、モデルがほとんど見えなくなっていた)。デスクトップ
 * は現状の中央パネルのままで問題が出ていないため、タッチ環境限定にする。
 * `src/view/villageInterior.ts`の`INTERIOR_VIEW_SHIFT`と同じ
 * `interiorFilmOffset`(絵が歪まない視錐台シフト)の手法を流用する
 */
const GALLERY_VIEW_SHIFT = 0.34;

/**
 * 図鑑ギャラリー(plan/gallery-mode.md)。1体のモデルを待機モーションで
 * 回転台に乗せて眺める、ダンジョンの盤面とは別の小さな見せ場。
 *
 * 手動カメラ操作(plan/gallery-interactive-camera.md): ダンジョン内の
 * フォトモードと同じQ/E(回転)・+/-(ズーム)キーを流用する。操作が無い
 * あいだは、既存の自動回転を「待機時アニメーション」として続ける
 */
export class GalleryView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly turntable = new THREE.Group();
  private current: ActorView | null = null;
  private currentModel: string | null = null;
  private currentSilhouette = false;
  private readonly baseCameraPos = new THREE.Vector3(0, 1.5, 4.4);
  private zoomScale = 1;
  private idleSec = 0;
  private aspect = 1;

  constructor(private readonly assets: Assets) {
    this.scene.background = new THREE.Color(0x090b16);
    this.scene.add(this.turntable);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    this.camera.position.copy(this.baseCameraPos);
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
    // 別の個体に切り替えたときは、前の個体で操作したズーム・待機状態を持ち越さない
    this.zoomScale = 1;
    this.idleSec = 0;
    this.applyZoom();
  }

  clear(): void {
    this.current?.dispose();
    this.current = null;
    this.currentModel = null;
  }

  /** 手動カメラ操作(plan/gallery-interactive-camera.md)。ダンジョン内フォトモードのQ/Eキーを流用する */
  rotate(steps: number): void {
    this.turntable.rotation.y += steps * ROTATE_STEP;
    this.idleSec = 0;
  }

  /** 手動カメラ操作。ダンジョン内フォトモードの+/-キーを流用する。deltaが負のとき寄る */
  zoom(delta: number): void {
    this.zoomScale = THREE.MathUtils.clamp(this.zoomScale + delta * ZOOM_STEP, ZOOM_SCALE_MIN, ZOOM_SCALE_MAX);
    this.applyZoom();
    this.idleSec = 0;
  }

  private applyZoom(): void {
    this.camera.position.copy(this.baseCameraPos).multiplyScalar(this.zoomScale);
    this.camera.lookAt(0, 0.9, 0);
  }

  update(dt: number): void {
    this.current?.update(dt);
    // 操作が無いあいだだけ、既存のゆっくりした自動回転を「待機時アニメーション」として続ける
    this.idleSec += dt;
    if (this.idleSec >= AUTO_ROTATE_RESUME_SEC) {
      this.turntable.rotation.y += dt * 0.5;
    }
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.aspect = aspect;
    this.applyProjection();
  }

  private applyProjection(): void {
    // #gallery-infoを画面左に置く(index.htmlの@media (pointer: coarse))ぶん、
    // タッチ環境だけモデルを右へ寄せる。デスクトップは中央のままで問題が
    // 出ていないため変えない(issue #838)
    if (currentInputMode() === "touch") {
      this.camera.filmOffset = interiorFilmOffset(38, this.aspect, GALLERY_VIEW_SHIFT, this.camera.filmGauge);
    }
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
