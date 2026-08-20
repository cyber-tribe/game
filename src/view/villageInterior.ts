import * as THREE from "three";
import { ActorView } from "./actorView";
import type { Assets } from "./assets";

/**
 * 建物の中(plan/game/village-interiors.md)。
 *
 * 村なか歩きで屋内の建物に入ると、この小さな内装シーンへ切り替わり、
 * その建物の住人(村人モデル)が待機モーションで立っている。役割メニュー
 * (`TownScreen`)は画面の左へ寄せたパネルとして重なるので、内装と村人は
 * 右側に見え続ける。
 *
 * 図鑑ギャラリー(`GalleryView`)・村なか歩き(`VillageView`)と同じ流儀で、
 * 独立した`THREE.Scene`/`THREE.Camera`を持ち、`renderer.renderer.render(...)`
 * にだけ相乗りする。内装のジオメトリはBlenderパイプラインを使わず、
 * `VillageView`の`buildStructure`と同じくThree.jsのプリミティブで組む
 * (棚・机・タル程度の箱物に専用アセットは過剰なため)。
 *
 * 部屋の座標は、入口を手前(+z)・奥の壁を-zに置いた部屋中心が原点。
 * **画面の左半分はメニューパネルに覆われる**ので、見せたい小道具と住人は
 * x >= -1 あたりに寄せてある(`INTERIOR_VIEW_SHIFT`)。
 */

/** 部屋の内寸(床の一辺)。壁はこの外周に立てる */
const ROOM_SIZE = 5.6;
/** 壁の高さ */
const WALL_HEIGHT = 2.5;

/**
 * カメラ。部屋の入口(手前=+z)から見た固定の斜め俯瞰。歩き回りはさせない
 * ので、建物が変わっても画角は変えない(内装ごとに変わるのは小道具と
 * 明かりの色だけ)
 */
const CAMERA_FOV = 42;
const CAMERA_POS = new THREE.Vector3(1.9, 2.35, 5.0);
const CAMERA_TARGET = new THREE.Vector3(0.35, 0.95, -0.5);

/**
 * 内装を画面の右へ寄せる量(NDC。0で中央、+1で右端)。メニューパネルを
 * 左へ寄せるぶん、内装と村人は右側に見え続ける必要がある。
 * カメラの向き(=部屋の見え方)を変えるのではなく、視錐台を横にずらす
 * `filmOffset`で寄せるので、絵は歪まない
 */
export const INTERIOR_VIEW_SHIFT = 0.36;

/** 住人の立ち位置。入口(+z)を向いて立つ */
const RESIDENT_POS = { x: 0.55, z: -0.5 };

/**
 * three.js の `PerspectiveCamera.filmOffset` に渡す値を、望みの横シフト量
 * (NDC)から求める。
 *
 * `updateProjectionMatrix()`は視錐台の左端を `near * filmOffset / filmWidth`
 * だけずらす(`filmWidth = filmGauge * min(aspect, 1)`)。そこから逆算すると
 * 画面上のシフト量は `-filmOffset / (filmWidth * aspect * tan(fov/2))` になり、
 * `near`は打ち消し合って残らない。画面を右へ寄せたいので符号は負になる。
 */
export function interiorFilmOffset(
  fovDeg: number,
  aspect: number,
  ndcShift: number,
  filmGauge = 35,
): number {
  const filmWidth = filmGauge * Math.min(aspect, 1);
  return -ndcShift * filmWidth * aspect * Math.tan((fovDeg * Math.PI) / 360);
}

export interface VillageInteriorDef {
  /** `VILLAGE_BUILDINGS`のidと対応する */
  buildingId: string;
  /** 住人の村人モデル名(`src/modelList.ts`の`VILLAGER_MODELS`)。無人の建物はnull */
  resident: string | null;
  /** 壁・床の色 */
  wall: number;
  floor: number;
  /** 部屋を満たす明かりの色と強さ */
  ambient: number;
  ambientIntensity: number;
  /** 部屋の外の空気の色。シーンの背景に使う */
  background: number;
}

/**
 * 屋内系7件の内装。屋外系(旅の看板・オトネの依頼板・村の広場・洞窟の
 * 入口)は村マップ上の演出だけなのでここには載せない(代わりに
 * `src/view/village.ts`の`OUTDOOR_VILLAGERS`が村マップへ直接村人を立たせる)。
 */
