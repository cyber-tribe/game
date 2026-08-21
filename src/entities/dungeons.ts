/**
 * 複数のダンジョン(plan/multiple-dungeons.md)。
 * どの寝穴から潜るかで、地形生成のパラメータ・出現テーブルだけが変わる
 * (アルゴリズム自体は共通)。
 */
export interface DungeonDef {
  id: string;
  name: string;
  description: string;
  /** 省略時は無限に潜れる(夜ごとの夢用) */
  maxDepth?: number;
  /**
   * 拠点で選べるようになる条件。本文書は章クリアで解放する案だが、
   * 章立て(design/story.md)自体が未実装のため、代わりに既存の
   * 最深到達記録(SaveData.deepest)を進行度の代替指標として使う。
   * 腕試しの間(plan/hidden-dungeon.md)は、本文どおり村の発展段階を条件にする
   */
  unlock:
    | "always"
    | { minDeepest: number }
    | { minVillageStage: number }
    | { allPassagesFound: true }
    /** 指定した地方ボスのspeciesIdを撃破済みなら解放。地方ダンジョン同士の連鎖・山の芯で使う */
    | { afterBossDefeated: string }
    /** 夜ごとの夢(plan/game/dungeon-per-region.md)。8地方すべてのボスを撃破済みなら解放 */
    | { allRegionBossesDefeated: true }
    /** 指定したダンジョンidを踏破済みなら解放(plan/game/tutorial-dungeon.md。ひなたの寝穴→第一地方) */
    | { afterDungeonCleared: string };
  /** 出現モンスター・アイテムの抽選テーブルに足す深さのずれ */
  floorOffset?: number;
  /** モンスターハウス出現率に掛ける倍率 */
  monsterHouseRateMul?: number;
  /** 近道屋の出店の出現率に掛ける倍率。指定した場合、ダンジョンの
   * 最終階に到達するまでに一度も出店が出ていなければ、最終階で必ず出す */
  shopRateMul?: number;
  /** 忘れ物蔵(plan/lost-and-found-vault.md)。野生モンスターの湧き数に掛ける倍率 */
  monsterCountMul?: number;
  /** 忘れ物蔵(plan/lost-and-found-vault.md)。満腹度の減りに掛ける倍率 */
  satietyDrainMul?: number;
}

import { REGIONS, REGION_BOSS_ORDER } from "./regions";

/**
 * 地方ごとの独立ダンジョン(plan/game/dungeon-per-region.md)。
 * かつての「表の寝穴」(単一の連続48階、MAIN_CAVE_ID)を、地方ごとに
 * 入口の異なる8つのダンジョンへ分割した。1つ=1地方=6階、地方k+1は
 * 地方kのボス撃破で解放される連鎖(unlock: afterBossDefeated)。
 * 生成テーブルは旧来どおりfloorOffsetで選ぶため、地方ごとの出現内容・
 * ギミックは分割前と変わらない(REGIONS/regions.tsのデータをそのまま流用)。
 * 階数の最終値(合計60階案)・横穴(分岐ダンジョン)は未決事項として
 * plan/game/dungeon-per-region.mdに残したまま、この段階では旧来の
 * 均等6階構成を保っている
 */
export const REGION_DUNGEON_IDS = [
  "dozingApproach",
  "forgottenTideMarsh",
  "drowsingMushroomForest",
  "bonepileCorridor",
  "teardropFalls",
  "echoRidge",
  "forgottenFestivalRuins",
  "awakeningForecourt",
] as const;

/** 地方ごとの簡単な説明文(design/regions.mdの各地方の書き出しから引いた) */
const REGION_DESCRIPTIONS: readonly string[] = [
  "斜面もゆるい、素朴な洞窟。チュートリアルを兼ねる。",
  "足場がぬかるみ、霧で視界が縮む湿地帯。",
  "きのこがひしめく、胞子まみれの森。",
  "古い記憶が積み重なった、狭く入り組んだ回廊。",
  "地下水が幾筋もの滝になって流れ落ちる、湿った岩窟。",
  "ヨリシロの夢の中でも外気に近い、吹きさらしの尾根。物音がよく響く。",
  "かつての賑わいの記憶が朽ちた、寂れた祭り会場のような一角。",
  "ヨリシロの意識の錨に最も近く、これまでの地方の記憶が入り乱れる。",
];

export function isRegionDungeonId(id: string): boolean {
  return (REGION_DUNGEON_IDS as readonly string[]).includes(id);
}

/** 地方ダンジョンidから地方番号(1始まり)を引く。地方ダンジョンでなければundefined */
export function regionIndexForDungeonId(id: string): number | undefined {
  const i = (REGION_DUNGEON_IDS as readonly string[]).indexOf(id);
  return i === -1 ? undefined : i + 1;
}

