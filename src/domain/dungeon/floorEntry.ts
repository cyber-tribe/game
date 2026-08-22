import { eq, type Vec2 } from "../../core/grid";
import type { AllyActor, FloorGimmickKind, FloorState, Tile } from "../../core/types";
import { TILE_CORRIDOR, TILE_ROOM, TILE_WALL, freeSpotNear } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { PlayerState } from "../../entities/player";
import type { IdSource } from "../../dungeon/populate";
import {
  choosePlayerStart,
  createBarrel,
  createItem,
  createMonster,
  findFreeTile,
  placeChapter3CollapseObstacle,
  placeDecoyBarrels,
  placeDecoyStairs,
  placeQuagmireTiles,
  placeSecretPassage,
  placeSporeRooms,
  placeTorrentTiles,
  populateFloor,
} from "../../dungeon/populate";
import { generateFloor } from "../../dungeon/generate";
import { pickFloorGimmick } from "../../dungeon/gimmicks";
import { updateVisibility } from "../../dungeon/visibility";
import {
  type DungeonDef,
  branchDungeonSpecFor,
  dungeonById,
  isCheckpointFloor,
  isChapter3CollapseFloor,
  nightlyDreamStatMultiplier,
  regionIndexForDungeonId,
  HINATA_ID,
  NIGHTLY_DREAM_ID,
  TRIAL_CHAMBER_ID,
  TRUE_AWAKENING_ID,
} from "../../entities/dungeons";
import { storyChapter } from "../../entities/story";
import {
  GIMMICK_CHANCE_MULTIPLIER,
  GOLD_REWARD_MULTIPLIER,
  MONSTER_ATK_MULTIPLIER,
  MONSTER_HOUSE_CHANCE_MULTIPLIER,
  SHINING_CHANCE_DIFFICULTY_MULTIPLIER,
  type DifficultyMode,
} from "../../entities/difficulty";
import { HAJIME_NO_YUME_ID, REGION_BOSS_ORDER, speciesById } from "../../entities/species";
import { REGIONS, regionByIndex } from "../../entities/regions";
import type { MoodDef } from "../../entities/moods";
import { hasEquipEffect } from "../../items/inventory";

/**
 * 図鑑コンプリート(plan/monster-compendium.md)時、かがやきの夢のかけらの
 * 出現確率に掛かる倍率。基準の確率自体は dungeon/populate.ts 側で定義する
 */
const COMPENDIUM_COMPLETE_SHINING_MULTIPLIER = 1.5;
/**
 * 真の目覚め(plan/true-awakening.md)達成後の恒久ボーナス。図鑑コンプリート
 * の1.5倍からさらに+0.5%(基準1%換算)上乗せし、合計2倍にする。
 * 達成には図鑑コンプリートが前提条件のひとつなので、この倍率は
 * COMPENDIUM_COMPLETE_SHINING_MULTIPLIERの代わりに使う(掛け合わせない)
 */
const TRUE_AWAKENING_SHINING_MULTIPLIER = 2;

/** 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 抽選対象の地方番号(第二〜第七地方) */
const MOSAIC_CANDIDATE_REGIONS = [2, 3, 4, 5, 6, 7];

/**
 * 地方固有の地形ギミック配置フック(plan/wetland-quagmire.md・plan/spore-grove.md・
 * plan/waterfall-torrent.md・plan/festival-mirage.md)。地方番号→フロア生成後に
 * 呼ぶ配置関数。フックを持たない地方(第一・第四・第六・第八)はここには現れない
 * (第四地方はモンスターハウス倍率のみ、第六地方は別モジュールの物音ギミック、
 * 第八地方はモザイク抽選そのもの)
 */
const REGION_GIMMICK_PLACERS: Readonly<Record<number, (rng: Rng, floor: FloorState, ids: IdSource) => void>> = {
  2: (rng, floor) => placeQuagmireTiles(rng, floor),
  3: (rng, floor) => placeSporeRooms(rng, floor),
  5: (rng, floor) => placeTorrentTiles(rng, floor),
  7: (rng, floor, ids) => {
    placeDecoyStairs(rng, floor);
    placeDecoyBarrels(rng, floor, ids);
  },
};

/** 第四地方(骨積みの回廊)。モンスターハウス出現率の乗数は regions.ts のデータに持たせている */
const BONEPILE_REGION = regionByIndex(4);

/**
 * フロア入場に必要な、Gameからの読み取り専用の入力一式。フィールド更新
 * (floor/mosaicRegions/previousGimmick/shopSeenThisRun)はこのオブジェクトを
 * いじらず、戻り値としてGame側で代入する
 */
