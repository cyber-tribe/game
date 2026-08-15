import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import type { Vec2 } from "../core/grid";
import type { MoodVisual } from "../entities/moods";

/**
 * 色調グレーディング(plan/game/post-processing-stack.md)。彩度を少し上げ、
 * 暗部にわずかな青みを足し、画面端を薄く暗くする。外部LUT画像は使わず、
 * 「アセットはコードから生成する」方針に合わせて小さな自作シェーダーにする。
 */
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.08 },
    shadowTint: { value: new THREE.Vector3(0.02, 0.03, 0.05) },
    vignetteStrength: { value: 0.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform vec3 shadowTint;
    uniform float vignetteStrength;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(vec3(luma), texel.rgb, saturation);
      // 暗部だけ青みを足す(明るい部分ほど寄与が小さくなるよう二乗で減衰)
      float shadowAmount = (1.0 - luma) * (1.0 - luma);
      graded += shadowTint * shadowAmount;
      // 画面端をわずかに暗くする
      float dist = length(vUv - 0.5) * 2.0;
      graded *= 1.0 - vignetteStrength * dist * dist;
      gl_FragColor = vec4(graded, texel.a);
    }
  `,
};

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
/** 影を落とす範囲の半径(マス)。見えている範囲を覆えるだけあれば足りる */
const SHADOW_HALF_SPAN = 12;

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly playerLight: THREE.PointLight;
  /**
   * ダンジョン画面だけに掛けるポストプロセスチェーン
   * (plan/game/post-processing-stack.md)。図鑑ギャラリー・村(拠点)は
   * `renderer.renderer.render(...)`にだけ相乗りする既存の描画経路のままで、
   * このcomposerを経由しない。
   */
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  /** 影を落とす唯一の光。注視点に合わせて動かす */
  private readonly key: THREE.DirectionalLight;
  /** 気分の視覚演出(plan/mood-visual-effects.md)で色・強度を差し替える対象 */
  private readonly fog: THREE.Fog;
  private readonly ambient: THREE.AmbientLight;
  /** 影の視錐台を最後に合わせた位置。動いたぶんだけ描き直す */
  private readonly shadowAnchor = new THREE.Vector3(Infinity, 0, Infinity);

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
    // ターン制なので影を毎フレーム描き直す必要はない。既定のままだと
    // 1024×1024 の影マップをフレームごとに作り直すことになり、拠点画面に
    // 隠れているあいだも払い続けることになる。動きがある間だけ更新する
    // (呼び出し側は requestShadowUpdate を使う)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;

    this.scene.background = new THREE.Color(0x05060c);
    // フォグの開始距離はカメラからプレイヤーまでの距離より遠くに置く。
    // でないと主役が最初から霞んでしまう
    this.fog = new THREE.Fog(0x070912, 16, 34);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);

    // 洞窟の底なので全体は青く沈ませ、プレイヤーの周りだけを暖色で照らす
    this.ambient = new THREE.AmbientLight(0x6674a0, 1.7);
    this.scene.add(this.ambient);

    // 影を落とすのはこの1灯だけ。盤面は 48×36 マスあるので、視錐台を原点に
    // 固定したままだと原点付近にしか影が出ない。カメラの注視点に合わせて
    // 動かし、見えている範囲だけを狭く覆う
    const key = new THREE.DirectionalLight(0xaec2f5, 0.85);
    key.position.set(6, 14, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    const shadowCam = key.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -SHADOW_HALF_SPAN;
    shadowCam.right = SHADOW_HALF_SPAN;
    shadowCam.top = SHADOW_HALF_SPAN;
    shadowCam.bottom = -SHADOW_HALF_SPAN;
    this.scene.add(key);
    this.scene.add(key.target);
    this.key = key;

    // 松明の代わり。プレイヤーに付いてまわる暖色の光
    this.playerLight = new THREE.PointLight(0xffd2a6, 30, 13, 1.4);
    this.playerLight.position.set(0, 2.0, 0);
    this.scene.add(this.playerLight);

    // ポストプロセスチェーン: RenderPass → ブルーム → 色調グレーディング
    // → SMAA(AA) → OutputPass(トーンマッピング+色空間変換を一括適用)。
    // composer経由だとMSAA(antialias: true)が効かなくなるため、代わりに
    // SMAAPassでAAを掛ける。OutputPassは必ず最後に置く(renderer.toneMapping/
    // outputColorSpaceの設定をここで反映するため)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.4, 0.9);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new ShaderPass(GRADE_SHADER));
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", () => this.resize());
    // 画面回転・アドレスバーの伸縮(100dvh)・レイアウト変更を漏れなく拾う。
    // resizeイベントだけに頼ると、iOS Safariでは回転直後の発火時点で
    // clientWidth/clientHeightがまだ回転前の値のことがあり、縦長のバッファが
    // 横長のCSSサイズへ引き伸ばされて「縦に潰れた」表示のまま固定される。
    // ResizeObserverはcanvasの実際のボックスが変わったときに発火するので、
    // 値が確定してから追従できる。setSizeはupdateStyle=falseでCSSを変えない
    // ため、監視対象のサイズが変わらず無限ループにもならない
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    // レイアウト計算前・非表示中は0が返る。0で割ると投影行列が壊れるので触らない
    if (width <= 0 || height <= 0) return;
    // 端末をまたぐ(外部ディスプレイへ移す等)と実効の画素密度も変わりうる
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // composerはコンストラクタでrendererにぶら下げた時点のサイズ(1x1)を
    // 引きずっているため、renderer本体のリサイズに追従させる。
    // EffectComposer.setSizeは中のパス(ブルームの半解像度計算含む)にも
    // 自動で伝播する
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  /**
   * 気分の視覚演出(plan/mood-visual-effects.md)。Fog・AmbientLightの
   * 色・強度を差し替える。ダイブ中に気分が変わることはないので、
   * フェード等のアニメーションは持たず即座に切り替える
   */
  setMoodVisual(visual: MoodVisual): void {
    this.fog.color.setHex(visual.fogColor);
    this.fog.near = visual.fogNear;
    this.fog.far = visual.fogFar;
    this.ambient.color.setHex(visual.ambientColor);
    this.ambient.intensity = visual.ambientIntensity;
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

  /**
   * カメラの向きを90度単位で表した値(0〜3、反時計回りに増える)。
   * 画面基準の入力をワールドの方角へ直すのに使う(issue #463)。
   *
   * 補間中の`yaw`ではなく確定値の`targetYaw`から出すので、回転アニメーションの
   * 途中でパッドを倒しても向き先が揺れない
   */
  get cameraQuadrant(): number {
    const steps = Math.round(this.targetYaw / (Math.PI / 2));
    return ((steps % 4) + 4) % 4;
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

    // 影の視錐台を注視点に追従させる。1マス以上ずれたときだけ動かし、
    // そのぶん影を描き直す(毎フレーム動かすと影マップを毎回作り直すことになる)
    if (this.shadowAnchor.distanceToSquared(this.focus) > 1) {
      this.shadowAnchor.copy(this.focus);
      this.key.position.set(this.focus.x + 6, 14, this.focus.z + 4);
      this.key.target.position.set(this.focus.x, 0, this.focus.z);
      this.key.target.updateMatrixWorld();
      this.requestShadowUpdate();
    }
  }

  /** 次の描画で影を作り直す。ターンが動いたとき・場面が変わったときに呼ぶ */
  requestShadowUpdate(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(): void {
    this.composer.render();
    // three は描画のたびに needsUpdate を落とすが、自前で管理していることを
    // はっきりさせるためここでも倒しておく
    this.renderer.shadowMap.needsUpdate = false;
  }

  /**
   * ブルームだけを止める、モバイル負荷対策の逃げ道
   * (plan/game/post-processing-stack.md)。色調グレーディング・AAは
   * 負荷が軽いため対象にしない。
   */
  setBloomEnabled(enabled: boolean): void {
    this.bloomPass.enabled = enabled;
  }
}