/**
 * 地方1〜8の合計階数。旧・表の寝穴(MAIN_CAVE_ID)の最大深さと同じ値を、
 * 夜ごとの夢の周回判定(nightlyDreamStatMultiplier)・山の芯/はじめの夢の
 * floorOffset(第八地方相当のテーブルを流用)のために定数として残している
 */
export const TOTAL_REGION_FLOORS = 48;
/** 1地方あたりの階数 */
export const REGION_SIZE = 6;
/**
 * 地方ダンジョンのめざめの階段の階(plan/game/dungeon-per-region.md)。
 * 各ダンジョンの中間(階数の半分)に1つだけ置き、「区切って持ち帰る」専用とする
 */
export const REGION_CHECKPOINT_FLOOR = Math.ceil(REGION_SIZE / 2);

/**
 * その階がめざめの階段の階か(plan/game/no-pitfall-on-checkpoint-floors.md)。
 * 地方ダンジョンでは中間階(REGION_CHECKPOINT_FLOOR)だけ。地方の概念を
 * 持たない他のダンジョンは全階が該当する。既知チェックポイントの記録・
 * 階段の3択モーダル・落とし穴の生成除外が、みなこの1箇所の判定を共有する
 */
export function isCheckpointFloor(dungeonId: string, depth: number): boolean {
  if (isRegionDungeonId(dungeonId)) return depth === REGION_CHECKPOINT_FLOOR;
  // ひなたの寝穴(plan/game/tutorial-dungeon.md): 最終階(3階)だけがめざめの階段の階。
  // 1階では「区切り」をまだ教えない、という本文の狙いどおり
  if (dungeonId === HINATA_ID) return depth === HINATA_MAX_DEPTH;
  // 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md): 短い往復専用で、
  // 区切って持ち帰る対象ではない(踏破すると必ず元の地方ダンジョンの階へ戻る)
  if (isBranchDungeonId(dungeonId)) return false;
  return true;
}

/** 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md)の対象地方番号(骨積みの回廊=第四地方) */
export const CHAPTER3_COLLAPSE_REGION_INDEX = 4;

/**
 * 第三章「仲間探し」の崩落イベントの階か。骨積みの回廊(第四地方)ダンジョンの
 * 最終階(=ボスの間でもある)にだけ発生する
 */
export function isChapter3CollapseFloor(dungeonId: string, depth: number): boolean {
  return regionIndexForDungeonId(dungeonId) === CHAPTER3_COLLAPSE_REGION_INDEX && depth === REGION_SIZE;
}

/**
 * チュートリアル専用ダンジョン「ひなたの寝穴」(plan/game/tutorial-dungeon.md)。
 * 新規セーブの初回出発でだけ自動的に潜る。踏破(3階のめざめの階段で
 * 「区切って持ち帰る」)が第一地方の解放条件になる
 */
export const HINATA_ID = "hinata";
export const HINATA_MAX_DEPTH = 3;

/**
 * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)。地方ダンジョンの
 * 特定階に低確率で入り口が生成され、入ると短い分岐ダンジョンへ移り、
 * 踏破すると元の地方ダンジョンの同じ階の同じ位置へ戻る。初期実装は2件
 */
export const MUDDY_DEPTHS_ID = "muddyDepths";
export const ECHO_NEST_ID = "echoNest";

export interface BranchDungeonSpec {
  /** 入り口が生成されうるダンジョンid(地方ダンジョン) */
  hostDungeonId: string;
  /** 入り口が生成されうる階 */
  hostDepth: number;
  branchDungeonId: string;
  /** その階に入るたびに入り口が生成される確率(低確率) */
  chance: number;
}

/**
 * 第二の湿地穴(忘れ潮の湿地)→「ぬかるみの底」、第六の尾根穴(こだまの尾根)
 * →「こだまの巣」。doc本文の「初期実装は2件でよい」どおりの2件のみ
 */
export const BRANCH_DUNGEONS: readonly BranchDungeonSpec[] = [
  { hostDungeonId: REGION_DUNGEON_IDS[1], hostDepth: 2, branchDungeonId: MUDDY_DEPTHS_ID, chance: 0.3 },
  { hostDungeonId: REGION_DUNGEON_IDS[5], hostDepth: 2, branchDungeonId: ECHO_NEST_ID, chance: 0.3 },
];