export interface FloorEntryContext {
  rng: Rng;
  ids: IdSource;
  dungeonId: string;
  dungeonMaxDepth: number | undefined;
  dungeonMonsterHouseRateMul: number | undefined;
  dungeonShopRateMul: number | undefined;
  dungeonMonsterCountMul: number | undefined;
  dungeonFloorOffset: number | undefined;
  maxDepth: number;
  difficulty: DifficultyMode;
  mood: MoodDef;
  player: PlayerState;
  allies: AllyActor[];
  trueAwakeningCleared: boolean;
  compendiumComplete: boolean;
  shopWary: boolean;
  shopSeenThisRun: boolean;
  mosaicRegions: readonly number[];
  previousGimmick: FloorGimmickKind | undefined;
  defeatedRegionBossCountAtStart: number;
  visionExtraRange: number;
}

export interface FloorEntryResult {
  floor: FloorState;
  mosaicRegions: number[];
  previousGimmick: FloorGimmickKind | undefined;
  shopSeenThisRun: boolean;
}

/** 仲間は階段について来る。プレイヤーの周りの空いたマスに並べる */
function placeAlliesNear(floor: FloorState, allies: readonly AllyActor[], start: Vec2, rng: Rng): void {
  for (const ally of allies) {
    const spot = freeSpotNear(floor, rng, start, 3);
    if (!spot) continue;
    ally.pos = spot;
    ally.aware = true;
    floor.actors.push(ally);
  }
}

/**
 * ひなたの寝穴(plan/game/tutorial-dungeon.md)。1部屋だけの小さな固定Floorを
 * 直接組み立てる(tarukurabeと同じ考え方だが、tarukurabeはこのモジュールでは
 * 扱わずGameに残る)。区画割り・通路のgenerateFloorを経由しないため、
 * 罠・地形ギミック・モンスターハウス・野生湧きは一切乗らない。出現・設置物は
 * ぷるんと必要な道具だけを階ごとに手で置く(1階: 攻撃を覚える的にぷるん1体。
 * 2階: タル投げ・捕獲を覚える空のタル1個+ぷるん1体。3階: 道具・満腹度を
 * 覚えるいやしの葉+かたパン、番人のぷるん2体、最奥にめざめの階段)
 */
function enterHinataFloor(depth: number, ctx: FloorEntryContext): FloorState {
  const width = 13;
  const height = 7;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles.push({ kind: isWall ? TILE_WALL : TILE_ROOM, roomId: isWall ? -1 : 0, explored: false, visible: false });
    }
  }

  const floor: FloorState = {
    depth,
    width,
    height,
    tiles,
    rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
    stairs: { x: width - 2, y: 3 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };

  ctx.player.pos = { x: 1, y: 3 };
  ctx.player.carrying = null;
  floor.actors.push(ctx.player);

  const purun = speciesById("purun");
  if (depth === 1) {
    floor.actors.push(createMonster(ctx.ids.nextActorId(), purun, { x: 5, y: 3 }));
  } else if (depth === 2) {
    floor.barrels.push(createBarrel(ctx.ids.nextBarrelId(), "empty", { x: 5, y: 2 }));
    floor.actors.push(createMonster(ctx.ids.nextActorId(), purun, { x: 5, y: 4 }));
  } else {
    floor.items.push({ item: createItem(ctx.ids.nextItemUid(), "healLeaf"), pos: { x: 4, y: 2 } });
    floor.items.push({ item: createItem(ctx.ids.nextItemUid(), "hardBread"), pos: { x: 4, y: 4 } });
    floor.actors.push(createMonster(ctx.ids.nextActorId(), purun, { x: 9, y: 2 }));
    floor.actors.push(createMonster(ctx.ids.nextActorId(), purun, { x: 9, y: 4 }));
  }

  return floor;
}

/**
 * ボスの間(plan/game/dungeon-boss-rooms.md)。手作りの固定Floorを直接
 * 組み立てる。「前室(安全地帯)─通路─扉─ボスの間(大部屋)」の一本道にし、
 * ボス以外の湧きモンスター・地形ギミックは乗せない。ボス自体の配置は
 * populateFloorの既存のbossSpeciesId分岐(部屋タイル・プレイヤーから
 * 距離6以上)にそのまま委ねる――ボスAI・強さの計算式を一切変えずに済ませるため
 */