export const VILLAGE_INTERIORS: readonly VillageInteriorDef[] = [
  // モグラ婆の倉庫: 壁一面の棚、積まれたタル・木箱、吊りランプ
  { buildingId: "storage", resident: "mogurabaa", wall: 0x54603e, floor: 0x3a3227, ambient: 0xffe0b0, ambientIntensity: 1.15, background: 0x120f0a },
  // ゲンドの工房: 炉(暖色の光源)、金床、壁の工具掛け、作りかけのタル
  { buildingId: "workshop", resident: "gendo", wall: 0x6e3c22, floor: 0x2e2620, ambient: 0xffbb80, ambientIntensity: 0.9, background: 0x160c07 },
  // ねむり小屋: 並んだ寝床、天蓋の布、夜色の薄明かり
  { buildingId: "sleepHut", resident: "fuku", wall: 0x453a5e, floor: 0x2b2740, ambient: 0x9fb4ff, ambientIntensity: 0.8, background: 0x0a0a18 },
  // おキヨの図鑑小屋: 本棚、標本瓶の棚、大きな机に開いた帳面
  { buildingId: "gallery", resident: "okiyo", wall: 0x5a3c62, floor: 0x322838, ambient: 0xe0ccff, ambientIntensity: 1.1, background: 0x120c18 },
  // 記録の間: 巻物棚、掲示された記録の紙、文机と筆
  { buildingId: "recordsHall", resident: "ito", wall: 0x5f5330, floor: 0x36301f, ambient: 0xffeec0, ambientIntensity: 1.05, background: 0x14110a },
  // 村の発展の受付: 村の模型が乗った台、図面の壁貼り(番人はいない)
  { buildingId: "development", resident: null, wall: 0x37624e, floor: 0x2a3229, ambient: 0xcfeedd, ambientIntensity: 1.1, background: 0x0b1410 },
  // ガルドの家: 寝床、衣装掛け、鏡台(自分の家なので番人はいない)
  { buildingId: "garudoHouse", resident: null, wall: 0x2f5560, floor: 0x2a3038, ambient: 0xbfe0ff, ambientIntensity: 1.0, background: 0x08111a },
];

const INTERIOR_BY_BUILDING = new Map(VILLAGE_INTERIORS.map((def) => [def.buildingId, def]));

/** その建物が内装を持つなら返す。屋外系の建物・未知のidならundefined */
export function interiorForBuilding(buildingId: string): VillageInteriorDef | undefined {
  return INTERIOR_BY_BUILDING.get(buildingId);
}

/** その建物の住人の村人モデル名。内装が無い、または無人ならnull */
export function interiorResidentModel(buildingId: string): string | null {
  return interiorForBuilding(buildingId)?.resident ?? null;
}

// ------------------------------------------------------------ 小道具

function mat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function glowMat(color: number, intensity = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.6,
  });
}

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  material: THREE.Material,
  rotY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

/**
 * タル。`barrel.glb`は起動時に必ず読む必須モデル(`essentialModelNames`)
 * なのでそのまま流用でき、万一まだ届いていなければ同じ寸法の円柱で代用する
 * (内装は建物ごとに一度だけ組むので、あとから差し替えはしない)
 */
function barrel(assets: Assets, x: number, y: number, z: number, scale = 1): THREE.Object3D {
  let object: THREE.Object3D;
  if (assets.has("barrel")) {
    object = assets.instantiate("barrel").root;
  } else {
    object = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.56, 10), mat(0x7a5a38));
    object.position.y = 0.28; // 円柱は中心が原点。タルのモデルは底が原点なので合わせる
  }
  object.scale.multiplyScalar(scale);
  object.position.set(x, object.position.y * scale + y, z);
  return object;
}

/** 壁に掛かった板もの(工具掛け・掲示された紙・図面) */
function wallPanel(w: number, h: number, x: number, y: number, material: THREE.Material): THREE.Mesh {
  return box(w, h, 0.04, x, y, -ROOM_SIZE / 2 + 0.12, material);
}

