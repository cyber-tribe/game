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
  water: "水タル",
  wind: "風タル",
  light: "光タル",
  stone: "石タル",
  sleep: "ねむタル",
};

/**
 * 元素タル(plan/game/archive/barrel-arts.md)の強化版(なじみ「すっかりなじんだ」
 * 段階以上で作った場合)の表示名。「大◯タル」で統一する
 */
export function barrelDisplayName(barrel: { kind: BarrelKind; enhanced?: boolean }): string {
  if (!barrel.enhanced) return BARREL_NAMES[barrel.kind];
  return `大${BARREL_NAMES[barrel.kind]}`;
}