function enterBossFloor(depth: number, bossSpeciesId: string, ctx: FloorEntryContext): FloorState {
  const ante = { x: 1, y: 3, w: 5, h: 5 };
  const boss = { x: 14, y: 1, w: 13, h: 9 };
  const corridorY = ante.y + Math.floor(ante.h / 2);
  const corridorStartX = ante.x + ante.w;
  const doorX = corridorStartX + Math.floor((boss.x - corridorStartX) / 2);
  const width = boss.x + boss.w + 1;
  const height = Math.max(ante.y + ante.h, boss.y + boss.h) + 1;

  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ kind: TILE_WALL, roomId: -1, explored: false, visible: false });
    }
  }
  const carve = (x: number, y: number, kind: typeof TILE_ROOM | typeof TILE_CORRIDOR, roomId: number) => {
    tiles[y * width + x] = { kind, roomId, explored: false, visible: false };
  };
  for (let y = ante.y; y < ante.y + ante.h; y++) {
    for (let x = ante.x; x < ante.x + ante.w; x++) carve(x, y, TILE_ROOM, 0);
  }
  for (let y = boss.y; y < boss.y + boss.h; y++) {
    for (let x = boss.x; x < boss.x + boss.w; x++) carve(x, y, TILE_ROOM, 1);
  }
  for (let x = corridorStartX; x < boss.x; x++) {
    carve(x, corridorY, TILE_CORRIDOR, -1);
  }

  const start: Vec2 = { x: ante.x + Math.floor(ante.w / 2), y: corridorY };
  const floor: FloorState = {
    depth,
    width,
    height,
    tiles,
    rooms: [
      { id: 0, x: ante.x, y: ante.y, w: ante.w, h: ante.h },
      { id: 1, x: boss.x, y: boss.y, w: boss.w, h: boss.h },
    ],
    // 階段はボスの間の奥に最初から置いてあるが、ボスを撃破するまでは
    // 壁と同じく通れない(plan/game/dungeon-boss-rooms.mdの「撃破後に
    // 踏破の階段が現れる」。killActorの地方ボス撃破処理でfalseにする)
    stairs: { x: boss.x + boss.w - 2, y: boss.y + boss.h - 2 },
    stairsBlocked: true,
    door: { pos: { x: doorX, y: corridorY }, open: false, bossSpeciesId },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };

  ctx.player.pos = start;
  floor.actors.push(ctx.player);

  populateFloor(ctx.rng, floor, ctx.ids, start, {
    bossSpeciesId,
    monsterAtkMultiplier: MONSTER_ATK_MULTIPLIER[ctx.difficulty] * (ctx.mood.monsterAtkMulAfterAware ?? 1),
    goldRewardMultiplier: GOLD_REWARD_MULTIPLIER[ctx.difficulty] * (ctx.mood.goldRateMul ?? 1),
    speciesDepthOffset: ctx.dungeonFloorOffset ?? 0,
    itemCountMultiplier: ctx.mood.dropRateMul ?? 1,
    thiefWeightMultiplier: ctx.mood.thiefRateMul ?? 1,
  });

  // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md):
  // 骨積みの回廊(第四地方)最終階=24階は、ボスの間でもある。ボスの間の
  // 固定構造に置き換えても、この階固有の物語イベントは消さない
  // (通常のenterFloorと同じ条件のまま、ボスの間側でも呼ぶ)
  if (isChapter3CollapseFloor(ctx.dungeonId, depth) && storyChapter(ctx.defeatedRegionBossCountAtStart, false) >= 3) {
    placeChapter3CollapseObstacle(floor);
  }

  placeAlliesNear(floor, ctx.allies, start, ctx.rng);
  return floor;
}

/**
 * フロア入場(plan/dungeon-boss-rooms.md 等)。生成・配置・ギミック抽選・
 * 章依存の障害物の呼び出し順を、この関数の並びとして固定する。
 * 樽比べ(plan/tarukurabe-minigame.md)は専用の手作りFloorのため、
 * ここでは扱わずGame側で分岐する(呼び出し前に判定済みという前提)
 */
