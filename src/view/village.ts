import * as THREE from "three";
import { type Dir, dirDelta } from "../core/grid";
import type { StoryChapter } from "../entities/story";
import { type VillageNpcId, visibleVillageNpcs } from "../entities/village";
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
  /**
   * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
   * 近づいて確定したときに開ける拠点画面(`TownScreen`)の列番号の集合。
   * 左右キーでの列移動はこの集合の中だけに限られる(全20列を横断しない)。
   * 空配列は「列を持たない特別な場所」(旅の看板)を表す
   */
  columns: readonly number[];
  /** ヒント表示に添える役割の一言(例: 「強化・合成」)。`${label}(${role})`の形で使う */
  role: string;
  x: number;
  z: number;
  /** 当たり判定・近接判定の半径 */
  radius: number;
  shape: VillageBuildingShape;
  color: number;
  /**
   * 差し替え用の正式モデル(`plan/models/archive/model-village-structures.md`)。
   * 指定があれば、届き次第プリミティブの仮組みと差し替える
   * (`VillageView.ensureBuildingModels`)。未指定の建物は従来どおり
   * プリミティブのまま(段階的な置き換え)
   */
  model?: string;
}

export interface VillageBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 祠木や切り株など、建物ではない背景の景観小道具
 * (`plan/models/archive/model-village-structures.md`のpropHokoragi)。
 * 当たり判定・近接メニューは持たない(村人と同じ「通り抜けられて困らない
 * 背景」の扱い。`VILLAGE_BUILDINGS`とは別の一覧にしてあるのはそのため)
 */
export interface VillageScenery {
  id: string;
  model: string;
  x: number;
  z: number;
  rotationY?: number;
}

/**
 * 村なかカメラ(plan/models/village-scene-redesign.mdの「カメラワーク」)。
 * 俯瞰をやめ、主人公の背後・低めに寄った三人称の追従カメラにする。
 * 距離4m・高さ2m・注視点の高さ1.1mで、見下ろし角はatan((2-1.1)/4)≈13°と
 * doc指定の10〜15度に収まる
 */
export const VILLAGE_CAMERA_DISTANCE = 4;
export const VILLAGE_CAMERA_HEIGHT = 2;
export const VILLAGE_CAMERA_LOOK_HEIGHT = 1.1;
/** ヨーの追従の速さ(renderer.tsのyaw補間と同じ指数補間の係数) */
const VILLAGE_CAMERA_YAW_SMOOTHING = 9;
/** カメラと主人公のあいだに入った建物を薄くする不透明度 */
const VILLAGE_BUILDING_FADE_OPACITY = 0.35;

/** プレイヤーの当たり判定半径 */
export const VILLAGE_PLAYER_RADIUS = 0.35;
/** 建物の当たり判定の外側、この距離まで近づけば確定キーで入れる */
export const VILLAGE_INTERACT_PADDING = 1.3;
/** 歩く速さ(1秒あたりの移動量)。ダンジョンと違いターン制ではなく、
 * 押しっぱなしでそのまま連続的に歩ける(plan/touch-controls.mdのInputをそのまま使う) */
export const VILLAGE_MOVE_SPEED = 4.5;
/**
 * 歩行(walk)クリップの再生速度倍率(plan/models/archive/
 * garudo-walk-motion.mdの「2. 足滑りの解消」)。村は連続移動なので、
 * クリップの歩幅と`VILLAGE_MOVE_SPEED`が合っていないと足が地面を
 * 滑って見える。歩幅から厳密に逆算すると等倍の十数倍という現実離れした
 * 値になってしまう(この体格のクリップが前提にしている歩調とは
 * そもそも速さの桁が違う)ため、正確な運動学的算出ではなく、実機で
 * 足滑りが気にならない程度まで速める経験的な目安値にしてある
 * (未決事項として実装時の裁量に委ねられている。将来、実機確認で
 * 調整が必要になった場合はここだけ変えればよい)
 */
export const VILLAGE_WALK_TIME_SCALE = 2.2;

export const VILLAGE_BOUNDS: VillageBounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9.5 };

export const VILLAGE_PLAYER_START: VillagePos = { x: 0, z: 7 };

/**
 * 村マップの配置(plan/game/archive/town-3d-exploration.mdの対応表から、
 * plan/game/archive/village-scoped-menus.mdで建物・村人ごとの役割分けに
 * 差し替えた)。
 *
 * 以前は「どの建物から入っても拠点画面の全20列を横断できる」設計だったが、
 * 今は建物ごとに`columns`(開ける列の集合)を持ち、左右キーの移動はその
 * 中だけに限られる。同じ列を複数の建物から開けて構わない(倉庫は入口でも
 * モグラ婆でも触れる)。アクセシビリティ(14)・音(18)・設定(19)の
 * システム系の列はどの建物にも属さず、村でもダイブ中でも開ける「≡」
 * メニュー経由でだけ開く(`main.ts`の`openSystemMenu`)。
 *
 * 新設3件(ねむり小屋・記録の間・ガルドの家)は、番人となる村人の造形を
 * 新たに起こさず、既存の倉庫・工房・図鑑小屋などと同じ「小屋の外観だけの
 * ホットスポット」として置いた(番人NPCを立てるかは設計側の未決事項として
 * 別PRに委ねる、というplanの記載どおり)
 */
export const VILLAGE_BUILDINGS: readonly VillageBuilding[] = [
  { id: "board", label: "旅の看板", columns: [], role: "旅の掲示", x: 0, z: 3, radius: 0.7, shape: "post", color: 0x8a6b4a, model: "prop_signpost" },
  { id: "storage", label: "モグラ婆の倉庫", columns: [0, 1], role: "倉庫", x: -5, z: 1, radius: 0.9, shape: "hut", color: 0x6b7a4a, model: "house_storage" },
  { id: "workshop", label: "ゲンドの工房", columns: [5], role: "強化・合成", x: 5, z: 1, radius: 0.9, shape: "hut", color: 0xa0562f, model: "house_workshop" },
  { id: "questBoard", label: "オトネの依頼板", columns: [11], role: "依頼", x: -5, z: -3, radius: 0.9, shape: "hut", color: 0x4a6a8a, model: "prop_quest_board" },
  { id: "gallery", label: "おキヨの図鑑小屋", columns: [7, 9], role: "図鑑", x: 5, z: -3, radius: 0.9, shape: "hut", color: 0x7a4a8a, model: "house_compendium" },
  { id: "npcSquare", label: "村の広場", columns: [16, 17], role: "交流", x: 0, z: -1, radius: 0.6, shape: "camp", color: 0xd68a3a, model: "bonfire" },
  { id: "development", label: "村の発展の受付", columns: [13], role: "村の発展", x: -3, z: -6, radius: 0.9, shape: "hut", color: 0x4a8a6a, model: "house_development" },
  { id: "cave", label: "洞窟の入口", columns: [0, 1, 3, 4, 10, 12], role: "出発の支度", x: 3, z: -6, radius: 1.1, shape: "cave", color: 0x2a2a30, model: "cave_gate" },
  // 新設: ねむり小屋(仲間の世話。夢あわせ・改名・逃がすはcolumn4のUIをそのまま共用する)
  { id: "sleepHut", label: "ねむり小屋", columns: [4], role: "仲間の世話", x: 8, z: 1, radius: 0.9, shape: "hut", color: 0x5a4a7a, model: "house_hut" },
  // 新設: 記録の間(記録・実績)
  { id: "recordsHall", label: "記録の間", columns: [6, 8], role: "記録・実績", x: 8, z: -3, radius: 0.9, shape: "hut", color: 0x7a6a3a, model: "house_records" },
  // 新設: ガルドの家(衣装の着替え)
  { id: "garudoHouse", label: "ガルドの家", columns: [15], role: "衣装", x: -8, z: -3, radius: 0.9, shape: "hut", color: 0x3a6a7a, model: "house_garudo" },
];

