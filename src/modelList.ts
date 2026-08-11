import { SPECIES } from "./entities/species";
import { ITEMS } from "./items/catalog";

/** 罠の種類。モデル名は trap_<kind> に対応する */
export const TRAP_KINDS = ["damage", "sleep", "alarm", "pitfall"] as const;

/** 地形のモデル。種族表やアイテム表からは辿れないので直接並べる */
export const TERRAIN_MODELS = ["wall", "floor", "stairs"] as const;

/**
 * ゲームが必要とするモデルの一覧を、種族表とアイテム表から組み立てる。
 *
 * 起動時の読み込みとテストの両方がここを見る。モンスターやアイテムを足したのに
 * .glb を作り忘れた、という取りこぼしをテストが捕まえられるようにするため、
 * 一覧を二重に持たないことが大事。
 */
export function modelNames(): string[] {
  const names = new Set<string>(["garudo", ...TERRAIN_MODELS]);
  for (const species of SPECIES) names.add(species.model);
  for (const item of ITEMS) names.add(item.model);
  for (const kind of TRAP_KINDS) names.add(`trap_${kind}`);
  return [...names];
}

/** アニメーションを持っているべきモデル(プレイヤーとモンスター) */
export function animatedModelNames(): string[] {
  return ["garudo", ...new Set(SPECIES.map((s) => s.model))];
}

/** すべてのキャラクターが備えているべきクリップ */
export const REQUIRED_CLIPS = ["idle", "walk", "attack", "hit", "die"] as const;
