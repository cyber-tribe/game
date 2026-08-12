/**
 * 実績・称号(plan/achievements.md)。達成した記録そのものを可視化する
 * カタログ。判定ロジックは save.ts の checkAchievements が持つ(達成条件は
 * 既存のセーブフィールドから毎回再評価するだけで、専用の監視処理は無い)。
 *
 * 依頼板(plan/quest-board.md)・地方ボス(plan/region-bosses.md)・
 * 仲間の成熟(plan/companion-evolution.md)・絆(design/village-life.md)は
 * まだ実装されていないため、それらを条件にする実績は未収録。
 * 「網羅的な一覧は実装時に広げる」という本文の方針どおり、対応する機能が
 * 実装され次第この一覧に追加する。「挑戦」カテゴリ(縛りプレイ系)は
 * 本文が実装コストの判断を保留しているため、今回は見送る。
 */
export interface AchievementDef {
  id: string;
  name: string;
  /** 達成条件の説明。隠し実績は作らない方針(design/balance-philosophy.md)なので常に表示する */
  description: string;
  /** 称号として身につけられる場合の文言。無ければ称号は無い記録専用の実績 */
  title?: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "compendiumHalf",
    name: "図鑑なかば",
    description: "モンスター図鑑を半分以上「捕まえた」で埋める。",
  },
  {
    id: "compendiumFull",
    name: "図鑑コンプリート",
    description: "モンスター図鑑を全種「捕まえた」で埋める。",
    title: "図鑑の達人",
  },
  {
    id: "shiningSeen",
    name: "かがやきとの遭遇",
    description: "かがやきの夢のかけらを見る。",
  },
  {
    id: "defeats50",
    name: "手練れの記録",
    description: "累計撃破数が50体に達する。",
  },
  {
    id: "captures10",
    name: "夢あつめ",
    description: "のべ捕獲数が10体に達する。",
  },
  {
    id: "allMarksForged",
    name: "五印皆伝",
    description: "5種類すべての印を、それぞれ1つ以上刻む。",
    title: "名工の弟子",
  },
  {
    id: "maxPlusReached",
    name: "極めの一振り",
    description: "武器か盾を+9まで強化する。",
  },
  {
    id: "clear1",
    name: "はじめての踏破",
    description: "表の寝穴を踏破する。",
    title: "寝穴の踏破者",
  },
  {
    id: "level10",
    name: "鍛えの節目",
    description: "レベル10に到達する。",
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementDef(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}
