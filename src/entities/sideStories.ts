/**
 * NPCサイドストーリー 第1弾(plan/side-stories-part1.md)。
 * モグラ婆・ゲンドは絆段階(+一部は追加条件)で段が進む静的なカタログ。
 * 目覚めたおたまは絆と無関係に「会うたびに」進むため、別枠(OTAMA_VISIT_STORY)
 * で扱う。判定ロジック(SaveDataを見る部分)はsave.tsに置き、ここはデータのみ
 * (achievements.tsと同じ、循環importを避ける切り分け)
 */
import type { BondStage } from "./companionBond";
import type { VillageNpcId } from "./village";

export interface SideStoryStage {
  minBondStage: BondStage;
  /** 絆段階に加えて必要な最深到達記録。省略時は絆段階のみが条件 */
  minDeepest?: number;
  /** ゲンドの最終段専用: 全部storageにあることが必要な素材defId(消費される) */
  requiredMaterialDefIds?: readonly string[];
  text: string;
  /** この段で新たに譲り受ける専用武器のdefId(あれば) */
  rewardItemDefId?: string;
}

export interface SideStoryDef {
  npcId: VillageNpcId;
  title: string;
  /** 段の配列。絆段階の厳しさの昇順で並べること(現在満たす最後の段を採用する) */
  stages: readonly SideStoryStage[];
}

export const SIDE_STORIES: readonly SideStoryDef[] = [
  {
    npcId: "mogurababa",
    title: "若い頃の樽守り",
    stages: [
      {
        minBondStage: "familiar",
        text: "モグラ婆「わたしも若い頃は、樽を抱えて潜っていたんだよ。今のお前さんみたいにね」",
      },
      {
        minBondStage: "close",
        minDeepest: 12,
        text: "モグラ婆「一度、深いところで相棒を失いかけたことがあってね……戻ってこられたのは、運が良かっただけさ」",
      },
      {
        minBondStage: "irreplaceable",
        minDeepest: 18,
        text: "モグラ婆「これを持っていきな。わたしの、なたの形見だ。もうわたしには、振るう手が要らないからね」",
        rewardItemDefId: "mogurababaKeepsakeHatchet",
      },
    ],
  },
  {
    npcId: "gendo",
    title: "まぼろしの一振り",
    stages: [
      {
        minBondStage: "familiar",
        text: "ゲンド「昔、一度だけ会心の一振りを打てたことがあってな。あれを超える一振りは、まだ打てちゃいない」",
      },
      {
        minBondStage: "close",
        text: "ゲンド「あの一振りを再現するには、ほこら粉と、とっておきの刻印石が要る。持ってきてくれるか」",
      },
      {
        minBondStage: "irreplaceable",
        requiredMaterialDefIds: ["hokoraDust", "markStoneGajiri"],
        text: "ゲンド「……よし、揃った。打ってやる、まぼろしの一振りを」",
        rewardItemDefId: "gendoPhantomBillhook",
      },
    ],
  },
];

export function sideStoryFor(npcId: VillageNpcId): SideStoryDef | undefined {
  return SIDE_STORIES.find((s) => s.npcId === npcId);
}

/**
 * 目覚めたおたま「思い出のかけら」(全4段)。絆とは独立に、会うたびに1つずつ
 * 記憶を解放する(design/side-stories.md)。段4だけ物語の章立て(第三章の間)
 * を追加条件にする
 */
export const OTAMA_VISIT_STORY: readonly { requiresStoryChapter3?: boolean; text: string }[] = [
  { text: "おたま「……眠っていた間、ずっと同じ夢を見ていた気がするの」" },
  { text: "おたま「誰かに、名前を呼ばれていた……そんな気がする」" },
  { text: "おたま「そうだ……あの人たち、何かを掘り返そうとしていた。うっすらとだけど、覚えてる」" },
  {
    requiresStoryChapter3: true,
    text: "おたま「近道屋が本当に探していたのは、宝でも金でもない……もっと、山そのものみたいな何かだった気がする」",
  },
];
