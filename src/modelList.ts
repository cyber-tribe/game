import { SPECIES, speciesForDepth } from "./entities/species";
import { ITEMS } from "./items/catalog";

/**
 * 罠の種類ごとのモデル。基本は trap_<kind> に対応するが、専用モデルを
 * 新規に作らない種類は既存モデルを再利用してよい(poison → trap_damage。
 * 「踏むと毒を受ける」という当たり判定と挙動だけが新しく、見た目までは
 * 増やさない判断。plan/status-effects.md 参照)。
 */
export const TRAP_MODELS = {
  damage: "trap_damage",
  sleep: "trap_sleep",
  alarm: "trap_alarm",
  pitfall: "trap_pitfall",
  poison: "trap_damage",
} as const;

/** 地形のモデル。種族表やアイテム表からは辿れないので直接並べる */
export const TERRAIN_MODELS = ["wall", "floor", "stairs"] as const;

/** タルの種類ごとのモデル。BarrelKind と対応する */
export const BARREL_MODELS = {
  empty: "barrel",
  bomb: "barrel_bomb",
  caught: "barrel_caught",
} as const;

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
  for (const model of Object.values(TRAP_MODELS)) names.add(model);
  for (const model of Object.values(BARREL_MODELS)) names.add(model);
  return [...names];
}

/**
 * 起動時に、これだけは読み終えてから遊べる状態にするモデル。
 *
 * 全部(現在22個・約1.4MB)を待ってからタイトルを出すと、モンスターの
 * 種類が増えるたびに起動が延びていく。地下1階へ降りた瞬間に実際に要るのは
 * 主人公・地形・タルと、1階に出うる種族だけ。残りは背景で読み進める。
 *
 * アイテムと罠を外してあるのは、床に落ちているものが見えるのは部屋に
 * 入ってからで、そのころには背景の読み込みが終わっているため。万一
 * 間に合わなくても、フロアを組む手前で待ち合わせる作りにしてある。
 */
export function essentialModelNames(): string[] {
  const names = new Set<string>(["garudo", ...TERRAIN_MODELS]);
  for (const model of Object.values(BARREL_MODELS)) names.add(model);
  for (const species of speciesForDepth(1)) names.add(species.model);
  return [...names];
}

/** アニメーションを持っているべきモデル(プレイヤーとモンスター) */
export function animatedModelNames(): string[] {
  return ["garudo", ...new Set(SPECIES.map((s) => s.model))];
}

/** すべてのキャラクターが備えているべきクリップ */
export const REQUIRED_CLIPS = ["idle", "walk", "attack", "hit", "die"] as const;