/** 棚。柱2本と棚板 levels 枚 */
function shelf(
  width: number, levels: number,
  x: number, z: number, rotY: number,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const height = 0.42 * levels + 0.1;
  group.add(box(0.07, height, 0.07, -width / 2, height / 2, 0, material));
  group.add(box(0.07, height, 0.07, width / 2, height / 2, 0, material));
  for (let i = 0; i < levels; i++) {
    group.add(box(width, 0.05, 0.4, 0, 0.42 * (i + 1), 0, material));
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  return group;
}

/**
 * 古タル転用の棚(design/village-buildings.md「倉庫の棚はすべて伏せた
 * タルを転用したもの」、`prop_shelf_barrel.glb`)。モグラ婆の倉庫で使う。
 * モデルが未読みなら`shelf()`の汎用棚で代用する(`barrel()`と同じ流儀。
 * 内装は建物ごとに一度だけ組むので、あとから差し替えはしない)
 */
function shelfBarrel(
  assets: Assets,
  width: number, x: number, z: number, rotY: number,
  fallbackMaterial: THREE.Material,
): THREE.Object3D {
  if (!assets.has("prop_shelf_barrel")) return shelf(width, 2, x, z, rotY, fallbackMaterial);
  // 単位(横幅1.10)を伸縮させず、必要なぶん横に並べて壁の幅を埋める
  const group = new THREE.Group();
  const unitWidth = 1.10;
  const count = Math.max(1, Math.round(width / unitWidth));
  const spacing = width / count;
  for (let i = 0; i < count; i++) {
    const unit = assets.instantiate("prop_shelf_barrel").root;
    unit.position.x = -width / 2 + spacing * (i + 0.5);
    group.add(unit);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  return group;
}

/** 机。天板1枚と脚4本 */
function desk(
  w: number, d: number,
  x: number, z: number, rotY: number,
  material: THREE.Material, h = 0.62,
): THREE.Group {
  const group = new THREE.Group();
  group.add(box(w, 0.07, d, 0, h, 0, material));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(box(0.07, h, 0.07, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1), material));
    }
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  return group;
}

/**
 * はしご。側木2本と横木数本(design/village-buildings.mdの「ガルドの
 * 育ての親の家でもあり、ガルドはこの倉庫の屋根裏で育った」を反映し、
 * モグラ婆の倉庫の屋根裏へ続くはしごとして使う)
 */
function ladder(x: number, z: number, height: number, rotY: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    group.add(box(0.05, height, 0.05, side * 0.22, height / 2, 0, material));
  }
  const rungCount = Math.floor(height / 0.32);
  for (let i = 1; i <= rungCount; i++) {
    group.add(box(0.40, 0.04, 0.04, 0, (height / (rungCount + 1)) * i, 0, material));
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  return group;
}

/** 吊りランプ。ひもと球、そして小さな点光源 */
function hangingLamp(x: number, z: number, color: number, cordMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.03, 0.85, 0.03, 0, WALL_HEIGHT - 0.42, 0, cordMaterial));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glowMat(color, 1.4));
  bulb.position.y = WALL_HEIGHT - 0.92;
  group.add(bulb);
  const light = new THREE.PointLight(color, 5, 6, 1.5);
  light.position.y = WALL_HEIGHT - 0.98;
  group.add(light);
  group.position.set(x, 0, z);
  return group;
}

/** 寝床。敷物と、枕がわりに寝かせた小さなタル */
function bedding(assets: Assets, x: number, z: number, clothMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.8, 0.09, 1.4, 0, 0.045, 0, clothMaterial));
  const pillow = barrel(assets, 0.16, 0.09, -0.48, 0.5);
  pillow.rotation.z = Math.PI / 2;
  group.add(pillow);
  group.position.set(x, 0, z);
  return group;
}

/**
 * ねむり小屋のタルの寝床(design/village-buildings.md「タルの寝床が
 * ずらりと並ぶ」、`prop_barrel_bed.glb`)。横倒しのタル+掛け布+名札の
 * 専用モデル。モデルが未読みなら`bedding()`の汎用寝床で代用する
 */
function barrelBed(assets: Assets, x: number, z: number, rotY: number,
                   fallbackCloth: THREE.Material): THREE.Object3D {
  if (assets.has("prop_barrel_bed")) {
    const object = assets.instantiate("prop_barrel_bed").root;
    object.position.set(x, 0, z);
    object.rotation.y = rotY;
    return object;
  }
  return bedding(assets, x, z, fallbackCloth);
}

