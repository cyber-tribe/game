/**
 * モデルのエンジン内プレビュー(plan/models/archive/engine-preview-snapshots.md、
 * plan/models/archive/preview-animation-gif.md)。
 *
 * `preview_engine.mjs`がPlaywrightで開くだけの、確認専用の最小シーン。
 * `Assets`(実際のゲームと同じGLTFLoader→トゥーンマテリアル変換→輪郭線
 * 追加のパイプライン)でモデルを読み、`renderConfig.ts`(ダンジョンの
 * `Renderer`と共有)の光源・ポストプロセス設定で描画する。
 *
 * アニメーションクリップを持つモデルは、idle→walk→attack→hit→dieを
 * 順番に繋いだ1本のGIFにする(歩行・被弾・消滅を含む一連の動きの
 * 品質をGitHub上で確認できるようにする)。クリップを持たないモデル
 * (静止物・非スキンメッシュ)は、従来どおり1枚のPNGにする。
 *
 * URLクエリ:
 *   ?model=<名前>       必須。public/models/<名前>.glb を読む
 *   &turntable=1        商品確認用のターンテーブル1枚(後述)を作る
 *
 * ターンテーブルは**最終判定を目で行うための固定の6枚**
 * (plan/models/garudo-product-turntable.md)。数値のQAがいくら通っても
 * 「見た目がおかしい」が起きるのは自動QAの不備ではなく、キャラクター
 * デザインという問題の性質による。0/45/90/135/180°の5枚に、
 * **ゲーム実カメラ(距離8・仰角48°・注視点y0.5・FOV46)**の1枚を足す。
 * 照明・ポストは全部ゲーム本編と同じものを使う。
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Assets } from "../src/view/assets";
import { ActorView, type ClipName } from "../src/view/actorView";
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  BLOOM_PARAMS,
  CAMERA_FOV,
  GRADE_SHADER,
  FILL_LIGHT_COLOR,
  FILL_LIGHT_INTENSITY,
  KEY_LIGHT_COLOR,
  KEY_LIGHT_INTENSITY,
  PLAYER_LIGHT_COLOR,
  TONE_MAPPING,
  TONE_MAPPING_EXPOSURE,
} from "../src/view/renderConfig";
import { PLAYER_LIGHT } from "../src/view/renderer";

declare global {
  interface Window {
    __previewReady?: boolean;
    __previewError?: string;
    /** アニメーション付きモデルのみ。base64のdata URL(image/gif) */
    __gifDataUrl?: string;
    /** ターンテーブル。base64のdata URL(image/png) */
    __turntableDataUrl?: string;
  }
}

/** ターンテーブルの1枚の大きさ(GIFより大きく撮る。目で見る用) */
const TT_SIZE = 420;
/** 回して撮る角度。0=正面 */
const TT_ANGLES = [0, 45, 90, 135, 180] as const;
/**
 * ゲーム実カメラ(src/view/renderer.ts と同じ値)。ダンジョンで実際に
 * 見えている大きさ・角度で1枚撮るためのもの。ここで読めない造形は、
 * どれだけ寄りの絵が良くてもゲームでは効かない
 */
const GAME_CAM = { distance: 8, elevationDeg: 48, focusY: 0.5 } as const;
/** ゲーム実カメラの1枚を撮る解像度(縦)。実機の1080pに合わせる */
const GAME_SHOT_H = 1080;

/** 確認用途なので画質より軽さを優先する(plan/models/archive/preview-animation-gif.md) */
const SIZE = 256;
const FPS = 12;
const DT = 1 / FPS;
const DELAY_MS = Math.round(1000 / FPS);
const IDLE_SECONDS = 1.5;
const WALK_SECONDS = 1.5;

