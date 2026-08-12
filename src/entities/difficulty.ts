/**
 * 難易度モード(plan/difficulty-modes.md)。拠点でいつでも選び直せ、
 * 変更にペナルティは無い。`design/balance-philosophy.md` の数値目安は
 * "ふつう" を基準値として算出したものであり、easy/hard はそこからの
 * 一律の掛け率で調整する(難易度ごとの個別バランス調整はしない)。
 */
export type DifficultyMode = "easy" | "normal" | "hard";

export const DIFFICULTY_MODES: readonly DifficultyMode[] = ["easy", "normal", "hard"];

export const DIFFICULTY_NAMES: Record<DifficultyMode, string> = {
  easy: "やさしい",
  normal: "ふつう",
  hard: "きびしい",
};

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyMode, string> = {
  easy: "満腹度の減りがゆるやかになり、モンスターハウス・階ギミックが控えめになる。報酬はふつうと同じ。",
  normal: "これまでの基準値そのまま。",
  hard: "満腹度の減りが早く、モンスターの攻撃力・モンスターハウス・階ギミックの出現率が上がる。所持金・素材のドロップと、専用の称号で報われる。",
};

/** 満腹度の減り(SATIETY_PER_TURN)に掛ける倍率 */
export const SATIETY_RATE_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 0.8,
  normal: 1,
  hard: 1.2,
};

/** モンスターの攻撃力に掛ける倍率 */
export const MONSTER_ATK_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 1,
  normal: 1,
  hard: 1.1,
};

/** モンスターハウスの出現率に掛ける倍率 */
export const MONSTER_HOUSE_CHANCE_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 0.6,
  normal: 1,
  hard: 1.3,
};

/** 階ギミックの出現率に掛ける倍率 */
export const GIMMICK_CHANCE_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 0.7,
  normal: 1,
  hard: 1.3,
};

/** 金貨の山の量に掛ける倍率("きびしい"の見返り) */
export const GOLD_REWARD_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 1,
  normal: 1,
  hard: 1.3,
};

/** かがやきの夢のかけらの出現率に掛ける倍率("きびしい"の見返り) */
export const SHINING_CHANCE_DIFFICULTY_MULTIPLIER: Record<DifficultyMode, number> = {
  easy: 1,
  normal: 1,
  hard: 1.5,
};
