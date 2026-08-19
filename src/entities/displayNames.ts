import type { AllyStance, BarrelKind } from "../core/types";

/**
 * 表示専用の日本語テーブル(plan外のリファクタリング、Martin Fowler PR16)。
 * game.ts(core)がメッセージ文言の組み立てに、view層(hud.ts等)が表示に、
 * それぞれ参照する。core/types.tsは構造体・振る舞いの型だけを持つ
 * リーフモジュールに保つため、表示文字列はここへ切り出す
 */
export const ALLY_STANCE_NAMES: Record<AllyStance, string> = {
  free: "おまかせ",
  guard: "そばにいろ",
  hold: "そこで待て",
  vanguard: "先陣を切れ",
  dreamArtsCareful: "ゆめわざ控えめ",
};

export const BARREL_NAMES: Record<BarrelKind, string> = {
  empty: "からのタル",
  bomb: "ばくはつタル",
  caught: "モンスター入りのタル",
};
