import * as THREE from "three";
import { type Dir, dirDelta } from "../core/grid";
import { ActorView } from "./actorView";
import type { Assets } from "./assets";

/** 村なかで操作する自分の姿。ダンジョン・図鑑ギャラリーと同じ主人公のモデル */
const VILLAGE_PLAYER_MODEL = "garudo";

/** 拠点の3D化(plan/town-3d-exploration.md)。ダンジョンと違い自由移動なので、
 * 座標はマス目(core/grid の Vec2)ではなく実数の平面座標で持つ */
export interface VillagePos {
  x: number;
  z: number;
}

/**
 * 村の平面座標(x,z)を`ActorView`が扱う形(x,y)に読み替える。
 * `ActorView`は盤面の(x,y)をワールドの(x,z)に置く作りなので、
 * マス目に丸めずそのまま渡せば実数座標のまま追従する
 */
function toActorPos(pos: VillagePos): { x: number; y: number } {
  return { x: pos.x, y: pos.z };
}

/** 建物の見た目の作り方。tools/models/ の Blender パイプラインが本セッションの
 * 環境に無い(plan/archive/equipped-weapon-visual.md と同じ制約)ため、
 * ダンジョンのGLBモデルとは別に、Three.jsのプリミティブだけで組み立てる */
export type VillageBuildingShape = "hut" | "post" | "cave" | "camp";

export interface VillageBuilding {
  id: string;
  label: string;
  /** 近づいて確定したときに開く拠点画面(`TownScreen`)の列番号 */
  column: number;
  x: number;
  z: number;
  /** 当たり判定・近接判定の半径 */
  radius: number;
  shape: VillageBuildingShape;
  color: number;
}

export interface VillageBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** プレイヤーの当たり判定半径 */
export const VILLAGE_PLAYER_RADIUS = 0.35;
/** 建物の当たり判定の外側、この距離まで近づけば確定キーで入れる */
export const VILLAGE_INTERACT_PADDING = 1.3;
/** 歩く速さ(1秒あたりの移動量)。ダンジョンと違いターン制ではなく、
 * 押しっぱなしでそのまま連続的に歩ける(plan/touch-controls.mdのInputをそのまま使う) */
export const VILLAGE_MOVE_SPEED = 4.5;

export const VILLAGE_BOUNDS: VillageBounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9.5 };

export const VILLAGE_PLAYER_START: VillagePos = { x: 0, z: 7 };

/**
 * 村マップの配置(plan/town-3d-exploration.mdの対応表)。
 *
 * すべての列(0〜19)に個別の建物を用意すると建物だらけになるため、
 * 対応表に無い列(設定・実績帳・音・衣装・宵祭り等)は「旅の看板」から
 * 既定の列(0)で拠点画面を開き、そこから既存の左右キーで辿り着けるように
 * している(拠点画面自体は今までどおり全20列を横断できるので、
 * どの建物から入っても実質すべての機能へたどり着ける)。
 */
