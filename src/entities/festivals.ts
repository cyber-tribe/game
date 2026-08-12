/**
 * 宵祭り(よいまつり、plan/yoimatsuri-festival.md)。月に一度、ネンネ村が
 * 提灯を灯して「ヨリシロが今夜も穏やかに眠っている」ことを祝う祭り。
 * 戦闘・報酬・ダンジョン生成には一切影響しない、雰囲気を楽しむための日
 * (design/balance-philosophy.mdのパワーバジェット方針どおり)。
 * 新規のセーブフィールドは不要(plan/yorishiro-moods.mdと同じ設計方針で、
 * isYoimatsuri(todayKey())をその場で評価するだけ)
 */

/** 日付キー(YYYY-MM-DD)の下1桁が0の日を宵祭りの日とする(10日に1回程度) */
export function isYoimatsuri(dateKey: string): boolean {
  return dateKey.endsWith("0");
}

/** 宵祭りの出店(design/village-festivals.mdの「限定品ぞろえ」)。品揃え・価格は固定 */
export interface FestivalShopOffer {
  defId: string;
  price: number;
}

export const FESTIVAL_SHOP_OFFERS: readonly FestivalShopOffer[] = [
  { defId: "hokoraDust", price: 60 },
  { defId: "markStoneGajiri", price: 120 },
  { defId: "markStoneTsubute", price: 120 },
];

/** 宵祭りの日だけ、各NPCの通常会話(役職の一言)を差し替える専用の一言。絆の進行には影響しないフレーバーのみ */
export const YOIMATSURI_NPC_LINES: Readonly<Record<string, string>> = {
  mogurababa: "モグラ婆「今夜は宵祭りだね。提灯の灯りが、いつもより山を優しく見せる」",
  gendo: "ゲンド「宵祭りの夜は、樽づくりの手も少しゆるむってもんだ」",
  otone: "オトネ「今夜くらいは、村のみんなでゆっくりするといい」",
  okiyo: "おキヨ「宵祭りの灯りに照らされた夢のかけらは、また違って見えるんだよ」",
  pochi: "ポチ「今日は宵祭りだ! 提灯、見に行こうよ!」",
  otama: "おたま「灯りがきれい……なんだか、ずっと前にも見た気がする」",
};
