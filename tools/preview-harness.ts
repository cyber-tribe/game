/**
 * モデルのエンジン内プレビュー(plan/models/archive/engine-preview-snapshots.md)。
 *
 * `preview_engine.mjs`がPlaywrightで開くだけの、確認専用の最小シーン。
 * `Assets`(実際のゲームと同じGLTFLoader→トゥーンマテリアル変換→輪郭線
 * 追加のパイプライン)でモデルを読み、`renderConfig.ts`(ダンジョンの
 * `Renderer`と共有)の光源・ポストプロセス設定で1フレーム描画する。
 *
 * URLクエリ:
 *   ?model=<名前>       必須。public/models/<名前>.glb を読む
 *   &attack=1           そのモデルがattackクリップを持つなら、
 *                        idleと並べて2コマの構図にする
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { Assets } from "../src/view/assets";
import { ActorView } from "../src/view/actorView";
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
  }
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const model = params.get("model");
  const wantAttackPose = params.get("attack") === "1";
  if (!model) throw new Error("?model=<名前> が要る");

  const assets = new Assets();
  // publicディレクトリの中身はサイトルート直下(/models/...)に配信される
  // (Viteの既定の挙動)。このハーネス自体は/tools/配下だが、絶対パスで
  // 指定するので現在ページの位置に関係なく解決できる
  await assets.ready([model], "/models");

  const canvas = document.querySelector("canvas") as HTMLCanvasElement;
  const hasAttack = assets.get(model).animations.some((clip) => clip.name === "attack");
  const showAttack = wantAttackPose && hasAttack;
  const width = showAttack ? 900 : 512;
  const height = 512;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height, false);
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

  // まず素の(x:0)状態で1体だけ作り、大きさ(建物・キャラ・小道具で桁違いに
  // 違う)を測ってから、その大きさに応じてidle/attackの間隔とカメラを
  // 決める。先に間隔を決め打ちすると、小道具では余白だらけ、建物では
  // カメラが埋まって何も見えなくなる(実際にhouse_*系で発生した)
  const probe = new THREE.Box3().setFromObject(assets.instantiate(model).root);
  const size = probe.isEmpty() ? new THREE.Vector3(1, 1, 1) : probe.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.2);
  const gap = showAttack ? radius * 0.7 : 0;

  const idleView = new ActorView(assets.instantiate(model), { x: -gap / 2, y: 0 });
  scene.add(idleView.root);
  idleView.update(0);

  let attackView: ActorView | undefined;
  if (showAttack) {
    // attackクリップの見せ場(タメ→ツメ)あたりで静止させる。クリップは
    // 24fps・frame1始まりで作られており(tools/models/*.pyのanimations()参照)、
    // ツメの山はおおむねframe7前後にあるので、そこに合わせて時間を選ぶ
    // (0.14ではまだ振りかぶりの入り口で、idleとの差がほぼ見えなかった)
    attackView = new ActorView(assets.instantiate(model), { x: gap / 2, y: 0 });
    scene.add(attackView.root);
    attackView.play("attack");
    attackView.update(0.26);
  }

  // 実際に置いた2体(または1体)ぶんのAABBに収まる距離を、画角から逆算する
  const bounds = new THREE.Box3();
  bounds.setFromObject(idleView.root);
  if (attackView) bounds.expandByObject(attackView.root);
  const center = new THREE.Vector3();
  bounds.getCenter(center);
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const boundsRadius = Math.max(boundsSize.x, boundsSize.y, boundsSize.z) / 2 || 0.5;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.05, 500);
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
  composer.setSize(width, height);

  composer.render();
  window.__previewReady = true;
}

main().catch((err) => {
  window.__previewError = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(err);
});