/**
 * 祠木の疎らな林(design/village-buildings.md「村の全体像」)。建物の
 * 隙間、村の縁に散らして「祠木を伐り拓いた跡地に建った村」を背景で語る。
 * ゲンドの工房のそばには伐った切り株を1つだけ置く。
 */
export const VILLAGE_SCENERY: readonly VillageScenery[] = [
  { id: "hokoragiA1", model: "prop_hokoragi_a", x: -7.5, z: 5.5, rotationY: 0.4 },
  { id: "hokoragiB1", model: "prop_hokoragi_b", x: 7.3, z: 5.8, rotationY: 2.1 },
  { id: "hokoragiA2", model: "prop_hokoragi_a", x: -6.5, z: -7.5, rotationY: 1.2 },
  { id: "hokoragiB2", model: "prop_hokoragi_b", x: 2.5, z: 8.3, rotationY: 3.4 },
  { id: "hokoragiA3", model: "prop_hokoragi_a", x: 8.3, z: -7.5, rotationY: 5.0 },
  { id: "hokoragiStump1", model: "prop_hokoragi_stump", x: 6.6, z: 2.8, rotationY: 0.8 },
  // 周辺リング(plan/models/village-surroundings.md「1. 周辺リング」)。
  // プレイ可能範囲(VILLAGE_BOUNDS)の外に、村内より密に祠木を植えて
  // 境界を林でぼかす。真のInstancedMeshは、非同期に届くGLTFから
  // ジオメトリを取り出す口が今の`Assets`に無く導入コストが見合わないため
  // 見送り、既存のVILLAGE_SCENERYの仕組み(建物1棟ぶん程度の負荷)を
  // そのまま再利用した。北側(山側、-Z)ほど密度を上げてある
  { id: "hokoragiRingN1", model: "prop_hokoragi_a", x: -11.5, z: -11, rotationY: 2.4 },
  { id: "hokoragiRingN2", model: "prop_hokoragi_b", x: -3.5, z: -13, rotationY: 0.6 },
  { id: "hokoragiRingN3", model: "prop_hokoragi_a", x: 4.5, z: -14, rotationY: 4.1 },
  { id: "hokoragiRingN4", model: "prop_hokoragi_b", x: 11, z: -12, rotationY: 1.8 },
  { id: "hokoragiRingN5", model: "prop_hokoragi_a", x: -13, z: -6, rotationY: 5.5 },
  { id: "hokoragiRingE1", model: "prop_hokoragi_b", x: 13.5, z: 1.5, rotationY: 3.0 },
  { id: "hokoragiRingE2", model: "prop_hokoragi_a", x: 12, z: 8.5, rotationY: 0.2 },
  { id: "hokoragiRingW1", model: "prop_hokoragi_a", x: -13.5, z: 3, rotationY: 1.0 },
  { id: "hokoragiRingW2", model: "prop_hokoragi_b", x: -11.5, z: 9, rotationY: 4.7 },
  { id: "hokoragiRingS1", model: "prop_hokoragi_b", x: 2, z: 12.5, rotationY: 2.9 },
  { id: "hokoragiRingS2", model: "prop_hokoragi_stump", x: -4, z: 12, rotationY: 3.8 },
];

/**
 * 窓の明かりを漏らす、壁を持つ家屋の建物id
 * (plan/models/village-scene-redesign.mdの「各建物の窓・入口から暖色の
 * 明かりを漏らす」)。東屋(development)や壁の無い小道具(board・
 * questBoard)、広場(npcSquare)・洞窟(cave)は含めない
 */
const WINDOW_GLOW_BUILDINGS = new Set([
  "storage", "workshop", "gallery", "sleepHut", "recordsHall", "garudoHouse",
]);

/**
 * 屋外に立っている村人(plan/game/village-interiors.md)。屋内系の建物は
 * それぞれの内装(`src/view/villageInterior.ts`)に住人が立つが、屋外系
 * (依頼板・広場)には建物の中が無いので、村マップへ直接立たせて村の
 * にぎわいを兼ねさせる。
 *
 * 当たり判定は持たせない(建物と違い、通り抜けられて困るものではないし、
 * 押し出しの対象が増えるほど村なか歩きの手触りが硬くなる)。代わりに、
 * 建物の近接判定(`VILLAGE_INTERACT_PADDING`)の外側に立たせて、建物へ
 * 入る位置と重ならないようにしてある。
 */
export interface OutdoorVillager {
  /** `entities/village.ts`の`VillageNpcId`。出現条件(章)をそこから引く */
  npcId: VillageNpcId;
  /** `src/modelList.ts`の`VILLAGER_MODELS`のモデル名 */
  model: string;
  x: number;
  z: number;
  facing: Dir;
}

export const OUTDOOR_VILLAGERS: readonly OutdoorVillager[] = [
  // オトネは依頼板(questBoard)のそば
  { npcId: "otone", model: "otone", x: -6.6, z: -0.9, facing: 3 },
  // ポチは村の広場(npcSquare)。焚き火のほうを向いてしゃがみ込んでいる位置
  { npcId: "pochi", model: "pochi", x: 1.7, z: 0.5, facing: 7 },
  // おたまも村の広場。第二章の救出後にだけ現れる(下のoutdoorVillagers)
  { npcId: "otama", model: "otama", x: -1.7, z: 0.5, facing: 1 },
];

