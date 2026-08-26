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
 *   ?size=<px>          省略時256。看板モデルの「よそ行きの1枚」用に
 *                        高解像度を指定できる(plan/models/archive/
 *                        garudo-hero-quality-pass.md)
 *   ?static=1           クリップを持つモデルでも、idleの1コマだけを
 *                        1枚のPNGとして撮る(GIF化しない)。同じく
 *                        商品ページ向けの静止した1枚を撮る用途
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
  KEY_LIGHT_COLOR,
  KEY_LIGHT_INTENSITY,
  TONE_MAPPING,
  TONE_MAPPING_EXPOSURE,
} from "../src/view/renderConfig";

declare global {
  interface Window {
    __previewReady?: boolean;
    __previewError?: string;
    /** アニメーション付きモデルのみ。base64のdata URL(image/gif) */
    __gifDataUrl?: string;
  }
}

/** 確認用途なので画質より軽さを優先する(plan/models/archive/preview-animation-gif.md)。
 *  ?sizeで上書きできる(plan/models/archive/garudo-hero-quality-pass.mdの
 *  「よそ行きの1枚」用) */
const SIZE = Number(new URLSearchParams(location.search).get("size")) || 256;
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

  scene.add(new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY));
  const key = new THREE.DirectionalLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY);
  key.position.set(2.5, 4, 2);
  scene.add(key);

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
  const boundsRadius = Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 0.4) / 2;

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

  const clipNames = new Set(assets.get(model).animations.map((clip) => clip.name));
  const staticPose = params.get("static") === "1";

  if (clipNames.size === 0 || staticPose) {
    // クリップを持たないモデル(静止物・非スキンメッシュ)は従来どおり1枚のPNG。
    // ?static=1のときはクリップを持つモデルでもidleの1コマだけを撮る
    // (plan/models/archive/garudo-hero-quality-pass.mdの「よそ行きの1枚」)
    if (staticPose && clipNames.has("idle")) {
      view.play("idle");
      view.update(0);
    }
    composer.render();
    window.__previewReady = true;
    return;
  }

  const gl = renderer.getContext();
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
