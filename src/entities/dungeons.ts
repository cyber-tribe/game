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
    | { allPassagesFound: true };
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

import { REGION_BOSS_ORDER } from "./species";

export const MAIN_CAVE_ID = "mainCave";
/**
 * 表の寝穴の最大階数(plan/region-expansion.md)。8地方 × 6階 = 48階。
 * design/regions.mdの8地方構成に合わせて10→48へ拡張した。
 */
export const MAIN_CAVE_MAX_DEPTH = 48;
/** 1地方あたりの階数(plan/region-expansion.md)。地方境界は depth % REGION_SIZE === 0 */
export const REGION_SIZE = 6;
export const NIGHTLY_DREAM_ID = "nightlyDream";
/** 腕試しの間(plan/hidden-dungeon.md)。地方ボスの再戦だけで構成するボスラッシュ */
export const TRIAL_CHAMBER_ID = "trialChamber";
/** 忘れ物蔵(plan/lost-and-found-vault.md)。8地方の隠し通路をすべて見つけると解放される */
export const LOST_AND_FOUND_VAULT_ID = "lostAndFoundVault";

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
): boolean {
  if (dungeon.unlock === "always") return true;
  if ("minDeepest" in dungeon.unlock) return deepest >= dungeon.unlock.minDeepest;
  if ("minVillageStage" in dungeon.unlock) return villageStage >= dungeon.unlock.minVillageStage;
  return foundPassageCount >= 8;
}