/** dungeonId・depthの組から、その階に入り口が生成されうる横穴の仕様を引く */
export function branchDungeonSpecFor(dungeonId: string, depth: number): BranchDungeonSpec | undefined {
  return BRANCH_DUNGEONS.find((b) => b.hostDungeonId === dungeonId && b.hostDepth === depth);
}

export function isBranchDungeonId(id: string): boolean {
  return id === MUDDY_DEPTHS_ID || id === ECHO_NEST_ID;
}

export const NIGHTLY_DREAM_ID = "nightlyDream";
/** 腕試しの間(plan/hidden-dungeon.md)。地方ボスの再戦だけで構成するボスラッシュ */
export const TRIAL_CHAMBER_ID = "trialChamber";
/** 忘れ物蔵(plan/lost-and-found-vault.md)。8地方の隠し通路をすべて見つけると解放される */
export const LOST_AND_FOUND_VAULT_ID = "lostAndFoundVault";
/** 山の芯(plan/mountain-core.md)。対近道屋の決着ダンジョン */
export const MOUNTAIN_CORE_ID = "mountainCore";
/**
 * 真の目覚め(隠し最終局面、plan/true-awakening.md)。
 * unlockはあえて"always"にしている(3条件のANDは`DungeonDef.unlock`の
 * 型に乗らないため)。isDungeonUnlockedの結果を町の一覧表示にそのまま
 * 使うと常時解放扱いになってしまうので、src/ui/town.tsではこのIDを
 * 通常の一覧から明示的に除外し、専用の`isTrueAwakeningUnlocked(save)`
 * (src/save.ts)で解放判定してから別枠で表示する
 */
export const TRUE_AWAKENING_ID = "trueAwakening";
/**
 * 樽比べ(plan/tarukurabe-minigame.md)。村はずれの的当てミニゲーム。
 * unlockはtrueAwakeningと同じ理由で"always"にしている。日付ベースの
 * 開催判定(isTarukurabeDay、src/entities/festivals.ts)は`DungeonDef.unlock`
 * の型に乗らないため、src/ui/town.tsが通常の一覧から明示的に除外し、
 * 開催日にだけ末尾に追加する
 */
export const TARUKURABE_ID = "tarukurabe";

const REGION_DUNGEONS: readonly DungeonDef[] = REGIONS.map((region, i) => ({
  id: REGION_DUNGEON_IDS[i]!,
  name: region.name,
  description: REGION_DESCRIPTIONS[i] ?? "",
  maxDepth: REGION_SIZE,
  unlock: i === 0 ? { afterDungeonCleared: HINATA_ID } : { afterBossDefeated: REGIONS[i - 1]!.bossSpeciesId },
  floorOffset: i * REGION_SIZE,
  monsterHouseRateMul: region.monsterHouseRateMul,
}));

export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: HINATA_ID,
    name: "ひなたの寝穴",
    description: "地表のすぐ下、うたたねの浅い眠り。外の光が差し込む、明るく見通しのよい修練場。",
    maxDepth: HINATA_MAX_DEPTH,
    unlock: "always",
  },
  ...REGION_DUNGEONS,
  {
    id: MUDDY_DEPTHS_ID,
    name: "ぬかるみの底",
    description: "忘れ潮の湿地の底に潜む、水系素材の宝庫。横穴からだけ入れる。",
    maxDepth: 2,
    unlock: "always",
    // 忘れ潮の湿地(第二地方)と同じ出現テーブルを流用する
    floorOffset: REGION_SIZE * 1,
    monsterCountMul: 0.5,
  },
  {
    id: ECHO_NEST_ID,
    name: "こだまの巣",
    description: "こだまの尾根に隠れた、やまびこ系種族の巣。横穴からだけ入れる。",
    maxDepth: 3,
    unlock: "always",
    // こだまの尾根(第六地方)と同じ出現テーブルを流用する
    floorOffset: REGION_SIZE * 5,
    monsterCountMul: 1.5,
  },
  {
    id: "shortcutBackHole",
    name: "近道屋の裏穴",
    description: "近道屋が無理やり掘った、短く手荒なダンジョン。出店が必ず1つは出る。",
    maxDepth: 5,
    unlock: { minDeepest: 3 },
    floorOffset: 2,
    monsterHouseRateMul: 1.5,
    shopRateMul: 3,
  },
  {
    id: NIGHTLY_DREAM_ID,
    name: "夜ごとの夢",
    description: "終わりのないダンジョン。潜れるだけ潜って自己ベストを更新する。",
    unlock: { allRegionBossesDefeated: true },
  },
  {
    id: TRIAL_CHAMBER_ID,
    name: "腕試しの間",
    description: "地方ボスの再戦だけで構成する、休憩を挟みつつ連続で相手取るボスラッシュ。",
    maxDepth: REGION_BOSS_ORDER.length,
    unlock: { minVillageStage: 4 },
  },
  {
    id: LOST_AND_FOUND_VAULT_ID,
    name: "忘れ物蔵",
    description: "誰の記憶とも紐づかない半端な品々が眠る、小さな蔵。",
    maxDepth: 5,
    unlock: { allPassagesFound: true },
    monsterCountMul: 0.5,
    satietyDrainMul: 1.5,
  },
  {
    id: MOUNTAIN_CORE_ID,
    name: "山の芯",
    description: "ヨリシロの意識の核に近い、特別な夢。近道屋との決着の場。",
    maxDepth: 3,
    unlock: { afterBossDefeated: "horikuiNoNushi" },
    // 出現モンスタープールは第八地方(めざめの前庭)と同じものを流用し、
    // floorOffsetで難度だけ底上げする(近道屋の裏穴と同じ仕組み)。
    // 1〜3階 + 42 = 43〜45階ぶんのテーブルを引く
    floorOffset: 42,
  },
  {
    id: TRUE_AWAKENING_ID,
    name: "はじめの夢",
    description: "ヨリシロがいちばん最初に見た夢。誰もいない頃の記憶に触れる、隠された局面。",
    maxDepth: 3,
    unlock: "always",
    // 山の芯と同じく、第八地方相当のモンスターテーブルを流用する
    floorOffset: 42,
  },
  {
    id: TARUKURABE_ID,
    name: "樽比べ",
    description: "村はずれの的当て。タル10個で3つの的すべてに命中させ、自己ベストを縮める。",
    maxDepth: 1,
    unlock: "always",
  },
];

