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