export function enterFloor(depth: number, ctx: FloorEntryContext): FloorEntryResult {
  // ひなたの寝穴(plan/game/tutorial-dungeon.md): 通常のフロア生成を経由せず、
  // 階ごとに手作りの固定Floorを直接組み立てる
  if (ctx.dungeonId === HINATA_ID) {
    const floor = enterHinataFloor(depth, ctx);
    updateVisibility(floor, ctx.player.pos, ctx.visionExtraRange);
    return {
      floor,
      mosaicRegions: [...ctx.mosaicRegions],
      previousGimmick: ctx.previousGimmick,
      shopSeenThisRun: ctx.shopSeenThisRun,
    };
  }

  // 地方ボス(plan/region-bosses.md): 地方ダンジョンのボス階には、通常の野生モンスターも
  // フロアギミックも乗せない(ボス以外の変数を減らす、本文どおりの方針)。
  // 腕試しの間(plan/hidden-dungeon.md)は、全階がボス階の再戦だけで構成される
  const dungeonRegionIndex = regionIndexForDungeonId(ctx.dungeonId);
  const bossSpeciesId =
    dungeonRegionIndex !== undefined && depth === ctx.dungeonMaxDepth
      ? regionByIndex(dungeonRegionIndex).bossSpeciesId
      : ctx.dungeonId === TRIAL_CHAMBER_ID
        ? REGION_BOSS_ORDER[depth - 1]
        : // 真の目覚め(plan/true-awakening.md): 最終階にだけ「はじめの夢」を配置する
          ctx.dungeonId === TRUE_AWAKENING_ID && depth === ctx.maxDepth
          ? HAJIME_NO_YUME_ID
          : undefined;

  // ボスの間(plan/game/dungeon-boss-rooms.md): 地方ダンジョンのボス階だけ、通常の
  // フロア生成(generateFloor)を経由せず、前室→扉→ボスの間の固定構造を組む。
  // 腕試しの間・真の目覚めは対象外(docの対象外どおり。それぞれ既存の
  // generateFloor経由の挙動のまま)
  if (dungeonRegionIndex !== undefined && bossSpeciesId) {
    const floor = enterBossFloor(depth, bossSpeciesId, ctx);
    updateVisibility(floor, ctx.player.pos, ctx.visionExtraRange);
    return {
      floor,
      mosaicRegions: [...ctx.mosaicRegions],
      previousGimmick: ctx.previousGimmick,
      shopSeenThisRun: ctx.shopSeenThisRun,
    };
  }

  // 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 第八地方
  // ダンジョンの各階は、第二〜第七地方の固有ギミックのうち1〜2種類を
  // ランダムに選んで、そのフロアだけに適用する
  const mosaicRegions =
    dungeonRegionIndex === 8 ? ctx.rng.shuffled(MOSAIC_CANDIDATE_REGIONS).slice(0, ctx.rng.int(1, 2)) : [];
  const gimmick = bossSpeciesId
    ? undefined
    : pickFloorGimmick(
        ctx.rng,
        depth,
        ctx.previousGimmick,
        GIMMICK_CHANCE_MULTIPLIER[ctx.difficulty] * (ctx.mood.floorGimmickRateMul ?? 1),
        dungeonRegionIndex,
        isCheckpointFloor(ctx.dungeonId, depth),
      );
  const floor = generateFloor(ctx.rng, {
    depth,
    gimmick,
    monsterHouseChanceMultiplier: bossSpeciesId
      ? 0
      : MONSTER_HOUSE_CHANCE_MULTIPLIER[ctx.difficulty] *
        (ctx.dungeonMonsterHouseRateMul ?? 1) *
        (ctx.mood.monsterHouseRateMul ?? 1) *
        // 第四地方(骨積みの回廊)固有ギミック(plan/bonepile-corridor.md): モンスターハウスが
        // 出やすい。骨積みの回廊ダンジョン自身の分はDungeonDef.monsterHouseRateMul
        // (dungeons.tsでregions.tsのデータをそのまま流用)で既にかかっているため、
        // ここでは第八地方のモザイク抽選で骨積みの回廊が選ばれた場合だけ追加で掛ける
        (mosaicRegions.includes(BONEPILE_REGION.index) ? (BONEPILE_REGION.monsterHouseRateMul ?? 1) : 1),
    shopChanceMultiplier: bossSpeciesId ? 0 : (ctx.dungeonShopRateMul ?? 1) * (ctx.mood.shopRateMul ?? 1),
    forceShop:
      !bossSpeciesId && ctx.dungeonShopRateMul !== undefined && depth === ctx.maxDepth && !ctx.shopSeenThisRun,
  });
  const start = choosePlayerStart(ctx.rng, floor);
  ctx.player.pos = start;
  floor.actors.push(ctx.player);
  const shopSeenThisRun = ctx.shopSeenThisRun || floor.rooms.some((r) => r.kind === "shop");
  const boostedItemDefId = hasEquipEffect(ctx.player.inventory, "dustLureBoost") ? "hokoraDust" : undefined;
  const shiningChanceMultiplier =
    (ctx.trueAwakeningCleared
      ? TRUE_AWAKENING_SHINING_MULTIPLIER
      : ctx.compendiumComplete
        ? COMPENDIUM_COMPLETE_SHINING_MULTIPLIER
        : 1) *
    SHINING_CHANCE_DIFFICULTY_MULTIPLIER[ctx.difficulty] *
    (ctx.mood.rareSpawnRateMul ?? 1);
  populateFloor(ctx.rng, floor, ctx.ids, start, {
    boostedItemDefId,
    shopWary: ctx.shopWary,
    shiningChanceMultiplier,
    monsterAtkMultiplier: MONSTER_ATK_MULTIPLIER[ctx.difficulty] * (ctx.mood.monsterAtkMulAfterAware ?? 1),
    goldRewardMultiplier: GOLD_REWARD_MULTIPLIER[ctx.difficulty] * (ctx.mood.goldRateMul ?? 1),
    speciesDepthOffset: ctx.dungeonFloorOffset ?? 0,
    bossSpeciesId,
    checkpointFloor: isCheckpointFloor(ctx.dungeonId, depth),
    monsterCountMultiplier: ctx.dungeonMonsterCountMul ?? 1,
    // 夜ごとの夢のモンスター強化カーブ(plan/nightly-dream-scaling.md)
    statMultiplier: ctx.dungeonId === NIGHTLY_DREAM_ID ? nightlyDreamStatMultiplier(depth) : 1,
    // ヨリシロの気分(plan/yorishiro-moods.md)
    itemCountMultiplier: ctx.mood.dropRateMul ?? 1,
    thiefWeightMultiplier: ctx.mood.thiefRateMul ?? 1,
  });

  // 忘れ物蔵(plan/lost-and-found-vault.md): 地方ダンジョンの2階目にだけ、
  // 隠し通路の候補を1本配置する
  if (dungeonRegionIndex !== undefined && depth === 2) {
    placeSecretPassage(ctx.rng, floor, `region${dungeonRegionIndex}`);
  }

  // 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md): 特定の地方ダンジョンの
  // 特定階にだけ、低確率で入り口を生成する
  const branchSpec = branchDungeonSpecFor(ctx.dungeonId, depth);
  if (branchSpec && ctx.rng.chance(branchSpec.chance)) {
    const pos = findFreeTile(ctx.rng, floor, { roomsOnly: true, avoid: [start] });
    if (pos) floor.branchEntrance = { pos, dungeonId: branchSpec.branchDungeonId };
  }

  // 地方固有の地形ギミック(plan/wetland-quagmire.md 等): 自分の地方ダンジョンか、
  // 第八地方のモザイク抽選(plan/dream-garden-mosaic.md)でその地方番号が選ばれていれば、
  // REGION_GIMMICK_PLACERS に登録された地方ごとの配置フックを呼ぶ
  if (dungeonRegionIndex !== undefined) {
    for (const region of REGIONS) {
      const place = REGION_GIMMICK_PLACERS[region.index];
      if (place && (dungeonRegionIndex === region.index || mosaicRegions.includes(region.index))) {
        place(ctx.rng, floor, ctx.ids);
      }
    }
  }

  // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md): 骨積みの
  // 回廊(第四地方)最終階の階段部屋の出口に、瓦礫の崩落を固定配置する。
  // 既にdeepest>=30(章立て上の第三章)まで進んだあとの「戻り」のダイブ
  // でだけ発生させる(初回プレイヤーがこの階で足止めされないように)
  if (isChapter3CollapseFloor(ctx.dungeonId, depth) && storyChapter(ctx.defeatedRegionBossCountAtStart, false) >= 3) {
    placeChapter3CollapseObstacle(floor);
  }

  // 仲間は階段について来る。プレイヤーの周りの空いたマスに並べる
  placeAlliesNear(floor, ctx.allies, start, ctx.rng);

  updateVisibility(floor, ctx.player.pos, ctx.visionExtraRange);

  return { floor, mosaicRegions, previousGimmick: gimmick, shopSeenThisRun };
}