export const VILLAGE_BUILDINGS: readonly VillageBuilding[] = [
  { id: "board", label: "旅の看板", column: 0, x: 0, z: 3, radius: 0.7, shape: "post", color: 0x8a6b4a },
  { id: "storage", label: "モグラ婆の倉庫", column: 0, x: -5, z: 1, radius: 0.9, shape: "hut", color: 0x6b7a4a },
  { id: "workshop", label: "ゲンドの工房", column: 5, x: 5, z: 1, radius: 0.9, shape: "hut", color: 0xa0562f },
  { id: "questBoard", label: "オトネの依頼板", column: 11, x: -5, z: -3, radius: 0.9, shape: "hut", color: 0x4a6a8a },
  { id: "gallery", label: "おキヨの図鑑小屋", column: 7, x: 5, z: -3, radius: 0.9, shape: "hut", color: 0x7a4a8a },
  { id: "npcSquare", label: "村の広場", column: 16, x: 0, z: -1, radius: 0.6, shape: "camp", color: 0xd68a3a },
  { id: "development", label: "村の発展の受付", column: 13, x: -3, z: -6, radius: 0.9, shape: "hut", color: 0x4a8a6a },
  { id: "cave", label: "洞窟の入口", column: 1, x: 3, z: -6, radius: 1.1, shape: "cave", color: 0x2a2a30 },
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 1フレームぶんプレイヤーを動かす。純粋関数(Three.js非依存)にして、
 * 実際のWebGLコンテキストが無いテスト環境でも境界・当たり判定を検証できるようにしてある。
 */
export function moveVillagePlayer(
  pos: VillagePos,
  dir: Dir | null,
  dt: number,
  buildings: readonly VillageBuilding[] = VILLAGE_BUILDINGS,
  bounds: VillageBounds = VILLAGE_BOUNDS,
): VillagePos {
  if (dir === null || dt <= 0) return pos;

  const delta = dirDelta(dir);
  const len = Math.hypot(delta.x, delta.y) || 1;
  const step = VILLAGE_MOVE_SPEED * dt;
  let x = pos.x + (delta.x / len) * step;
  let z = pos.z + (delta.y / len) * step;

  for (const b of buildings) {
    const dx = x - b.x;
    const dz = z - b.z;
    const minDist = b.radius + VILLAGE_PLAYER_RADIUS;
    const dist = Math.hypot(dx, dz);
    if (dist < minDist) {
      if (dist < 1e-6) {
        x = b.x + minDist;
        z = b.z;
      } else {
        const push = minDist / dist;
        x = b.x + dx * push;
        z = b.z + dz * push;
      }
    }
  }

  x = clamp(x, bounds.minX + VILLAGE_PLAYER_RADIUS, bounds.maxX - VILLAGE_PLAYER_RADIUS);
  z = clamp(z, bounds.minZ + VILLAGE_PLAYER_RADIUS, bounds.maxZ - VILLAGE_PLAYER_RADIUS);
  return { x, z };
}

/** 確定キーで入れる建物があれば、最も近いものを返す */
export function nearestVillageBuilding(
  pos: VillagePos,
  buildings: readonly VillageBuilding[] = VILLAGE_BUILDINGS,
): VillageBuilding | null {
  let best: VillageBuilding | null = null;
  let bestDist = Infinity;
  for (const b of buildings) {
    const dist = Math.hypot(pos.x - b.x, pos.z - b.z);
    if (dist <= b.radius + VILLAGE_INTERACT_PADDING && dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

function buildStructure(building: VillageBuilding): THREE.Object3D {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });

  switch (building.shape) {
    case "hut": {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6), wallMat);
      wall.position.y = 0.65;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 1.75;
      group.add(wall, roof);
      break;
    }
    case "post": {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8),
        wallMat,
      );
      pole.position.y = 0.9;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.08), roofMat);
      plank.position.y = 1.3;
      group.add(pole, plank);
      break;
    }
    case "camp": {
      const logMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), logMat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (Math.PI / 3) * i;
        log.position.y = 0.12;
        group.add(log);
      }
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 6),
        new THREE.MeshStandardMaterial({
          color: building.color,
          emissive: building.color,
          emissiveIntensity: 0.9,
        }),
      );
      flame.position.y = 0.4;
      group.add(flame);
      group.add(new THREE.PointLight(building.color, 6, 5, 1.6).translateY(0.6));
      break;
    }
    case "cave": {
      const mouth = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: building.color, roughness: 1 }),
      );
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x44424a, roughness: 1 });
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.9), sideMat);
      left.position.set(-1.1, 0.8, 0);
      const right = left.clone();
      right.position.x = 1.1;
      group.add(mouth, left, right);
      break;
    }
  }

  group.position.set(building.x, 0, building.z);
  return group;
}

/**
 * 村なか歩き(plan/town-3d-exploration.md)の見た目。
 *
 * ダンジョンの`Stage`/`Renderer`は`FloorState`前提で作られており、戦闘も
 * ターン制の盤面移動も無い村には過剰なので、図鑑ギャラリー(`GalleryView`)
 * と同じやり方(独立した`THREE.Scene`/`THREE.Camera`を持ち、
 * `renderer.renderer.render(...)`にだけ相乗りする)を踏襲する。
 * 影は落とさない(常時1灯の`Renderer`と違い、村は建物が固定配置なので
 * 影の恩恵が薄く、専用のシャドウマップ管理を増やすほどでもないと判断した)。
 */