/**
 * その章で村マップに見えている屋外の村人。
 *
 * おたまの「第二章の救出後に現れる」は`entities/village.ts`の
 * `VILLAGE_NPCS`が既に`appearsFromChapter: 2`として持っているので、
 * 新しいフラグは作らずそちらへ委ねる(拠点画面の「NPCと話す」列と
 * 出現条件が食い違わないようにするため)。
 */
export function outdoorVillagers(chapter: StoryChapter): readonly OutdoorVillager[] {
  const visible = new Set(visibleVillageNpcs(chapter).map((npc) => npc.id));
  return OUTDOOR_VILLAGERS.filter((villager) => visible.has(villager.npcId));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * `to`へ向かう最短の角度差(-π, π]。単純な引き算だと0度⇔360度をまたぐ
 * ときに大回りしてしまう(例: 359度→1度が-358度回るように見える)ので、
 * 追従カメラのヨー補間(`VillageView`)はこれを使って最短経路で回り込む
 */
export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * カメラと注視点(主人公)を結ぶ線分の上に、この建物が割り込んでいるか
 * (plan/models/village-scene-redesign.mdの「遮蔽」)。XZ平面だけで判定する
 * (村の建物・カメラ・主人公はどれも高さの差が小さいため、平面の当たり
 * 判定で十分)。線分の両端近く(`t`が0または1に近い側)は除外し、
 * カメラ自身や主人公自身の位置にたまたま建物が重なった扱いにならない
 * ようにしている
 */
export function buildingOccludesView(
  camera: VillagePos,
  target: VillagePos,
  building: VillageBuilding,
): boolean {
  const dx = target.x - camera.x;
  const dz = target.z - camera.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const t = ((building.x - camera.x) * dx + (building.z - camera.z) * dz) / lenSq;
  if (t <= 0.05 || t >= 0.95) return false;
  const closestX = camera.x + dx * t;
  const closestZ = camera.z + dz * t;
  const dist = Math.hypot(building.x - closestX, building.z - closestZ);
  return dist < building.radius + 0.4;
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

/**
 * `buildStructure`の戻り値。`group`がシーンに置く実体で、`primitive`は
 * そのうち正式モデルへ差し替えられる部分(`VillageView.ensureBuildingModels`)。
 * 焚き火の炎・点光源のように、モデルが届いた後もThree.js側に残す表現は
 * `primitive`の外、`group`に直接持たせる
 */
interface BuiltStructure {
  group: THREE.Group;
  primitive: THREE.Group;
  /** 窓・入口の明かり(`WINDOW_GLOW_BUILDINGS`のみ)。昼/宵祭りで強さを切り替えるため保持する */
  windowGlow?: THREE.PointLight;
}

function buildStructure(building: VillageBuilding): BuiltStructure {
  const group = new THREE.Group();
  const primitive = new THREE.Group();
  group.add(primitive);
  let windowGlow: THREE.PointLight | undefined;
  const wallMat = new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });

  switch (building.shape) {
    case "hut": {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6), wallMat);
      wall.position.y = 0.65;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 1.75;
      primitive.add(wall, roof);
      // ゲンドの工房だけが持つ、村で唯一の煙突の煙。plan/models/archive/
      // model-village-structures.mdの方針どおりThree.js側のビルボード相当
      // (半透明の球を重ねた静止した煙)のままにし、正式モデル(house_workshop)
      // が届いても`primitive`の外なので消えずに残る
      if (building.id === "workshop") {
        const smokeMat = new THREE.MeshStandardMaterial({
          color: 0xb8bcc4,
          transparent: true,
          opacity: 0.55,
          roughness: 1,
        });
        const puffs = [
          [0.55, 3.35, 0, 0.11],
          [0.62, 3.6, 0.03, 0.15],
          [0.5, 3.85, -0.04, 0.19],
        ] as const;
        for (const [x, y, z, r] of puffs) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), smokeMat);
          puff.position.set(x, y, z);
          group.add(puff);
        }
      }
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
      primitive.add(pole, plank);
      break;
    }
    case "camp": {
      const logMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), logMat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (Math.PI / 3) * i;
        log.position.y = 0.12;
        primitive.add(log);
      }
      // 火(炎のメッシュ・点光源)はplan/models/archive/model-village-structures.md
      // の方針どおりビルボード/シェーダー相当のThree.js表現のままにし、正式
      // モデルが届いても(石組み・薪・タルの腰掛けだけを差し替えて)残す
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
      primitive.add(mouth, left, right);
      break;
    }
  }

  // 窓・入口から漏れる暖色の明かり(plan/models/village-scene-redesign.md
  // 「各建物の窓・入口から暖色の明かりを漏らす(生活の気配)」)。壁を持つ
  // 家屋だけに付ける(東屋の村の発展の受付、壁の無い依頼板・看板・広場・
  // 洞窟には付けない)。`primitive`ではなく`group`に足すのは、焚き火の
  // 炎・光源と同じく、正式モデルへ差し替わったあとも残したいため
  if (WINDOW_GLOW_BUILDINGS.has(building.id)) {
    const glowColor = 0xffb862;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshStandardMaterial({
        color: glowColor,
        emissive: glowColor,
        emissiveIntensity: 1.3,
        side: THREE.DoubleSide,
      }),
    );
    // 建物は入口が山側(+Y=画面奥)を向く考証どおり、+Y面に明かりを置く
    glow.position.set(0, 0.75, 0.79);
    group.add(glow);
    // 明るさは昼/宵祭りでVillageView.setFestivalLightingが切り替える
    // (plan/models/village-scene-redesign.md「昼は控えめ、宵祭り時のみ強調」)。
    // 既定値はここでは触れず、setFestivalLighting側の初期呼び出しに委ねる
    windowGlow = new THREE.PointLight(glowColor, 2.2, 3.5, 1.8);
    windowGlow.translateY(0.75).translateZ(0.7);
    group.add(windowGlow);
  }

  group.position.set(building.x, 0, building.z);
  return { group, primitive, windowGlow };
}

/**
 * 低周波のなめらかな疑似ノイズ(plan/models/village-mountain-gradient.mdの
 * 「稜線の輪郭に低周波のゆらぎを入れ、定規で引いた線に見せない」)。
 * `Math.random`は使わず、周波数の異なる正弦の合成だけで確定的に波打たせる
 */
function ridgeNoise(x: number): number {
  return Math.sin(x * 0.21) * 0.6 + Math.sin(x * 0.53 + 1.3) * 0.35 + Math.sin(x * 0.11 + 2.7) * 0.5;
}

/**
 * ヨリシロ本体(眠る巨人の山、design/world.mdの考証)の「うずくまった
 * 背中」(plan/models/village-mountain-gradient.md)。手前の稜線
 * (z=-19、最も濃い層)にだけ、隣り合う2つの緩やかな山を足して、
 * こぶのようなシルエットを作る。露骨な人型にはしない、「言われれば
 * 見える」程度の起伏に留める
 */