/** WebGLのreadPixelsは下から上の順で返るため、上下反転して通常の画像の並びに直す */
function flipY(src: Uint8Array, width: number, height: number): Uint8Array {
  const dst = new Uint8Array(src.length);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcStart = (height - 1 - y) * rowBytes;
    dst.set(src.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
  }
  return dst;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReaderが失敗した"));
    reader.readAsDataURL(blob);
  });
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const model = params.get("model");
  if (!model) throw new Error("?model=<名前> が要る");

  const assets = new Assets();
  // publicディレクトリの中身はサイトルート直下(/models/...)に配信される
  // (Viteの既定の挙動)。このハーネス自体は/tools/配下だが、絶対パスで
  // 指定するので現在ページの位置に関係なく解決できる
  await assets.ready([model], "/models");

  const canvas = document.querySelector("canvas") as HTMLCanvasElement;
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c); // 市松ではなく暗めの単色

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // **ゲーム本編と同じ灯りを揃える**(src/view/renderer.ts)。環境光とキーだけ
  // にしていたので、フィル光と**プレイヤーに付いてまわる松明の光**が抜けて
  // いた。ダンジョンの絵はこの松明で持っているので、抜けたままだと
  // エンジン内プレビューが実際のゲームよりずっと暗い(実測: ターンテーブルの
  // 1枚目がほぼ黒で、造形が読めなかった)
  scene.add(new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY));
  const key = new THREE.DirectionalLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY);
  key.position.set(2.5, 4, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(FILL_LIGHT_COLOR, FILL_LIGHT_INTENSITY);
  fill.position.set(-6, 8, -4);
  scene.add(fill);
  const torch = new THREE.PointLight(
    PLAYER_LIGHT_COLOR, PLAYER_LIGHT.intensity, PLAYER_LIGHT.distance, PLAYER_LIGHT.decay,
  );
  torch.position.set(0, PLAYER_LIGHT.height, 0);
  scene.add(torch);

  // まず素の状態で1体作り、大きさ(建物・キャラ・小道具で桁違いに違う)を
  // 測ってからカメラを決める。決め打ちだと小道具では余白だらけ、建物では
  // カメラが埋まって何も見えなくなる(実際にhouse_*系で発生した)
  const view = new ActorView(assets.instantiate(model), { x: 0, y: 0 });
  scene.add(view.root);
  view.update(0);

  const bounds = new THREE.Box3().setFromObject(view.root);
  const center = new THREE.Vector3();
  bounds.getCenter(center);
  const boundsSize = bounds.getSize(new THREE.Vector3());
  // 下限は小道具の余白対策だが、0.4だと12cmのガジリねずみが枠の1/4にしか
  // 写らず商品確認にならない。モデルの実寸で合わせ、極小の物だけ下限で受ける
  const boundsRadius = Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 0.08) / 2;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 500);
  const fitDistance = (boundsRadius * 1.5) / Math.tan((CAMERA_FOV * Math.PI) / 360);
  camera.position.set(center.x, center.y + boundsSize.y * 0.15, center.z + fitDistance);
  camera.lookAt(center.x, center.y, center.z);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(1, 1), BLOOM_PARAMS.strength, BLOOM_PARAMS.radius, BLOOM_PARAMS.threshold,
  ));
  composer.addPass(new ShaderPass(GRADE_SHADER));
  composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());
  composer.setSize(SIZE, SIZE);

  if (params.get("turntable")) {
    await renderTurntable();
    window.__previewReady = true;
    return;
  }

  const clipNames = new Set(assets.get(model).animations.map((clip) => clip.name));

  if (clipNames.size === 0) {
    // クリップを持たないモデル(静止物・非スキンメッシュ)は従来どおり1枚のPNG
    composer.render();
    window.__previewReady = true;
    return;
  }

  const gl = renderer.getContext();

  /**
   * 商品確認用のターンテーブル。**判定は数値ではなく目で行う**ための絵。
   * 6枚を横に並べた1枚のPNGにする。
   */
  async function renderTurntable(): Promise<void> {
    canvas.width = TT_SIZE;
    canvas.height = TT_SIZE;
    renderer.setSize(TT_SIZE, TT_SIZE, false);
    composer.setSize(TT_SIZE, TT_SIZE);
    view.play("idle");
    view.update(0.001);

    const sheet = document.createElement("canvas");
    sheet.width = TT_SIZE * (TT_ANGLES.length + 1);
    sheet.height = TT_SIZE;
    const ctx = sheet.getContext("2d");
    if (!ctx) throw new Error("2Dコンテキストが取れない");

    const shoot = (index: number): void => {
      composer.render();
      ctx.drawImage(canvas, index * TT_SIZE, 0);
    };

    // 1〜5枚目: model を回して撮る(カメラは固定、対象を回す)
    for (const [i, deg] of TT_ANGLES.entries()) {
      view.root.rotation.y = THREE.MathUtils.degToRad(deg);
      camera.position.set(center.x, center.y + boundsSize.y * 0.15, center.z + fitDistance);
      camera.lookAt(center.x, center.y, center.z);
      camera.fov = CAMERA_FOV;
      camera.updateProjectionMatrix();
      shoot(i);
    }

    // 6枚目: ゲーム実カメラ。距離・仰角・注視点を renderer.ts と揃える。
    // **画面解像度で撮って等倍で切り出す** ―― 距離8・FOV46だと
    // 1080pで主人公は約230px。420pxの枠へ引き伸ばすと「実際に何ピクセルで
    // 見えているか」が分からなくなるので、1080で撮って中央を等倍で抜く
    view.root.rotation.y = THREE.MathUtils.degToRad(45);
    renderer.setSize(GAME_SHOT_H, GAME_SHOT_H, false);
    composer.setSize(GAME_SHOT_H, GAME_SHOT_H);
    canvas.width = GAME_SHOT_H;
    canvas.height = GAME_SHOT_H;
    const elev = THREE.MathUtils.degToRad(GAME_CAM.elevationDeg);
    const horizontal = Math.cos(elev) * GAME_CAM.distance;
    camera.position.set(0, GAME_CAM.focusY + Math.sin(elev) * GAME_CAM.distance, horizontal);
    camera.lookAt(0, GAME_CAM.focusY, 0);
    camera.updateProjectionMatrix();
    composer.render();
    // キャラの画面上の位置(腰の高さ)を投影して、そこを中心に切り出す
    const at = new THREE.Vector3(0, 0.7, 0).project(camera);
    const cx = (at.x * 0.5 + 0.5) * GAME_SHOT_H;
    const cy = (-at.y * 0.5 + 0.5) * GAME_SHOT_H;
    ctx.fillStyle = "#14161c";
    ctx.fillRect(TT_ANGLES.length * TT_SIZE, 0, TT_SIZE, TT_SIZE);
    ctx.drawImage(
      canvas,
      Math.round(cx - TT_SIZE / 2), Math.round(cy - TT_SIZE / 2), TT_SIZE, TT_SIZE,
      TT_ANGLES.length * TT_SIZE, 0, TT_SIZE, TT_SIZE,
    );

    window.__turntableDataUrl = sheet.toDataURL("image/png");
  }

  const frames: { rgba: Uint8Array; delayMs: number }[] = [];

  function captureFrame(delayMs: number): void {
    composer.render();
    const raw = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    frames.push({ rgba: flipY(raw, SIZE, SIZE), delayMs });
  }

  function playAndCapture(clip: ClipName, seconds: number): void {
    view.play(clip);
    const steps = Math.max(1, Math.round(seconds * FPS));
    for (let i = 0; i < steps; i++) {
      view.update(DT);
      captureFrame(DELAY_MS);
    }
  }

  // idle→walk→attack→hit→die の順に繋いだ1本のループにする。die の
  // 終わりで待たず即座にidleへ再生し直す(死亡→復活を自然な区切りとして
  // 許容する。プレビュー用途なのでループの分かりやすさを優先する)
  playAndCapture("idle", IDLE_SECONDS);
  if (clipNames.has("walk")) playAndCapture("walk", WALK_SECONDS);
  for (const clip of ["attack", "hit", "die"] as const) {
    if (!clipNames.has(clip)) continue;
    const duration = assets.get(model).animations.find((c) => c.name === clip)?.duration ?? 1;
    playAndCapture(clip, duration);
  }

  // パレットは全クリップの色を拾えるよう、数コマおきに間引いたサンプルから作る
  // (idleの1枚だけだと被弾フラッシュ等の一瞬の色が量子化から漏れる)
  const sampleStride = Math.max(1, Math.floor(frames.length / 12));
  const sampleBytes = frames.filter((_, i) => i % sampleStride === 0)
    .reduce((total, f) => total + f.rgba.length, 0);
  const sample = new Uint8Array(sampleBytes);
  let offset = 0;
  for (let i = 0; i < frames.length; i += sampleStride) {
    sample.set(frames[i].rgba, offset);
    offset += frames[i].rgba.length;
  }
  const palette = quantize(sample, 128);

  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const index = applyPalette(frame.rgba, palette);
    gif.writeFrame(index, SIZE, SIZE, { palette, delay: frame.delayMs, first: i === 0, repeat: 0 });
  });
  gif.finish();

  const gifBytes: Uint8Array<ArrayBuffer> = new Uint8Array(gif.bytes());
  window.__gifDataUrl = await blobToDataUrl(new Blob([gifBytes], { type: "image/gif" }));
  window.__previewReady = true;
}

main().catch((err) => {
  window.__previewError = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(err);
});