/** 部屋の外枠(床・天井・奥と左右の壁)。手前(入口側)は開けたままにする */
function buildShell(def: VillageInteriorDef): THREE.Group {
  const group = new THREE.Group();
  const wallMat = mat(def.wall, 0.95);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), mat(def.floor, 1));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), mat(0x1b1a22, 1));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  group.add(ceiling);

  group.add(box(ROOM_SIZE, WALL_HEIGHT, 0.18, 0, WALL_HEIGHT / 2, -ROOM_SIZE / 2, wallMat));
  group.add(box(0.18, WALL_HEIGHT, ROOM_SIZE, -ROOM_SIZE / 2, WALL_HEIGHT / 2, 0, wallMat));
  group.add(box(0.18, WALL_HEIGHT, ROOM_SIZE, ROOM_SIZE / 2, WALL_HEIGHT / 2, 0, wallMat));

  group.add(new THREE.AmbientLight(def.ambient, def.ambientIntensity));
  const key = new THREE.DirectionalLight(0xfff2dc, 0.85);
  key.position.set(3, 6, 5);
  group.add(key);
  return group;
}

/** 建物ごとの小道具。plan/game/village-interiors.md の表がそのまま並ぶ */
function buildProps(def: VillageInteriorDef, assets: Assets): THREE.Group {
  const group = new THREE.Group();
  const wood = mat(0x6b502f);
  const darkWood = mat(0x43331f);

  switch (def.buildingId) {
    case "storage": {
      // 壁一面の棚(古タル転用の棚。design/village-buildings.mdの
      // 「倉庫の棚はすべて伏せたタルを転用したもの」を反映)
      group.add(shelfBarrel(assets, 4.6, 0.2, -2.5, 0, wood));
      group.add(shelfBarrel(assets, 3.4, 2.5, 0.1, Math.PI / 2, wood));
      // 積まれたタル・木箱
      group.add(barrel(assets, -0.9, 0, 1.2));
      group.add(barrel(assets, -0.35, 0, 1.5));
      group.add(barrel(assets, -0.62, 0.56, 1.32));
      group.add(barrel(assets, 1.9, 0, -1.5));
      group.add(box(0.7, 0.55, 0.7, 1.75, 0.28, 1.3, darkWood, 0.3));
      group.add(box(0.6, 0.5, 0.6, 1.7, 0.8, 1.25, darkWood, -0.2));
      // 屋根裏へ続くはしご(design/village-buildings.mdの「ガルドはこの
      // 倉庫の屋根裏で育った」を反映)
      group.add(ladder(-2.55, -1.9, 2.3, Math.PI / 2, darkWood));
      // 吊りランプ
      group.add(hangingLamp(0.6, 0.7, 0xffcf82, darkWood));
      break;
    }
    case "workshop": {
      // 炉。焚き口が暖色に光り、部屋をその色で照らす
      group.add(box(1.5, 1.4, 1.1, -0.9, 0.7, -2.1, mat(0x4a4038, 1)));
      group.add(box(0.75, 0.6, 0.1, -0.9, 0.65, -1.52, glowMat(0xff8a34, 1.6)));
      const forge = new THREE.PointLight(0xff8a34, 10, 8, 1.4);
      forge.position.set(-0.7, 0.95, -1.3);
      group.add(forge);
      group.add(box(0.5, 1.1, 0.5, -0.9, WALL_HEIGHT - 0.15, -2.1, mat(0x39322c, 1)));
      // 金床(台と上の鉄塊)
      group.add(box(0.44, 0.42, 0.44, 1.75, 0.21, 0.2, darkWood));
      group.add(box(0.64, 0.24, 0.32, 1.75, 0.54, 0.2, mat(0x50565e, 0.5)));
      // 壁の工具掛け
      group.add(wallPanel(1.9, 0.08, 1.3, 1.8, darkWood));
      for (let i = 0; i < 5; i++) {
        group.add(box(0.07, 0.4 + (i % 3) * 0.12, 0.07, 0.55 + i * 0.38, 1.53, -ROOM_SIZE / 2 + 0.14, mat(0x767c88, 0.5)));
      }
      // 作りかけのタル(側板が2枚立てかけてあるだけ)
      group.add(barrel(assets, 0.1, 0, 1.5));
      group.add(box(0.14, 0.62, 0.05, -0.4, 0.31, 1.5, wood, 0.25));
      group.add(box(0.14, 0.62, 0.05, -0.2, 0.31, 1.62, wood, -0.15));
      break;
    }
    case "sleepHut": {
      // 並んだ寝床(横倒しのタル+掛け布+名札。design/village-buildings.md
      // の「タルの寝床がずらりと並ぶ」を反映)
      const futon = mat(0x4c4470);
      group.add(barrelBed(assets, -0.65, -0.3, 0, futon));
      group.add(barrelBed(assets, 0.65, -0.3, 0, futon));
      group.add(barrelBed(assets, 1.95, -0.3, 0, futon));
      group.add(barrelBed(assets, 1.95, 1.5, 0, futon));
      // 天蓋の布(部屋をまたいで張った布と、垂れ下がった端)
      const canopy = mat(0x6a5f9a, 0.85);
      group.add(box(5.2, 0.05, 3.2, 0, WALL_HEIGHT - 0.35, -0.5, canopy));
      group.add(box(5.2, 0.45, 0.05, 0, WALL_HEIGHT - 0.58, 1.1, canopy));
      // 夜色の薄明かり
      const moon = new THREE.PointLight(0x8fa8ff, 5, 8, 1.5);
      moon.position.set(0.8, WALL_HEIGHT - 0.75, 1.3);
      group.add(moon);
      break;
    }
    case "gallery": {
      // 本棚。図鑑の実体は本ではなく、タルの側板に焼き付けた木札の束
      // (design/village-buildings.mdの「記録はタルの側板に焼き付けた
      // 木札に書く。図鑑=木札の束」を反映)
      group.add(shelf(2.4, 4, -0.4, -2.5, 0, darkWood));
      const tagWoods = [wood, darkWood];
      const cordMat = mat(0x2a2018, 0.85);
      for (let level = 0; level < 3; level++) {
        for (let bundle = 0; bundle < 3; bundle++) {
          const bundleGroup = new THREE.Group();
          for (let t = 0; t < 5; t++) {
            const h = 0.18 + (t % 3) * 0.02;
            bundleGroup.add(box(0.045, h, 0.22, t * 0.05, h / 2, 0, tagWoods[t % 2]!));
          }
          bundleGroup.add(box(0.32, 0.02, 0.03, 0.10, 0.12, 0, cordMat));
          bundleGroup.position.set(-1.55 + bundle * 0.75, 0.42 * (level + 1) + 0.14, -2.5);
          group.add(bundleGroup);
        }
      }
      // 標本瓶の棚
      group.add(shelf(1.9, 3, 2.1, -2.5, 0, darkWood));
      const jarColors = [0x7fd6ff, 0xc9b4ff, 0x96f0b8];
      for (let i = 0; i < 9; i++) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), glowMat(jarColors[i % 3]!, 0.35));
        jar.position.set(1.45 + (i % 3) * 0.62, 0.42 * (1 + Math.floor(i / 3)) + 0.15, -2.5);
        group.add(jar);
      }
      // 大きな机に開いた帳面
      group.add(desk(1.9, 1.0, 0.75, 1.15, 0, wood, 0.66));
      group.add(box(0.4, 0.03, 0.34, 0.6, 0.71, 1.15, mat(0xe6e0cc, 0.9), 0.12));
      group.add(box(0.4, 0.03, 0.34, 1.02, 0.71, 1.13, mat(0xe6e0cc, 0.9), -0.06));
      group.add(hangingLamp(0.75, 1.15, 0xd9c2ff, darkWood));
      break;
    }
    case "recordsHall": {
      // 巻物棚(格子の穴に巻物が差し込んである)
      group.add(box(3.2, 1.95, 0.5, 0.2, 0.98, -2.45, darkWood));
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.44, 8), mat(0xe3d8b6, 0.85));
          scroll.rotation.x = Math.PI / 2;
          scroll.position.set(-1.2 + col * 0.56, 0.35 + row * 0.45, -2.3);
          group.add(scroll);
        }
      }
      // 掲示された記録の紙
      for (let i = 0; i < 4; i++) {
        group.add(wallPanel(0.42, 0.54, 2.05 + (i % 2) * 0.5, 1.62 - Math.floor(i / 2) * 0.66, mat(0xefe6c8, 0.9)));
      }
      // 文机と筆
      group.add(desk(1.5, 0.8, 1.55, 1.1, -0.3, wood, 0.4));
      group.add(box(0.34, 0.02, 0.28, 1.45, 0.45, 1.05, mat(0xefe6c8, 0.9), -0.3));
      const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat(0x2a2018, 0.7));
      brush.rotation.z = Math.PI / 2.4;
      brush.position.set(1.85, 0.47, 1.2);
      group.add(brush);
      group.add(hangingLamp(0.9, 1.0, 0xffe1a0, darkWood));
      break;
    }
    case "development": {
      // 村の模型が乗った台。村マップの建物と同じ「小屋+とんがり屋根」を小さく並べる
      group.add(desk(2.8, 1.8, 0.7, 0.6, 0, wood, 0.72));
      group.add(box(2.5, 0.04, 1.55, 0.7, 0.78, 0.6, mat(0x3d5a3a, 1)));
      const hutMat = mat(0xb8a274, 0.9);
      const roofMat = mat(0x53402c, 0.95);
      const spots = [[-0.85, -0.4], [-0.2, 0.35], [0.5, -0.3], [1.05, 0.4], [0.15, -0.6]] as const;
      for (const [dx, dz] of spots) {
        group.add(box(0.26, 0.22, 0.26, 0.7 + dx, 0.91, 0.6 + dz, hutMat, dx));
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0.7 + dx, 1.1, 0.6 + dz);
        group.add(roof);
      }
      // 図面の壁貼り
      for (let i = 0; i < 3; i++) {
        group.add(wallPanel(0.9, 1.1, -0.6 + i * 1.1, 1.6, mat(0xd8dcc4, 0.9)));
      }
      group.add(hangingLamp(0.7, 0.6, 0xd6f0dd, darkWood));
      break;
    }
    case "garudoHouse": {
      // 寝床
      group.add(bedding(assets, -0.5, 0.4, mat(0x3f5a68)));
      // 土間の支度タル(design/village-buildings.mdの「土間に支度用の
      // タルが一つ」を反映)
      group.add(barrel(assets, 0.3, 0, 1.9));
      // 壁の歴代樽守りの手形(design記述の「壁に歴代の樽守りの手形が
      // 押してある(身支度=衣装替えの場)」を反映)
      const handprintMat = mat(0x8a6b4a, 0.8);
      const fingerOffsets = [
        [-0.045, 0.075], [-0.018, 0.09], [0.012, 0.09], [0.040, 0.078], [0.062, 0.045],
      ] as const;
      for (const [hx, hy] of [[-2.3, 1.0], [-2.3, 1.85]] as const) {
        const palm = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), handprintMat);
        palm.position.set(hx, hy, -2.79);
        group.add(palm);
        for (const [fx, fy] of fingerOffsets) {
          const finger = new THREE.Mesh(new THREE.CircleGeometry(0.017, 8), handprintMat);
          finger.position.set(hx + fx, hy + fy, -2.79);
          group.add(finger);
        }
      }
      // 衣装掛け(横木に何着か掛かっている)
      group.add(box(0.08, 1.7, 0.08, 0.75, 0.85, -2.2, darkWood));
      group.add(box(0.08, 1.7, 0.08, 2.5, 0.85, -2.2, darkWood));
      group.add(box(1.85, 0.07, 0.07, 1.62, 1.68, -2.2, darkWood));
      const costumeColors = [0x7fd6ff, 0xc9b4ff, 0x96f0b8, 0xffc98a];
      costumeColors.forEach((color, i) => {
        group.add(box(0.34, 0.78, 0.1, 1.0 + i * 0.42, 1.24, -2.2, mat(color, 0.85), i % 2 ? 0.08 : -0.08));
      });
      // 鏡台
      group.add(desk(0.9, 0.55, 1.7, 1.5, -0.4, wood, 0.6));
      group.add(box(0.7, 0.9, 0.06, 1.82, 1.1, 1.36, mat(0x2b3a46, 0.6), -0.4));
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.76), glowMat(0xa8ccdd, 0.22));
      mirror.position.set(1.81, 1.1, 1.39);
      mirror.rotation.y = -0.4;
      group.add(mirror);
      group.add(hangingLamp(0.6, 0.8, 0xbfe0ff, darkWood));
      break;
    }
  }
  return group;
}