export function dungeonById(id: string): DungeonDef {
  const found = DUNGEONS.find((d) => d.id === id);
  if (!found) throw new Error(`unknown dungeon: ${id}`);
  return found;
}

/**
 * 夜ごとの夢のモンスター強化カーブ(plan/nightly-dream-scaling.md)。
 * 地方1〜8の合計階数(TOTAL_REGION_FLOORS)を1周(12階=地方2つぶん)超える
 * ごとに、モンスターのステータスに+15%ずつ乗数を掛ける。上限は設けない
 * (「潜れるだけ潜って自己ベストを更新する」無限モードの性質上、意図的に
 * 頭打ちにしない)。数値は初期案で、実測分布を見て調整する前提
 */
export const NIGHTLY_DREAM_OVERFLOW_LAP = 12;
export const NIGHTLY_DREAM_LAP_MULTIPLIER = 0.15;

/**
 * maxHp/atk/defの3値に共通で掛ける倍率を返す。expには掛けない
 * (design/balance-philosophy.mdのパワーバジェット方針――全滅時のロストが
 * 唯一のブレーキ――を、経験値効率まで強化すると崩してしまうため)。
 *
 * 49〜60階(1周目)はまだ倍率1.0の猶予とし、61階目から+15%が乗る
 * (depth - TOTAL_REGION_FLOORS - 1 を12で割った切り捨てが周回数になる)
 */
export function nightlyDreamStatMultiplier(depth: number): number {
  if (depth <= TOTAL_REGION_FLOORS) return 1;
  const laps = Math.floor((depth - TOTAL_REGION_FLOORS - 1) / NIGHTLY_DREAM_OVERFLOW_LAP);
  return 1 + laps * NIGHTLY_DREAM_LAP_MULTIPLIER;
}

export function isDungeonUnlocked(
  dungeon: DungeonDef,
  deepest: number,
  villageStage: number,
  foundPassageCount = 0,
  /** 撃破済みの地方ボスspeciesId一覧 */
  defeatedRegionBosses: readonly string[] = [],
  /** ひなたの寝穴(plan/game/tutorial-dungeon.md)を踏破済みか */
  hinataCleared = false,
): boolean {
  if (dungeon.unlock === "always") return true;
  if ("minDeepest" in dungeon.unlock) return deepest >= dungeon.unlock.minDeepest;
  if ("minVillageStage" in dungeon.unlock) return villageStage >= dungeon.unlock.minVillageStage;
  if ("afterBossDefeated" in dungeon.unlock) return defeatedRegionBosses.includes(dungeon.unlock.afterBossDefeated);
  if ("allRegionBossesDefeated" in dungeon.unlock) {
    return REGIONS.every((r) => defeatedRegionBosses.includes(r.bossSpeciesId));
  }
  if ("afterDungeonCleared" in dungeon.unlock) {
    return dungeon.unlock.afterDungeonCleared === HINATA_ID ? hinataCleared : false;
  }
  return foundPassageCount >= 8;
}
