/**
 * ヨリシロの気分(plan/yorishiro-moods.md)。日替わりでダイブ全体にかかる
 * 補正。実行中の端末の日付から一意に決まり、セーブへの永続化は不要
 * (同じ日付なら毎回同じ気分が再計算できるため)。日付キーの算出は新規に
 * 作らず、既存の`todayKey`(`./quests`、依頼板・村の祭りとも共有)を
 * 呼び出し側から渡してもらう
 */

export type MoodId =
  | "calmSleep"
  | "lightSleep"
  | "deepSleep"
  | "restless"
  | "premonition"
  | "shortcutPresence";

export interface MoodDef {
  id: MoodId;
  name: string;
  flavorText: string;
  monsterHouseRateMul?: number;
  shopRateMul?: number;
  floorGimmickRateMul?: number;
  dropRateMul?: number;
  goldRateMul?: number;
  rareSpawnRateMul?: number;
  thiefRateMul?: number;
  /** モンスターの索敵しやすさ。隣接時は常に気づく(奇襲を許さない)ため、隣接していない相手にだけ効く */
  awareDistanceMul?: number;
  /** モンスターが気づいて動き出したあとの攻撃力(モンスターは気づいていないと攻撃できないため、実質モンスターの攻撃力そのものに掛かる) */
  monsterAtkMulAfterAware?: number;
}

/**
 * 補正なしの既定の気分。Game.moodOverrideを省略した場合の内部既定値に使う
 * (実際の日付から今日の気分を決めるのはsrc/main.ts側の責務。Gameクラス
 * 自身は現実の日付に依存させない――既存のテストの多くがseedだけで完全に
 * 決定的なRNG列を期待しているため、Gameのコンストラクタが素で
 * moodForDate(todayKey())を呼ぶと、テスト実行日によってダイブ内容が
 * 変わってしまい壊れる。compendiumComplete等と同じ、呼び出し側が明示的に
 * 渡す設計に揃えた)
 */
export const DEFAULT_MOOD_ID: MoodId = "calmSleep";

export const MOODS: readonly MoodDef[] = [
  {
    id: "calmSleep",
    name: "おだやかな寝息",
    flavorText: "山は、いつもどおり静かに眠っている。",
  },
  {
    id: "lightSleep",
    name: "浅い眠り",
    flavorText: "眠りが浅いのか、物音が響きやすい気がする。",
    awareDistanceMul: 0.7,
    dropRateMul: 0.85,
  },
  {
    id: "deepSleep",
    name: "深い眠り",
    flavorText: "ずいぶん深く眠り込んでいるようだ。多少のことでは目を覚まさない。",
    awareDistanceMul: 0.6,
    monsterAtkMulAfterAware: 1.2,
  },
  {
    id: "restless",
    name: "寝苦しい夜",
    flavorText: "寝苦しいのか、夢のあちこちが落ち着かない。",
    floorGimmickRateMul: 1.5,
    monsterHouseRateMul: 1.5,
    dropRateMul: 1.2,
    goldRateMul: 1.2,
  },
  {
    id: "premonition",
    name: "虫の知らせ",
    flavorText: "何か特別なものに出会えそうな予感がする。",
    rareSpawnRateMul: 1.5,
    dropRateMul: 0.9,
  },
  {
    id: "shortcutPresence",
    name: "近道屋の気配",
    flavorText: "どこかに近道屋の気配がする。今日は気をつけたほうがいい。",
    shopRateMul: 1.5,
    thiefRateMul: 1.5,
  },
];

const MOOD_IDS: readonly MoodId[] = MOODS.map((m) => m.id);

const BY_ID = new Map(MOODS.map((m) => [m.id, m]));

export function moodDef(id: MoodId): MoodDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`未知の気分: ${id}`);
  return def;
}

/** 与えた日付キー(todayKeyの出力)から、一意に気分を1つ決める */
export function moodForDate(dateKey: string): MoodDef {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  return moodDef(MOOD_IDS[h % MOOD_IDS.length]!);
}