function yorishiroHunch(x: number): number {
  const shoulder = 6 * Math.exp(-((x + 3) ** 2) / 40);
  const head = 4.5 * Math.exp(-((x - 5) ** 2) / 18);
  return shoulder + head;
}

/**
 * ヨリシロの稜線を模した遠景の山影(plan/models/village-scene-redesign.md
 * 「山を背景に置く」)。村の奥(北=-Z側)に、霧がかった大きな山影を
 * 常に見せる。低ポリの四角錐を3層に重ね、奥ほど不透明度を下げて霧がかって
 * 見せることで遠近を表す。`material.fog = false`にしてあるのは、
 * シーンの`Fog`(近14・遠44)だと山の位置によっては完全に埋もれて
 * 見えなくなってしまうため、代わりに層ごとの不透明度で「霧をまとった
 * 遠景」を表現している。
 *
 * plan/models/village-surroundings.md「山頂の孤島」対応: 裾(y=0)を
 * 地面に接地させる(以前は`height/2 - 1`で裾が地面より下に浮いていた)。
 *
 * plan/models/village-mountain-gradient.md対応: 各峰は単色ベタをやめ、
 * 裾(山肌)→頂(稜線の霞)の頂点カラーグラデーションにした。霧色は
 * 昼/宵祭りで変わる(`recolorMountainBackdrop`)ので、稜線の峰
 * (`THREE.Mesh`)を`peaks`として返し、`setFestivalLighting`から
 * 塗り替えられるようにしてある。稜線の高さ・幅にも`ridgeNoise`で
 * ゆらぎを足し、手前の層だけヨリシロの「背中のこぶ」を足す
 */
function buildMountainBackdrop(bodyColor: number, hazeColor: number): { group: THREE.Group; peaks: THREE.Mesh[] } {
  const group = new THREE.Group();
  const peaks: THREE.Mesh[] = [];
  const layers: ReadonlyArray<{ z: number; opacity: number; nearest: boolean }> = [
    { z: -34, opacity: 0.5, nearest: false },
    { z: -26, opacity: 0.7, nearest: false },
    { z: -19, opacity: 0.92, nearest: true },
  ];
  const peakCount = 6;
  for (const layer of layers) {
    for (let i = 0; i < peakCount; i++) {
      const x = -32 + (i / (peakCount - 1)) * 64 + (i % 2 === 0 ? -3 : 3);
      const height =
        10 + (i % 3) * 3.5 + ridgeNoise(x + layer.z) * 2 + (layer.nearest ? yorishiroHunch(x) : 0);
      const width = Math.max(8, 14 + (i % 2) * 5 + ridgeNoise(x * 0.5) * 3);
      const geometry = new THREE.ConeGeometry(width / 2, height, 4);
      applyVerticalGradient(geometry, bodyColor, hazeColor, -height / 2, height / 2);
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: layer.opacity,
        fog: false,
      });
      const peak = new THREE.Mesh(geometry, material);
      peak.rotation.y = Math.PI / 4;
      peak.position.set(x, height / 2, layer.z);
      group.add(peak);
      peaks.push(peak);
    }
  }
  return { group, peaks };
}

/** 山影の頂点カラーを昼/宵祭りの色へ差し替える(`setFestivalLighting`から呼ぶ) */
function recolorMountainBackdrop(peaks: readonly THREE.Mesh[], bodyColor: number, hazeColor: number): void {
  for (const peak of peaks) {
    const height = (peak.geometry as THREE.ConeGeometry).parameters.height;
    applyVerticalGradient(peak.geometry, bodyColor, hazeColor, -height / 2, height / 2);
  }
}

/**
 * 頂点カラーで下から上へ2色をグラデーションさせる(共通処理)。
 * `getMinMaxY`は色の補間に使う0〜1の高さを決める(ジオメトリのローカル
 * 座標系での最小・最大Y)
 */