/**
 * 建物の内装シーン。入った建物の部屋だけを表示し、住人の村人モデルを
 * 定位置に立たせる。歩き回りはしないので、毎フレーム更新するのは
 * アニメーションだけ。
 */
export class VillageInteriorView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** 一度組んだ部屋は使い回す(建物を出入りするたびに作り直さない) */
  private readonly rooms = new Map<string, THREE.Group>();
  private current: VillageInteriorDef | null = null;
  private resident: ActorView | null = null;
  /** 今立っている住人のモデル名。部屋が変わったら作り直す */
  private residentModel: string | null = null;
  /** 入った直後の一拍。モデルが遅れて届いた場合も、届いた回に`talk`を出す */
  private pendingTalk = false;
  private aspect = 1;

  constructor(private readonly assets: Assets) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 40);
    this.camera.position.copy(CAMERA_POS);
    this.camera.lookAt(CAMERA_TARGET);
    this.applyProjection();
  }

  /** 今どの建物の中にいるか(何も開いていなければnull) */
  get currentBuildingId(): string | null {
    return this.current?.buildingId ?? null;
  }

  /**
   * その建物の内装へ切り替える。内装を持たない建物(屋外系)を渡された
   * ときは何もせずfalseを返す。同じ建物へ入り直したときは、住人の
   * 一拍(`talk`)だけやり直す
   */
  enter(buildingId: string): boolean {
    const def = interiorForBuilding(buildingId);
    if (!def) return false;

    if (this.current?.buildingId !== def.buildingId) {
      if (this.current) this.roomOf(this.current).visible = false;
      this.current = def;
      this.roomOf(def).visible = true;
      this.scene.background = new THREE.Color(def.background);
      // 住人が変わるので、前の建物の村人は片付ける
      if (this.residentModel !== def.resident) {
        this.resident?.dispose();
        this.resident = null;
        this.residentModel = def.resident;
      }
    }
    this.pendingTalk = def.resident !== null;
    return true;
  }

  /** 村なか歩きへ戻る。次に入るときのために部屋自体は捨てない */
  leave(): void {
    if (this.current) this.roomOf(this.current).visible = false;
    this.current = null;
    this.pendingTalk = false;
  }

  update(dt: number): void {
    this.ensureResident();
    this.resident?.update(dt);
  }

  setAspect(aspect: number): void {
    if (this.aspect === aspect) return;
    this.aspect = aspect;
    this.applyProjection();
  }

  private applyProjection(): void {
    this.camera.aspect = this.aspect;
    // 視錐台を横へずらして、内装をメニューパネルの反対側(右)へ寄せる
    this.camera.filmOffset = interiorFilmOffset(
      CAMERA_FOV,
      this.aspect,
      INTERIOR_VIEW_SHIFT,
      this.camera.filmGauge,
    );
    this.camera.updateProjectionMatrix();
  }

  private roomOf(def: VillageInteriorDef): THREE.Group {
    const existing = this.rooms.get(def.buildingId);
    if (existing) return existing;
    const room = new THREE.Group();
    room.add(buildShell(def));
    room.add(buildProps(def, this.assets));
    room.visible = false;
    this.rooms.set(def.buildingId, room);
    this.scene.add(room);
    return room;
  }

  /**
   * 住人のモデルが届いていれば立たせる。村人モデルは起動時には読まれず
   * (`essentialModelNames`に入っていない)背景で追いかけているので、
   * 図鑑ギャラリーの`show()`と同じく毎フレーム様子を見て、届いた回に
   * 1度だけ作る。村人のモデルは足元が原点(実測でmin.y=0.00〜0.05)なので、
   * そのまま床(y=0)に置けば足が床に着く
   */
  private ensureResident(): void {
    const model = this.current?.resident ?? null;
    if (!model) return;
    if (!this.resident) {
      if (!this.assets.has(model)) {
        this.assets.loadInBackground([model]);
        return;
      }
      // 入口(画面手前=+z)を向いて立つ。dirDeltaの4が南
      this.resident = new ActorView(
        this.assets.instantiate(model),
        { x: RESIDENT_POS.x, y: RESIDENT_POS.z },
        4,
      );
      this.scene.add(this.resident.root);
    }
    if (this.pendingTalk) {
      this.pendingTalk = false;
      // 一度きりのクリップなので、再生し終われば自動でidleへ戻る
      this.resident.play("talk");
    }
  }
}
