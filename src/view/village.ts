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
 * ヨリシロの稜線を模した遠景の山影(plan/models/village-scene-redesign.md
 * 「山を背景に置く」)。村の奥(北=-Z側)に、霧がかった大きな山影を
 * 常に見せる。低ポリの四角錐を3層に重ね、奥ほど色を薄く・霧がかって
 * 見せることで遠近を表す。`material.fog = false`にしてあるのは、
 * シーンの`Fog`(近14・遠30)だと山の位置によっては完全に埋もれて
 * 見えなくなってしまうため、代わりに層ごとの不透明度で「霧をまとった
 * 遠景」を表現している。
 */
function buildMountainBackdrop(): THREE.Group {
  const group = new THREE.Group();
  const layers: ReadonlyArray<{ z: number; color: number; opacity: number }> = [
    { z: -34, color: 0x2a3450, opacity: 0.5 },
    { z: -26, color: 0x323f5e, opacity: 0.7 },
    { z: -19, color: 0x3b4a6c, opacity: 0.92 },
  ];
  for (const layer of layers) {
    const material = new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: layer.opacity,
      fog: false,
    });
    const peakCount = 6;
    for (let i = 0; i < peakCount; i++) {
      const x = -32 + (i / (peakCount - 1)) * 64 + (i % 2 === 0 ? -3 : 3);
      const height = 10 + (i % 3) * 3.5;
      const width = 14 + (i % 2) * 5;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(width / 2, height, 4), material);
      peak.rotation.y = Math.PI / 4;
      peak.position.set(x, height / 2 - 1, layer.z);
      group.add(peak);
    }
  }
  return group;
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
}

const DAYTIME_LIGHTING: VillageLightingPreset = {
  background: 0xcfe8f7,
  fog: 0xcfe8f7,
  ambientColor: 0xfff2df,
  ambientIntensity: 1.9,
  sunColor: 0xfff4d8,
  sunIntensity: 1.5,
  windowGlowIntensity: 1.2,
};

const YOIMATSURI_LIGHTING: VillageLightingPreset = {
  background: 0x6b3550,
  fog: 0x6b3550,
  ambientColor: 0x4a3550,
  ambientIntensity: 1.0,
  sunColor: 0xffa050,
  sunIntensity: 0.9,
  windowGlowIntensity: 3.0,
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

  constructor(private readonly assets: Assets) {
    this.scene.background = new THREE.Color(DAYTIME_LIGHTING.background);
    this.scene.fog = new THREE.Fog(DAYTIME_LIGHTING.fog, 14, 30);

    this.scene.add(this.ambientLight);
    this.sunLight.position.set(6, 12, 4);
    this.scene.add(this.sunLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(
        VILLAGE_BOUNDS.maxX - VILLAGE_BOUNDS.minX,
        VILLAGE_BOUNDS.maxZ - VILLAGE_BOUNDS.minZ,
      ),
      new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.scene.add(buildMountainBackdrop());

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

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
    this.updateCamera();
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

  /** 押されている方向に応じて歩かせる。`dir`は`Input.direction()`をそのまま渡す */
  update(dt: number, dir: Dir | null): void {
    const before = this.pos;
    this.pos = moveVillagePlayer(this.pos, dir, dt);
    this.playerMesh.position.set(this.pos.x, 0.75, this.pos.z);
    this.updateCamera();

    this.ensureBuildingModels();
    this.ensureScenery();
    this.ensureVillagers(dt);
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
