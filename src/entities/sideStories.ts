/**
 * NPCサイドストーリー 第1弾(plan/side-stories-part1.md)・第2弾(plan/
 * side-stories-part2.md)。モグラ婆・ゲンド・オトネ・おキヨ・ポチは絆段階
 * (+一部は追加条件)で段が進む静的なカタログ。目覚めたおたまは絆と無関係に
 * 「会うたびに」進むため、別枠(OTAMA_VISIT_STORY)で扱う。判定ロジック
 * (SaveDataを見る部分)はsave.tsに置き、ここはデータのみ(achievements.ts
 * と同じ、循環importを避ける切り分け)
 */
import type { BondStage } from "./companionBond";
import type { VillageNpcId } from "./village";

export interface SideStoryStage {
  minBondStage: BondStage;
  /** 絆段階に加えて必要な最深到達記録。省略時は絆段階のみが条件 */
  minDeepest?: number;
  /** オトネ第2段専用: 依頼板の累計達成件数(completedQuestIds.length) */
  minCompletedQuests?: number;
  /** オトネ第3段・ポチ第3段専用: 村の発展段階 */
  minVillageStage?: number;
  /** おキヨ第2段専用: 図鑑を半分以上「捕まえた」で埋めていること */
  requiresCompendiumHalf?: boolean;
  /** おキヨ第3段専用: 図鑑コンプリート(isCompendiumComplete)していること */
  requiresCompendiumComplete?: boolean;
  /** ポチ第2段専用: 到達済みの章立て(storyChapter)の下限 */
  minStoryChapter?: number;
  /** ポチ第4段専用: 物語クリア(SaveData.storyCleared)していること */
  requiresStoryCleared?: boolean;
  /** ゲンドの最終段専用: 全部storageにあることが必要な素材defId(消費される) */
  requiredMaterialDefIds?: readonly string[];
  text: string;
  /** この段で新たに譲り受ける専用武器・道具のdefId(あれば) */
  rewardItemDefId?: string;
  /** ポチ第4段専用: この段で新たに解放される衣装id(あれば) */
  rewardCostumeId?: string;
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
  {
    npcId: "otone",
    title: "若い衆に譲れなかったもの",
    stages: [
      {
        minBondStage: "familiar",
        text: "オトネ「本当はもっと早く、顔役なんて退くつもりだったんだけどねえ」",
      },
      {
        minBondStage: "close",
        minCompletedQuests: 10,
        text: "オトネ「以前、顔役を継がせようとした若いのがいてね……近道屋の噂を怖がって、村を出て行っちまった。それきり、次の担い手を探せずにいるのさ」",
      },
      {
        minBondStage: "irreplaceable",
        minVillageStage: 3,
        text: "オトネ「……お前さんならって思ったこともあったんだけどね。でも今のお前は、樽守りの方が向いてるよ」",
        rewardItemDefId: "otoneMemoBook",
      },
    ],
  },
  {
    npcId: "okiyo",
    title: "見失った尾っぽ",
    stages: [
      {
        minBondStage: "familiar",
        text: "おキヨ「昔、旅先で一度だけ見た夢のかけらがいてねえ。あれだけは、とうとう記録できなかった」",
      },
      {
        minBondStage: "close",
        requiresCompendiumHalf: true,
        text: "おキヨ「あの子には、名前すらつけてやれなかった。それを探して各地を回った末に、ここネンネ村へ流れ着いたんだよ」",
      },
      {
        minBondStage: "irreplaceable",
        requiresCompendiumComplete: true,
        text: "おキヨ「……これで、あの子もどこかに載っているはずだ。よかった」",
        rewardItemDefId: "okiyoSketchMap",
      },
    ],
  },
  {
    npcId: "pochi",
    title: "見習いの見習い",
    stages: [
      {
        minBondStage: "familiar",
        text: "ポチ「おれもいつか、樽守りになりたいんだ!」",
      },
      {
        minBondStage: "close",
        minStoryChapter: 2,
        text: "ポチ「見て見て、ガルドの真似!」――空のタルを抱えて洞窟の入り口をうろつくポチを、危ないからと窘める。",
      },
      {
        minBondStage: "close",
        minVillageStage: 2,
        text: "ポチ「オトネさんに、お使いを任されたんだ!」――少し誇らしげな顔で報告してくる。",
      },
      {
        minBondStage: "irreplaceable",
        requiresStoryCleared: true,
        text: "ポチ「今度は俺が、見習いになる番だ」――少し背が伸びたポチが、まっすぐな顔でそう宣言した。",
        rewardCostumeId: "pochiHandMeDownHappi",
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