function applyVerticalGradient(
  geometry: THREE.BufferGeometry,
  low: number,
  high: number,
  minY: number,
  maxY: number,
): void {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const lowColor = new THREE.Color(low);
  const highColor = new THREE.Color(high);
  const span = maxY - minY || 1;
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp((position.getY(i) - minY) / span, 0, 1);
    const c = lowColor.clone().lerp(highColor, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * 中景の丘(plan/models/village-surroundings.mdの「2. 中景」)。
 * 周辺リングの外に、緑〜黄緑のグラデーションを持つなだらかな丘の
 * シルエットを数枚置き、地面から山の裾野へ地続きに見せる。北側
 * (山側、-Z)は他より大きく・高くし、山影の裾と重なるようにしてある
 */
const MID_HILLS: ReadonlyArray<{ x: number; z: number; radius: number; height: number }> = [
  // 北側(山の裾野。大きく高い)
  { x: -14, z: -20, radius: 13, height: 7 },
  { x: 4, z: -22, radius: 15, height: 8.5 },
  { x: 20, z: -18, radius: 12, height: 6.5 },
  { x: -22, z: -14, radius: 11, height: 6 },
  // 東西南(村の外周を囲むなだらかな丘)
  { x: 24, z: 2, radius: 10, height: 4.5 },
  { x: 21, z: 14, radius: 9, height: 4 },
  { x: -23, z: 4, radius: 10, height: 4.5 },
  { x: -19, z: 15, radius: 9, height: 3.8 },
  { x: 3, z: 20, radius: 11, height: 4.2 },
  { x: -8, z: 21, radius: 9, height: 3.8 },
];

function buildHills(): THREE.Group {
  const group = new THREE.Group();
  for (const hill of MID_HILLS) {
    // 半球を扁平にしてドーム状の丘にする
    const geometry = new THREE.SphereGeometry(hill.radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geometry.scale(1, hill.height / hill.radius, 1);
    applyVerticalGradient(geometry, 0x3d5a34, 0x8ba852, 0, hill.radius);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(hill.x, 0, hill.z);
    group.add(mesh);
  }
  return group;
}

/**
 * その(x, z)地点での丘の表面の高さ(plan/models/village-mountain-gradient.md
 * 「1. 樹層のグラデーション」の「裾野の斜面に木を...生やし」対応)。
 * `buildHills`のドーム(扁平半球)の式をそのまま使い、複数の丘が重なる
 * 場所は高い方を採る。丘の外なら0(平らな地面)。木をこの高さに乗せることで、
 * 丘の内部に埋もれさせず、斜面を登っているように見せる
 */
function hillHeightAt(x: number, z: number): number {
  let height = 0;
  for (const hill of MID_HILLS) {
    const dx = x - hill.x;
    const dz = z - hill.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= hill.radius) continue;
    const h = hill.height * Math.sqrt(1 - (dist / hill.radius) ** 2);
    if (h > height) height = h;
  }
  return height;
}

/**
 * 山の裾に登る樹層(plan/models/village-mountain-gradient.mdの「1. 樹層の
 * グラデーション」)。村の祠木の林(`VILLAGE_SCENERY`)と山影
 * (`buildMountainBackdrop`)の間に質感と色の飛びがあった問題を、林を
 * そのまま山の裾まで登らせることで繋ぐ。円錐+球ではなく円錐だけの
 * 簡略LOD(遠景でシルエット化するので幹は要らない)を使い、非同期の
 * GLTFに頼らないぶん(`VILLAGE_SCENERY`の祠木リングと違い)、素直に
 * `InstancedMesh`へ束ねられる。遠いほど小さく・密に・色を深緑から
 * 青みがかった深緑へ寄せてシルエット化する。`hillHeightAt`で丘の表面
 * 高さに乗せ、丘の内部に埋もれさせない(=斜面を登っているように見せる)
 */
function buildForestSlope(): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(0.4, 1.3, 6);
  geometry.translate(0, 0.65, 0); // 底(y=0)を接地させる
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  const bands: ReadonlyArray<{ zNear: number; zFar: number; rows: number; perRow: number; scale: number }> = [
    { zNear: -14, zFar: -18, rows: 3, perRow: 14, scale: 1.0 },
    { zNear: -18, zFar: -22, rows: 4, perRow: 18, scale: 0.7 },
    { zNear: -22, zFar: -25, rows: 4, perRow: 22, scale: 0.45 },
  ];
  const trees: Array<{ x: number; z: number; y: number; scale: number; t: number }> = [];
  for (const band of bands) {
    for (let row = 0; row < band.rows; row++) {
      const rowT = band.rows === 1 ? 0 : row / (band.rows - 1);
      const z = band.zNear + (band.zFar - band.zNear) * rowT;
      for (let i = 0; i < band.perRow; i++) {
        // 裾は広く、頂へ向かうほど幅を絞って山なりのシルエットにする
        const spread = 30 - Math.abs(z) * 0.3;
        const x = -spread + (i / (band.perRow - 1)) * spread * 2 + ridgeNoise(i + row * 3) * 0.6;
        const scale = band.scale * (0.85 + 0.15 * ((i + row) % 3));
        const treeZ = z + ridgeNoise(x) * 0.4;
        trees.push({ x, z: treeZ, y: hillHeightAt(x, treeZ), scale, t: Math.abs(z + 14) / 11 });
      }
    }
  }

  const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
  const matrix = new THREE.Matrix4();
  const nearColor = new THREE.Color(0x3f6a34); // 村の林の深緑
  const farColor = new THREE.Color(0x2c4550); // 裾野の樹層(青みがかった深緑)
  trees.forEach((tree, i) => {
    matrix.compose(
      new THREE.Vector3(tree.x, tree.y, tree.z),
      new THREE.Quaternion(),
      new THREE.Vector3(tree.scale, tree.scale, tree.scale),
    );
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, nearColor.clone().lerp(farColor, THREE.MathUtils.clamp(tree.t, 0, 1)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * 木々の塊 → 森の輪郭への移行(plan/models/village-mountain-gradient.mdの
 * 「1. 樹層のグラデーション」)。個々の木を描き分けるにはもう遠い距離に、
 * 樹冠のもこもこした輪郭を持つ帯を2枚重ねる。上端だけをノイズで波打たせ、
 * 定規で引いた直線に見せない。奥の帯ほど色を青灰へ寄せ、山肌の色へ繋ぐ。
 * `hillHeightAt`で丘の稜線ぶんだけ底上げし、丘の内部に埋もれさせない
 */
function buildTreeCanopyFringe(): THREE.Group {
  const group = new THREE.Group();
  const bands: ReadonlyArray<{ z: number; height: number; width: number; color: number; opacity: number }> = [
    { z: -24, height: 3.2, width: 60, color: 0x2c4550, opacity: 0.85 },
    { z: -28, height: 4.2, width: 64, color: 0x33465a, opacity: 0.7 },
  ];
  for (const band of bands) {
    const geometry = new THREE.PlaneGeometry(band.width, band.height, 40, 1);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      if (y <= 0) continue; // 下端はまっすぐのまま、手前の帯・地面と繋がるようにする
      const wobble = (Math.sin(x * 0.35) * 0.5 + Math.sin(x * 0.9 + 1.7) * 0.25) * (band.height * 0.35);
      position.setY(i, y + wobble);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: band.color,
      roughness: 1,
      transparent: true,
      opacity: band.opacity,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // 丘の稜線あたりの高さを何点かサンプルして、その帯の底上げ量にする
    const crest = Math.max(hillHeightAt(-16, band.z), hillHeightAt(4, band.z), hillHeightAt(20, band.z));
    mesh.position.set(0, crest + band.height / 2, band.z);
    group.add(mesh);
  }
  return group;
}

/**
 * 空のグラデーション(plan/models/village-surroundings.mdの「3. 遠景」)。
 * 単色べたのシーン背景(`scene.background`)の代わりに、地平線際が
 * 明るく天頂ほど濃い半球ドームを頂点カラーで描く。カメラを覆う内側から
 * 見るので`side: THREE.BackSide`。フォグの影響は受けない(空自体が
 * 遠景そのものなので、フォグで薄まると不自然になる)
 */
function buildSkyDome(horizon: number, zenith: number): THREE.Mesh {
  const radius = 90;
  const geometry = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  applyVerticalGradient(geometry, horizon, zenith, 0, radius);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -10;
  return mesh;
}

/** 空のドームの頂点カラーを昼/宵祭りの色へ差し替える(`setFestivalLighting`から呼ぶ) */
function recolorSkyDome(mesh: THREE.Mesh, horizon: number, zenith: number): void {
  applyVerticalGradient(mesh.geometry, horizon, zenith, 0, (mesh.geometry as THREE.SphereGeometry).parameters.radius);
}

/**
 * 薄い雲(plan/models/village-surroundings.mdの「3. 遠景」)。平たく
 * 引き伸ばした半透明の塊を高い位置に静止させて浮かべる(ゲンドの工房の
 * 煙と同じ考え方の、動かないビルボード相当の表現)
 */
function buildClouds(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    fog: false,
    depthWrite: false,
  });
  const clouds: ReadonlyArray<{ x: number; y: number; z: number; scale: number }> = [
    { x: -18, y: 22, z: -30, scale: 1.2 },
    { x: 14, y: 26, z: -36, scale: 1.6 },
    { x: -4, y: 20, z: 40, scale: 1.0 },
  ];
  for (const cloud of clouds) {
    const puff = new THREE.Group();
    for (const [dx, dz, r] of [[0, 0, 1], [0.7, 0.1, 0.7], [-0.6, -0.1, 0.65]] as const) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), material);
      mesh.position.set(dx, 0, dz);
      mesh.scale.set(1.8, 0.5, 1);
      puff.add(mesh);
    }
    puff.position.set(cloud.x, cloud.y, cloud.z);
    puff.scale.setScalar(cloud.scale);
    group.add(puff);
  }
  return group;
}

