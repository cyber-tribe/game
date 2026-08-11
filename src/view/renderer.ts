import * as THREE from "three";
import type { Vec2 } from "../core/grid";

/** 1マスの大きさ。すべての座標変換はここを基準にする */
export const TILE = 1.0;

/** 盤面の (x, y) をワールド座標に移す。盤面の下方向(+y)がワールドの +z */
export function toWorld(pos: Vec2, height = 0): THREE.Vector3 {
  return new THREE.Vector3(pos.x * TILE, height, pos.y * TILE);
}

/**
 * 場面の入れ物。カメラは斜め見下ろしでプレイヤーを追う。
 * 真上からだと立体が分からず、低すぎると手前の壁で盤面が隠れるので、
 * その中間の角度に落ち着かせている。
 */
export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly playerLight: THREE.PointLight;

  /** カメラの水平角(ラジアン)。プレイヤーが回して視点を変えられる */
  yaw = 0;
  private targetYaw = 0;
  private readonly focus = new THREE.Vector3();
  private readonly desiredFocus = new THREE.Vector3();

  private distance = 11.5;
  private elevation = THREE.MathUtils.degToRad(48);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;

    this.scene.background = new THREE.Color(0x05060c);
    // フォグの開始距離はカメラからプレイヤーまでの距離より遠くに置く。
    // でないと主役が最初から霞んでしまう
    this.scene.fog = new THREE.Fog(0x070912, 16, 34);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);

    // 洞窟の底なので全体は青く沈ませ、プレイヤーの周りだけを暖色で照らす
    this.scene.add(new THREE.AmbientLight(0x6674a0, 1.7));

    const key = new THREE.DirectionalLight(0xaec2f5, 0.85);
    key.position.set(6, 14, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    const shadowCam = key.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -12;
    shadowCam.right = 12;
    shadowCam.top = 12;
    shadowCam.bottom = -12;
    this.scene.add(key);
    this.scene.add(key.target);

    // 松明の代わり。プレイヤーに付いてまわる暖色の光
    this.playerLight = new THREE.PointLight(0xffd2a6, 30, 13, 1.4);
    this.playerLight.position.set(0, 2.0, 0);
    this.scene.add(this.playerLight);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** カメラが注視する盤面上の位置。滑らかに追いつく */
  setFocus(pos: Vec2, immediate = false): void {
    this.desiredFocus.set(pos.x * TILE, 0.5, pos.y * TILE);
    if (immediate) this.focus.copy(this.desiredFocus);
  }

  /** 視点を90度ずつ回す */
  rotate(steps: number): void {
    this.targetYaw += (Math.PI / 2) * steps;
  }

  /** 寄り引き */
  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + delta, 6.5, 18);
  }

  update(dt: number): void {
    // 追従は指数移動平均。dt に依存しない形にしておくと、
    // フレームレートが揺れても追従の速さが変わらない
    const follow = 1 - Math.exp(-dt * 9);
    this.focus.lerp(this.desiredFocus, follow);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-dt * 10));

    const horizontal = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.elevation) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.focus);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
