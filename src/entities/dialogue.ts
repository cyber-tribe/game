/**
 * NPCのせりふプール(plan/flavor-and-dialogue.md)。絆段階(plan/archive/
 * village-life.md)・ヨリシロの気分(plan/yorishiro-moods.md)・宵祭り
 * (plan/yoimatsuri-festival.md)がそれぞれ独立に仕様化してきた3つの状態を、
 * 1つの分岐(context)に束ねる。判定ロジック(SaveDataを見る部分)は
 * ここに置く(achievements.tsと違い、既存の3つの状態を素直に参照するだけで
 * 循環importを起こさないため)
 */
import { bondStage } from "./companionBond";
import { isYoimatsuri } from "./festivals";
import { moodForDate } from "./moods";
import { todayKey } from "./quests";
import type { SaveData } from "../save";

export interface DialoguePool {
  npcId: string;
  context: "default" | "afterFestival" | "moodRestless" | "highBond";
  lines: readonly string[];
}

export function dialogueContext(save: SaveData, npcId: string): DialoguePool["context"] {
  if (bondStage(save.bonds[npcId] ?? 0) === "irreplaceable") return "highBond";
  if (moodForDate(todayKey()).id === "restless") return "moodRestless";
  if (isYoimatsuri(todayKey())) return "afterFestival";
  return "default";
}

export const DIALOGUE_POOLS: readonly DialoguePool[] = [
  // モグラ婆
  {
    npcId: "mogurababa",
    context: "default",
    lines: [
      "モグラ婆「ちゃんと満腹度は見てるかい? 空きっ腹で潜っても、いいことないよ」",
      "モグラ婆「倉庫は好きに使いな。溜め込みすぎても、使わなきゃ意味がないけどね」",
    ],
  },
  {
    npcId: "mogurababa",
    context: "moodRestless",
    lines: ["モグラ婆「今夜は妙に胸騒ぎがするね……無理はしなさんな」"],
  },
  {
    npcId: "mogurababa",
    context: "afterFestival",
    lines: ["モグラ婆「今夜は宵祭りだね。提灯の灯りが、いつもより山を優しく見せる」"],
  },
  {
    npcId: "mogurababa",
    context: "highBond",
    lines: ["モグラ婆「お前さんを見てると、なんだか若い頃の自分を思い出すよ」"],
  },
  // ゲンド
  {
    npcId: "gendo",
    context: "default",
    lines: [
      "ゲンド「刻印石があれば、印を刻んでやれる。集めてきな」",
      "ゲンド「+9まで鍛えりゃ、たいていの得物は「極めた」に届くはずだ」",
    ],
  },
  {
    npcId: "gendo",
    context: "moodRestless",
    lines: ["ゲンド「こう寝苦しい夜は、槌の音も心なしか大きく響くな」"],
  },
  {
    npcId: "gendo",
    context: "afterFestival",
    lines: ["ゲンド「宵祭りの夜は、樽づくりの手も少しゆるむってもんだ」"],
  },
  {
    npcId: "gendo",
    context: "highBond",
    lines: ["ゲンド「お前の得物なら、いつでも最優先で見てやるよ」"],
  },
  // オトネ
  {
    npcId: "otone",
    context: "default",
    lines: [
      "オトネ「依頼板は毎日入れ替わる。気になるものがあれば早めに受けときな」",
      "オトネ「村のことは任せておきな。お前さんはお前さんの仕事をしな」",
    ],
  },
  {
    npcId: "otone",
    context: "afterFestival",
    lines: ["オトネ「宵祭りの後片付けも、これはこれで悪くない仕事さ」"],
  },
  {
    npcId: "otone",
    context: "highBond",
    lines: ["オトネ「お前さんになら、この村を任せてもいいと、本気で思ってるよ」"],
  },
  // おキヨ
  {
    npcId: "okiyo",
    context: "default",
    lines: [
      "おキヨ「図鑑に載ってる子たちは、みんな一度はこの目で見たものばかりさ」",
      // 隠れた小ネタ「うろこ覚えのヒント」: 記録できなかった夢のかけらの、うろ覚えの特徴をそれとなく語る
      "おキヨ「そういえば、うろこみたいな模様の子を見た覚えがあるんだけど……どこで見たんだったか」",
    ],
  },
  {
    npcId: "okiyo",
    context: "moodRestless",
    lines: ["おキヨ「寝苦しい夜は、図鑑の整理でもして気を紛らわすのさ」"],
  },
  {
    npcId: "okiyo",
    context: "afterFestival",
    lines: ["おキヨ「宵祭りの灯りに照らされた夢のかけらは、また違って見えるんだよ」"],
  },
  {
    npcId: "okiyo",
    context: "highBond",
    lines: ["おキヨ「お前さんと話してると、忘れかけてた記憶が少しずつ戻ってくる気がするよ」"],
  },
  // ポチ
  {
    npcId: "pochi",
    context: "default",
    lines: [
      "ポチ「ガルド兄ちゃん、今日も潜るの?」",
      // 隠れた小ネタ「ぷるんを妙に怖がる」
      "ポチ「ぷるんって、なんかこう……ぷるぷるしてて、ちょっと苦手なんだよね」",
    ],
  },
  {
    npcId: "pochi",
    context: "afterFestival",
    lines: ["ポチ「今日は宵祭りだ! 提灯、見に行こうよ!」"],
  },
  {
    npcId: "pochi",
    context: "highBond",
    lines: ["ポチ「ガルド兄ちゃんみたいになりたいんだ! ずっと応援してる!」"],
  },
  // 目覚めたおたま
  {
    npcId: "otama",
    context: "default",
    lines: ["おたま「今日は、何も新しいことは思い出さなかったな……」"],
  },
  {
    npcId: "otama",
    context: "moodRestless",
    lines: ["おたま「今夜は、夢の続きが見られる気がする」"],
  },
  {
    npcId: "otama",
    context: "afterFestival",
    lines: ["おたま「灯りがきれい……なんだか、ずっと前にも見た気がする」"],
  },
  {
    npcId: "otama",
    context: "highBond",
    lines: ["おたま「あなたと話していると、眠っていたあいだの記憶が少しずつ形になっていく」"],
  },
];

export function dialoguePoolFor(npcId: string, context: DialoguePool["context"]): DialoguePool | undefined {
  return (
    DIALOGUE_POOLS.find((p) => p.npcId === npcId && p.context === context) ??
    DIALOGUE_POOLS.find((p) => p.npcId === npcId && p.context === "default")
  );
}