/**
 * 地平線際の遠霞(plan/models/village-surroundings.mdの「3. 遠景」、
 * 「中景の丘との境を溶かす」)。丘のてっぺんあたりの高さに、内側を
 * 向いた半透明の帯(円柱の側面)を1枚置くだけの簡単な表現にした
 */
function buildHorizonMist(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(70, 70, 10, 32, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: 0xe8f0f5,
    transparent: true,
    opacity: 0.4,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 6;
  return mesh;
}

/**
 * 畑のうね(plan/models/village-surroundings.mdの「1. 周辺リング」)。
 * design/village-buildings.mdの生業の考証と矛盾しない範囲で、実装側の
 * 裁量(未決事項)として倉庫寄りの東側に置いた。低い畝を並べただけの
 * 簡単な表現
 */
function buildFieldFurrows(): THREE.Group {
  const group = new THREE.Group();
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 });
  for (let row = 0; row < 6; row++) {
    const furrow = new THREE.Mesh(new THREE.BoxGeometry(6, 0.18, 0.5), soil);
    furrow.position.set(-16, 0.09, -1 + row * 0.7);
    group.add(furrow);
  }
  return group;
}

/**
 * 村から山の口へ続く土の小道(plan/models/village-surroundings.mdの
 * 「1. 周辺リング」)。洞窟の入口(cave、x:3, z:-6)からさらに山側
 * (-Z方向)へ延ばした帯
 */
