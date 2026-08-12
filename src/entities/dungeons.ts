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
   */
  unlock: "always" | { minDeepest: number };
  /** 出現モンスター・アイテムの抽選テーブルに足す深さのずれ */
  floorOffset?: number;
  /** モンスターハウス出現率に掛ける倍率 */
  monsterHouseRateMul?: number;
  /** 近道屋の出店の出現率に掛ける倍率。指定した場合、ダンジョンの
   * 最終階に到達するまでに一度も出店が出ていなければ、最終階で必ず出す */
  shopRateMul?: number;
}

export const MAIN_CAVE_ID = "mainCave";
export const MAIN_CAVE_MAX_DEPTH = 10;
export const NIGHTLY_DREAM_ID = "nightlyDream";

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
];

export function dungeonById(id: string): DungeonDef {
  const found = DUNGEONS.find((d) => d.id === id);
  if (!found) throw new Error(`unknown dungeon: ${id}`);
  return found;
}

export function isDungeonUnlocked(dungeon: DungeonDef, deepest: number): boolean {
  return dungeon.unlock === "always" || deepest >= dungeon.unlock.minDeepest;
}
