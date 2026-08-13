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

/**
 * 樽比べ(plan/tarukurabe-minigame.md)。design/village-festivals.mdの
 * 「不定期(週1回相当)」を、曜日ベースで確定する。dateKey(YYYY-MM-DD)を
 * そのままDateにして曜日を求め、日曜日固定にした(宵祭りと同じく、実際の
 * 頻度調整は実装後の体感に委ねる未決事項として残す)
 */
export function isTarukurabeDay(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  // todayKey(quests.ts)と同じくローカル日時の年月日から組み立てる(タイムゾーンの
  // ずれで日付キーの表す曜日と1日ずれることを避けるため、UTC変換は経由しない)
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay() === 0;
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