function buildPathToCave(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2.2, 14);
  const material = new THREE.MeshStandardMaterial({ color: 0x7a6446, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(3, 0.01, -15);
  return mesh;
}

/**
 * 小川(plan/models/village-surroundings.mdの「1. 周辺リング」)。
 * 細長い水色の帯でよい、という指定どおりの簡単な表現
 */
function buildStream(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1.4, 26);
  const material = new THREE.MeshStandardMaterial({ color: 0x5f97a8, roughness: 0.4, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = 0.25;
  mesh.position.set(15, 0.01, 4);
  return mesh;
}

/**
 * 昼/宵祭りの光の切り替え(plan/models/village-scene-redesign.mdの
 * 「ライティング・色」節)。既定は明るい昼(現実=日なたの明るさ)にし、
 * `design/village-festivals.md`の宵祭りの日だけ茜色の夕暮れへ切り替える。
 * 「常に夕暮れ〜宵」という当初案は撤回されているので、この2値だけで足りる。
 */
interface VillageLightingPreset {
  background: number;
  fog: number;
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** 窓・入口の明かりの強さ。昼は控えめ、宵祭りだけ強調する */
  windowGlowIntensity: number;
  /**
   * 空のグラデーション(plan/models/village-surroundings.mdの「3. 遠景」)。
   * 地平線際(horizon)は明るく、天頂(zenith)ほど濃い色にする
   */
  skyHorizon: number;
  skyZenith: number;
  /**
   * 山肌の色(plan/models/village-mountain-gradient.mdの色階段
   * 「山肌(青緑〜青灰)」)。稜線(頂)は`skyHorizon`と同じ色にして、
   * 最遠の山と空の境を溶かす(`buildMountainBackdrop`/`recolorMountainBackdrop`)
   */
  mountainBody: number;
}

const DAYTIME_LIGHTING: VillageLightingPreset = {
  background: 0xcfe8f7,
  fog: 0xcfe8f7,
  ambientColor: 0xfff2df,
  ambientIntensity: 1.9,
  sunColor: 0xfff4d8,
  sunIntensity: 1.5,
  windowGlowIntensity: 1.2,
  skyHorizon: 0xdcf0fa,
  skyZenith: 0x5da0d8,
  mountainBody: 0x4a6a70,
};

const YOIMATSURI_LIGHTING: VillageLightingPreset = {
  background: 0x6b3550,
  fog: 0x6b3550,
  ambientColor: 0x4a3550,
  ambientIntensity: 1.0,
  sunColor: 0xffa050,
  sunIntensity: 0.9,
  windowGlowIntensity: 3.0,
  skyHorizon: 0xd88a5c,
  skyZenith: 0x352050,
  mountainBody: 0x453856,
};

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
  /**
   * カメラのヨー(ラジアン、0のとき主人公の南=画面手前にいて、山(北)を
   * 正面に見る。これは旧来の俯瞰カメラの位置(pos.z+7)と同じ側なので、
   * 静止時の見た目は変えていない)。
   *
   * plan/models/village-camera-manual-rotate.mdにより、移動しても
   * 勝手には変わらない(自動追従は廃止した)。`rotate()`(Q/E・
   * 二本指回転、ダンジョンと同じ操作)でのみ90度単位の`targetYaw`が
   * 動き、`yaw`はそこへ指数補間で滑らかに寄っていく
   * (renderer.tsのyaw補間と同じ考え方)
   */
  private cameraYaw = 0;
  private targetYaw = 0;
  /**
   * 屋外に立っている村人(plan/game/village-interiors.md)。モデルは
   * 起動時には読まれない(`essentialModelNames`に入っていない)ので、
   * 図鑑ギャラリーと同じく毎フレーム様子を見て、届いた回に1度だけ作る
   */
  private readonly villagerViews = new Map<VillageNpcId, ActorView>();
  /** 章立て(plan/game/archive/story-chapters.md)。おたまの出現条件に使う */
  private chapter: StoryChapter = 0;
  /**
   * 建物ごとの、正式モデルへ差し替えられる部分。`model`指定がある建物を、
   * 正式モデルが届き次第差し替えるために覚えておく(`ensureBuildingModels`)
   */
  private readonly buildingGroups = new Map<string, THREE.Group>();
  /** すでに正式モデルへ差し替え済みの建物id。二重に差し替えない */
  private readonly builtBuildingModels = new Set<string>();
  /**
   * 祠木などの景観小道具(`VILLAGE_SCENERY`)。建物と違い当たり判定も
   * 仮組みのプリミティブも持たないので、モデルが届くまでは何も置かず、
   * 届いた回に1度だけ生やす(`ensureScenery`)
   */
  private readonly sceneryGroups = new Map<string, THREE.Group>();
  private readonly builtScenery = new Set<string>();
  /** 昼/宵祭りで色・強さを切り替える光源(`setFestivalLighting`) */
  private readonly ambientLight = new THREE.AmbientLight();
  private readonly sunLight = new THREE.DirectionalLight();
  /** 建物ごとの窓明かり(`WINDOW_GLOW_BUILDINGS`のみ持つ)。`buildingId → PointLight` */
  private readonly windowGlowLights = new Map<string, THREE.PointLight>();
  /** 空のグラデーション(`buildSkyDome`)。`setFestivalLighting`で塗り替える */
  private readonly skyDome: THREE.Mesh;
  /** 山影の峰(`buildMountainBackdrop`)。`setFestivalLighting`で塗り替える */
  private readonly mountainPeaks: THREE.Mesh[];

  constructor(private readonly assets: Assets) {
    this.scene.background = new THREE.Color(DAYTIME_LIGHTING.background);
    // 遠景(丘・山)が奥35前後まで続くようになったので、フォグの遠距離を
    // 30→44へ延ばし、丘が霧に埋もれて消えないようにした
    this.scene.fog = new THREE.Fog(DAYTIME_LIGHTING.fog, 14, 44);

    this.scene.add(this.ambientLight);
    this.sunLight.position.set(6, 12, 4);
    this.scene.add(this.sunLight);

    // 地面はプレイ可能範囲(VILLAGE_BOUNDS)の見た目そのままに、そこだけ
    // 4倍の広さへ延長する(plan/models/village-surroundings.mdの
    // 「山頂の孤島」対応。地面が急に途切れて見える問題を解消する)
    const GROUND_EXTENSION_FACTOR = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(
        (VILLAGE_BOUNDS.maxX - VILLAGE_BOUNDS.minX) * GROUND_EXTENSION_FACTOR,
        (VILLAGE_BOUNDS.maxZ - VILLAGE_BOUNDS.minZ) * GROUND_EXTENSION_FACTOR,
      ),
      new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.skyDome = buildSkyDome(DAYTIME_LIGHTING.skyHorizon, DAYTIME_LIGHTING.skyZenith);
    this.scene.add(this.skyDome);
    this.scene.add(buildClouds());
    this.scene.add(buildHorizonMist());
    this.scene.add(buildHills());
    this.scene.add(buildForestSlope());
    this.scene.add(buildTreeCanopyFringe());
    const mountain = buildMountainBackdrop(DAYTIME_LIGHTING.mountainBody, DAYTIME_LIGHTING.skyHorizon);
    this.mountainPeaks = mountain.peaks;
    this.scene.add(mountain.group);
    this.scene.add(buildFieldFurrows());
    this.scene.add(buildPathToCave());
    this.scene.add(buildStream());

    for (const building of VILLAGE_BUILDINGS) {
      const { group, primitive, windowGlow } = buildStructure(building);
      this.buildingGroups.set(building.id, primitive);
      if (windowGlow) this.windowGlowLights.set(building.id, windowGlow);
      this.scene.add(group);
    }

    for (const scenery of VILLAGE_SCENERY) {
      const group = new THREE.Group();
      group.position.set(scenery.x, 0, scenery.z);
      if (scenery.rotationY) group.rotation.y = scenery.rotationY;
      this.sceneryGroups.set(scenery.id, group);
      this.scene.add(group);
    }

    this.playerMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x7fd6ff, emissive: 0x123244, emissiveIntensity: 0.4 }),
    );
    this.playerMesh.position.y = 0.75;
    this.scene.add(this.playerMesh);

    // farは空のドーム(半径90)を映すのに十分な距離まで延ばした
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 110);
    this.applyCameraTransform();
    // 既定は明るい昼(showTown側でsetFestivalLightingが呼ばれる前の保険でもある)
    this.setFestivalLighting(false);
  }

  /**
   * 章立て(plan/game/archive/story-chapters.md)を伝える。おたまは第二章の
   * 救出後にだけ広場に現れる(`outdoorVillagers`)ので、拠点へ戻るたびに
   * 今の章を渡してもらう
   */
  setStoryChapter(chapter: StoryChapter): void {
    this.chapter = chapter;
  }

  /**
   * 昼/宵祭りの光を切り替える(plan/models/village-scene-redesign.md)。
   * `active`は`isYoimatsuri(todayKey())`をそのまま渡す想定
   * (`design/village-festivals.md`と同じ、新規セーブ項目を増やさない設計)。
   * 空・霧・環境光・陽光・窓明かりの強さをまとめて切り替える
   */
  setFestivalLighting(active: boolean): void {
    const preset = active ? YOIMATSURI_LIGHTING : DAYTIME_LIGHTING;
    (this.scene.background as THREE.Color).setHex(preset.background);
    (this.scene.fog as THREE.Fog).color.setHex(preset.fog);
    this.ambientLight.color.setHex(preset.ambientColor);
    this.ambientLight.intensity = preset.ambientIntensity;
    this.sunLight.color.setHex(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity;
    for (const glow of this.windowGlowLights.values()) {
      glow.intensity = preset.windowGlowIntensity;
    }
    recolorSkyDome(this.skyDome, preset.skyHorizon, preset.skyZenith);
    recolorMountainBackdrop(this.mountainPeaks, preset.mountainBody, preset.skyHorizon);
  }

  /** 拠点へ戻るたび(showTown())に、村の中の立ち位置を出発点へ戻す */
  reset(): void {
    this.pos = { ...VILLAGE_PLAYER_START };
    this.cameraYaw = 0;
    this.targetYaw = 0;
    this.applyCameraTransform();
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
    this.playerView = new ActorView(
      this.assets.instantiate(VILLAGE_PLAYER_MODEL),
      toActorPos(this.pos),
      4,
      1,
      VILLAGE_WALK_TIME_SCALE,
    );
    if (this.costumeTint) this.playerView.applyTint(this.costumeTint);
    this.scene.add(this.playerView.root);
    this.playerMesh.visible = false;
  }

  /**
   * 今の章で見えているはずの屋外の村人のうち、モデルが届いていて
   * まだ立っていないものを立たせる。`ensurePlayerView`と同じ考え方
   */
  private ensureVillagers(dt: number): void {
    for (const villager of outdoorVillagers(this.chapter)) {
      let view = this.villagerViews.get(villager.npcId);
      if (!view) {
        if (!this.assets.has(villager.model)) {
          this.assets.loadInBackground([villager.model]);
          continue;
        }
        view = new ActorView(
          this.assets.instantiate(villager.model),
          { x: villager.x, y: villager.z },
          villager.facing,
        );
        this.villagerViews.set(villager.npcId, view);
        this.scene.add(view.root);
      }
      // 村人は歩かない。待機モーションだけを回し続ける
      view.play("idle");
      view.update(dt);
    }
  }

  /**
   * `model`指定のある建物のうち、まだプリミティブの仮組みのままのものを
   * 見て回り、モデルが届いていれば正式モデルへ差し替える。`ensureVillagers`
   * と同じ考え方(毎フレーム様子を見て、届いた回に1度だけ差し替える)
   */
  private ensureBuildingModels(): void {
    for (const building of VILLAGE_BUILDINGS) {
      if (!building.model || this.builtBuildingModels.has(building.id)) continue;
      if (!this.assets.has(building.model)) {
        this.assets.loadInBackground([building.model]);
        continue;
      }
      const group = this.buildingGroups.get(building.id);
      if (!group) continue;
      group.clear();
      group.add(this.assets.instantiate(building.model).root);
      this.builtBuildingModels.add(building.id);
    }
  }

  /**
   * 祠木などの景観小道具のうち、まだ生やしていないもののモデルが届いて
   * いれば生やす。`ensureBuildingModels`と同じ考え方だが、差し替える
   * 仮組みが無いので、届く前は何も置かない
   */
  private ensureScenery(): void {
    for (const scenery of VILLAGE_SCENERY) {
      if (this.builtScenery.has(scenery.id)) continue;
      if (!this.assets.has(scenery.model)) {
        this.assets.loadInBackground([scenery.model]);
        continue;
      }
      const group = this.sceneryGroups.get(scenery.id);
      if (!group) continue;
      group.add(this.assets.instantiate(scenery.model).root);
      this.builtScenery.add(scenery.id);
    }
  }

  get playerPos(): VillagePos {
    return this.pos;
  }

  /**
   * 建物ごとの今の不透明度(遮蔽の確認用)。建物idが見つからなければnull。
   * 主にテスト向け(`updateBuildingOcclusion`は private なので、
   * 効果を外から確かめるための最小限の窓口)
   */
  buildingOpacity(id: string): number | null {
    const group = this.buildingGroups.get(id);
    if (!group) return null;
    let opacity: number | null = null;
    group.traverse((obj) => {
      if (opacity !== null || !(obj instanceof THREE.Mesh)) return;
      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      opacity = material?.opacity ?? null;
    });
    return opacity;
  }

  /**
   * 押されている方向に応じて歩かせる。`dir`は`Input.direction()`をそのまま渡す
   * (村の`cameraQuadrant`で補正済みの、画面基準の入力)。
   *
   * カメラの向きは`rotate()`を明示的に呼ばない限り変わらない
   * (plan/models/village-camera-manual-rotate.md)。旧
   * `village-scene-redesign.md`が挙げていた「移動方向へ自動で回り込む」
   * 追従は、実機で向きが安定しないと分かったため廃止した。位置の追従
   * (プレイヤーの後方に付いていく動き)だけは変わらず残っている
   */
  update(dt: number, dir: Dir | null): void {
    const before = this.pos;
    this.pos = moveVillagePlayer(this.pos, dir, dt);
    this.playerMesh.position.set(this.pos.x, 0.75, this.pos.z);

    // 歩いた向きへ向き直り、歩き/待機の仕草を切り替える。
    // 壁際で押し続けている場合は位置が変わらないので、待機に戻る
    const dx = this.pos.x - before.x;
    const dz = this.pos.z - before.z;
    const moving = dx !== 0 || dz !== 0;

    // カメラのヨーはrotate()が動かしたtargetYawへ滑らかに寄っていくだけ
    // (renderer.tsのyaw補間と同じ考え方)。移動しても勝手には変わらない
    this.cameraYaw += shortestAngleDelta(this.cameraYaw, this.targetYaw) * (1 - Math.exp(-dt * VILLAGE_CAMERA_YAW_SMOOTHING));
    this.applyCameraTransform();
    this.updateBuildingOcclusion();

    this.ensureBuildingModels();
    this.ensureScenery();
    this.ensureVillagers(dt);
    this.ensurePlayerView();
    const view = this.playerView;
    if (!view) return;
    view.setPosition(toActorPos(this.pos));
    if (moving) view.faceTowards(dx, dz);
    view.play(moving ? "walk" : "idle");
    view.update(dt);
  }

  /** 確定キーで入れる建物があれば返す */
  nearBuilding(): VillageBuilding | null {
    return nearestVillageBuilding(this.pos);
  }

  /**
   * カメラを90度単位で回す(plan/models/village-camera-manual-rotate.md、
   * ダンジョンの`Renderer.rotate`と同じ操作・同じ考え方)。Q/E・二本指回転が
   * ここへ届く(`main.ts`の`handleGlobalAction`参照)
   */
  rotate(steps: number): void {
    this.targetYaw += (Math.PI / 2) * steps;
  }

  /**
   * カメラの向きを90度単位で表した値(0〜3)。`Input.cameraQuadrant`に
   * そのまま渡し、画面基準の移動入力をワールドの方角へ直すのに使う
   * (`Renderer.cameraQuadrant`と同じ役割・同じ実装)
   */
  get cameraQuadrant(): number {
    const steps = Math.round(this.targetYaw / (Math.PI / 2));
    return ((steps % 4) + 4) % 4;
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 今の`pos`・`cameraYaw`からカメラの位置・向きを組み立てる */
  private applyCameraTransform(): void {
    this.camera.position.set(
      this.pos.x + Math.sin(this.cameraYaw) * VILLAGE_CAMERA_DISTANCE,
      VILLAGE_CAMERA_HEIGHT,
      this.pos.z + Math.cos(this.cameraYaw) * VILLAGE_CAMERA_DISTANCE,
    );
    this.camera.lookAt(this.pos.x, VILLAGE_CAMERA_LOOK_HEIGHT, this.pos.z);
  }

  /**
   * カメラと主人公のあいだに割り込んだ建物を薄くする(plan/models/
   * village-scene-redesign.mdの「遮蔽」)。カメラを壁の内側へ押し込む
   * より実装が素直で、丸屋根のシルエットも保てる
   */
  private updateBuildingOcclusion(): void {
    const camera: VillagePos = { x: this.camera.position.x, z: this.camera.position.z };
    for (const building of VILLAGE_BUILDINGS) {
      const group = this.buildingGroups.get(building.id);
      if (!group) continue;
      const opacity = buildingOccludesView(camera, this.pos, building) ? VILLAGE_BUILDING_FADE_OPACITY : 1;
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          material.transparent = opacity < 1;
          material.opacity = opacity;
        }
      });
    }
  }
}
