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
    /** 山の芯(plan/mountain-core.md)。指定した地方ボスのspeciesIdを撃破済みなら解放 */
    | { afterBossDefeated: string };
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

import { REGION_BOSS_ORDER } from "./regions";

export const MAIN_CAVE_ID = "mainCave";
/**
 * 表の寝穴の最大階数(plan/region-expansion.md)。8地方 × 6階 = 48階。
 * design/regions.mdの8地方構成に合わせて10→48へ拡張した。
 */
export const MAIN_CAVE_MAX_DEPTH = 48;
/** 1地方あたりの階数(plan/region-expansion.md)。地方境界は depth % REGION_SIZE === 0 */
export const REGION_SIZE = 6;
/**
 * 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md)。
 * 骨積みの回廊(第四地方)最終階=24階
 */
export const CHAPTER3_COLLAPSE_DEPTH = REGION_SIZE * 4;
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

export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: MAIN_CAVE_ID,
    name: "表の寝穴",
    description: "最初から解放済みのメインダンジョン。",
    maxDepth: MAIN_CAVE_MAX_DEPTH,
    unlock: "always",
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
    unlock: { minDeepest: MAIN_CAVE_MAX_DEPTH },
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
    // 出現モンスタープールは第八地方(めざめの前庭・43〜48階)と同じものを
    // 流用し、floorOffsetで難度だけ底上げする(近道屋の裏穴と同じ仕組み)。
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
 * 表の寝穴の最大深さ(MAIN_CAVE_MAX_DEPTH)を1周(12階=地方2つぶん)超える
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
 * (depth - MAIN_CAVE_MAX_DEPTH - 1 を12で割った切り捨てが周回数になる)
 */
export function nightlyDreamStatMultiplier(depth: number): number {
  if (depth <= MAIN_CAVE_MAX_DEPTH) return 1;
  const laps = Math.floor((depth - MAIN_CAVE_MAX_DEPTH - 1) / NIGHTLY_DREAM_OVERFLOW_LAP);
  return 1 + laps * NIGHTLY_DREAM_LAP_MULTIPLIER;
}

export function isDungeonUnlocked(
  dungeon: DungeonDef,
  deepest: number,
  villageStage: number,
  foundPassageCount = 0,
  /** 山の芯(plan/mountain-core.md)。撃破済みの地方ボスspeciesId一覧 */
  defeatedRegionBosses: readonly string[] = [],
): boolean {
  if (dungeon.unlock === "always") return true;
  if ("minDeepest" in dungeon.unlock) return deepest >= dungeon.unlock.minDeepest;
  if ("minVillageStage" in dungeon.unlock) return villageStage >= dungeon.unlock.minVillageStage;
  if ("afterBossDefeated" in dungeon.unlock) return defeatedRegionBosses.includes(dungeon.unlock.afterBossDefeated);
  return foundPassageCount >= 8;
}