/**
 * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入っているあいだ、
 * 元いた地方ダンジョン側の状態を退避しておく入れ物。返ってきたときに
 * そのまま復元する(プレイヤー・仲間・所持品・ターン数などダイブ全体に
 * かかる状態はいじらず、「どのダンジョンの何階を今表示しているか」だけを
 * 一時的に差し替える)
 */
export interface HostDungeonContext {
  dungeon: DungeonDef;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  previousGimmick?: FloorGimmickKind;
  mosaicRegions: number[];
  monsterHouseWarned: boolean;
  shopSeenThisRun: boolean;
}

export interface BeginBranchDungeonArgs {
  branchDungeonId: string;
  alreadyInBranch: boolean;
  dungeon: DungeonDef;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  previousGimmick: FloorGimmickKind | undefined;
  mosaicRegions: number[];
  monsterHouseWarned: boolean;
  shopSeenThisRun: boolean;
}

export interface BeginBranchDungeonResult {
  hostContext: HostDungeonContext;
  dungeon: DungeonDef;
  maxDepth: number;
  previousGimmick: undefined;
  mosaicRegions: number[];
  shopSeenThisRun: false;
}

/**
 * 横穴(分岐ダンジョン)に入る。今いる地方ダンジョンの状態(ダンジョン・
 * 最大階数・現在階・フロア)を退避し、切り替え先のダンジョン情報を返す。
 * 実際にその1階目を生成するのはGame側(enterFloor(1)の呼び出し)に任せる
 */