export class VillageView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /**
   * 主人公のモデルが届くまでのつなぎ。`garudo`は起動時に読む
   * (modelList.ts の essentialModelNames)ので通常は一瞬も見えないが、
   * 読み込みが遅れた場合に自分の姿が消えるよりはマシなので残してある
   */
  private readonly playerMesh: THREE.Object3D;
  /** 主人公の3Dモデル。モデルが届いた時点で作られ、以後はこちらを動かす */
  private playerView: ActorView | null = null;
  /** 衣装の色替え(plan/game/archive/costumes.md)。モデル生成前に指定されたぶんも覚えておく */
  private costumeTint: readonly [number, number, number] | null = null;
  private pos: VillagePos = { ...VILLAGE_PLAYER_START };

  constructor(private readonly assets: Assets) {
    this.scene.background = new THREE.Color(0x0c1420);
    this.scene.fog = new THREE.Fog(0x0c1420, 14, 30);

    this.scene.add(new THREE.AmbientLight(0x8fa0c8, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(
        VILLAGE_BOUNDS.maxX - VILLAGE_BOUNDS.minX,
        VILLAGE_BOUNDS.maxZ - VILLAGE_BOUNDS.minZ,
      ),
      new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    for (const building of VILLAGE_BUILDINGS) {
      this.scene.add(buildStructure(building));
    }

    this.playerMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x7fd6ff, emissive: 0x123244, emissiveIntensity: 0.4 }),
    );
    this.playerMesh.position.y = 0.75;
    this.scene.add(this.playerMesh);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
    this.updateCamera();
  }

  /** 拠点へ戻るたび(showTown())に、村の中の立ち位置を出発点へ戻す */
  reset(): void {
    this.pos = { ...VILLAGE_PLAYER_START };
    this.updateCamera();
    this.playerMesh.position.set(this.pos.x, 0.75, this.pos.z);
    this.ensurePlayerView();
    this.playerView?.setPosition(toActorPos(this.pos));
  }

  /**
   * 衣装の色替え(plan/game/archive/costumes.md)をこの姿にも反映する。
   * ダイブ中の`applyCostumeTint`と同じ色をそのまま渡す想定。
   * モデルがまだ届いていなければ覚えておき、生成時に適用する
   */
  setCostumeTint(tint: readonly [number, number, number] | null): void {
    this.costumeTint = tint;
    if (tint && this.playerView) this.playerView.applyTint(tint);
  }

  /**
   * 主人公のモデルが読めるようになっていれば、つなぎのカプセルと差し替える。
   * `Assets`は起動直後は一部しか持っていないので、毎フレーム様子を見て、
   * 届いた回に1度だけ作る(Stage.syncActorsと同じ考え方)
   */
  private ensurePlayerView(): void {
    if (this.playerView || !this.assets.has(VILLAGE_PLAYER_MODEL)) return;
    // 手前(カメラ側=+z)を向いて立たせる。dirDeltaの4が南(画面手前)
    this.playerView = new ActorView(this.assets.instantiate(VILLAGE_PLAYER_MODEL), toActorPos(this.pos), 4);
    if (this.costumeTint) this.playerView.applyTint(this.costumeTint);
    this.scene.add(this.playerView.root);
    this.playerMesh.visible = false;
  }

  get playerPos(): VillagePos {
    return this.pos;
  }

  /** 押されている方向に応じて歩かせる。`dir`は`Input.direction()`をそのまま渡す */
  update(dt: number, dir: Dir | null): void {
    const before = this.pos;
    this.pos = moveVillagePlayer(this.pos, dir, dt);
    this.playerMesh.position.set(this.pos.x, 0.75, this.pos.z);
    this.updateCamera();

    this.ensurePlayerView();
    const view = this.playerView;
    if (!view) return;
    view.setPosition(toActorPos(this.pos));
    // 歩いた向きへ向き直り、歩き/待機の仕草を切り替える。
    // 壁際で押し続けている場合は位置が変わらないので、待機に戻る
    const dx = this.pos.x - before.x;
    const dz = this.pos.z - before.z;
    const moving = dx !== 0 || dz !== 0;
    if (moving) view.faceTowards(dx, dz);
    view.play(moving ? "walk" : "idle");
    view.update(dt);
  }

  /** 確定キーで入れる建物があれば返す */
  nearBuilding(): VillageBuilding | null {
    return nearestVillageBuilding(this.pos);
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(): void {
    this.camera.position.set(this.pos.x, 9, this.pos.z + 7);
    this.camera.lookAt(this.pos.x, 0.6, this.pos.z);
  }
}