export function beginBranchDungeon(args: BeginBranchDungeonArgs): BeginBranchDungeonResult | null {
  if (args.alreadyInBranch) return null; // 横穴の中からさらに横穴には入れない(入れ子なし)
  const hostContext: HostDungeonContext = {
    dungeon: args.dungeon,
    maxDepth: args.maxDepth,
    depth: args.depth,
    floor: args.floor,
    previousGimmick: args.previousGimmick,
    mosaicRegions: args.mosaicRegions,
    monsterHouseWarned: args.monsterHouseWarned,
    shopSeenThisRun: args.shopSeenThisRun,
  };
  const dungeon = dungeonById(args.branchDungeonId);
  return {
    hostContext,
    dungeon,
    maxDepth: dungeon.maxDepth ?? Number.POSITIVE_INFINITY,
    previousGimmick: undefined,
    // 横穴自体はshopRateMul未設定でforceShop抽選の対象外だが、万一の出店
    // 出現がホスト側のshopSeenThisRunを誤って上書きしないよう、横穴の中では
    // 一旦falseから始める(戻るときにホスト側の値を必ず復元する)
    mosaicRegions: [],
    shopSeenThisRun: false,
  };
}

export interface EndBranchDungeonArgs {
  hostContext: HostDungeonContext;
  player: PlayerState;
  visionExtraRange: number;
  events: GameEvent[];
}

export interface EndBranchDungeonResult {
  dungeon: DungeonDef;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  previousGimmick: FloorGimmickKind | undefined;
  mosaicRegions: number[];
  monsterHouseWarned: boolean;
  shopSeenThisRun: boolean;
}

/**
 * 横穴(分岐ダンジョン)を踏破したときに呼ぶ。退避しておいた元の地方
 * ダンジョンの状態(その階の盤面そのもの、途中で倒した敵・拾った物も
 * 含めて)をそのまま復元する。ダイブ自体は終わらない(status="playing"
 * のまま)ため、main.ts側の全滅・踏破の記録処理は一切通らない
 */
export function endBranchDungeon(args: EndBranchDungeonArgs): EndBranchDungeonResult {
  const { hostContext, player, visionExtraRange, events } = args;
  const floor = hostContext.floor;
  // 入ってきた入り口のマスへ戻す。横穴は1階につき一度きりなので、
  // 戻ったら入り口自体は消す
  if (floor.branchEntrance) player.pos = { ...floor.branchEntrance.pos };
  floor.branchEntrance = undefined;
  updateVisibility(floor, player.pos, visionExtraRange);
  events.push({ type: "message", text: `${hostContext.dungeon.name}へ戻ってきた。` });
  return {
    dungeon: hostContext.dungeon,
    maxDepth: hostContext.maxDepth,
    depth: hostContext.depth,
    floor,
    previousGimmick: hostContext.previousGimmick,
    mosaicRegions: hostContext.mosaicRegions,
    monsterHouseWarned: hostContext.monsterHouseWarned,
    shopSeenThisRun: hostContext.shopSeenThisRun,
  };
}

/**
 * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)の入り口に立って
 * 確定したときに呼ぶ。入り口のマスに立っていなければnull
 */
export function findBranchEntranceDungeonId(floor: FloorState, playerPos: Vec2): string | null {
  const entrance = floor.branchEntrance;
  if (!entrance || !eq(playerPos, entrance.pos)) return null;
  return entrance.dungeonId;
}
