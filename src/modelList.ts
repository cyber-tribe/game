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

/**
 * タルの種類ごとのモデル。BarrelKind と対応する。元素タル(plan/game/archive/
 * barrel-arts.md)は専用モデルをまだ制作しておらず、見た目は空のタルを流用する
 * (plan/models/への新規モデル追加は別作業とする)
 */
export const BARREL_MODELS = {
  empty: "barrel",
  bomb: "barrel_bomb",
  caught: "barrel_caught",
  water: "barrel",
  wind: "barrel",
  light: "barrel",
  stone: "barrel",
  sleep: "barrel",
} as const;

/**
 * 村人NPCのモデル(`plan/models/model-*.md`、`tools/models/villagers.py`)。
 * 建物の内装に立たせる(`plan/game/village-interiors.md`)ためのもので、
 * 種族表にもアイテム表にも載らないのでここに直接並べる。
 *
 * **村人を1人実装したら、この配列に名前を1行足す。** 村人は8人
 * (mogurabaa / gendo / otone / okiyo / pochi / otama / fuku / ito)いて、
 * 1人1PRで順に足していく。
 *
 * 村人の名寄せに1つ落とし穴がある。`entities/village.ts` の
 * `VillageNpcId` とモデル名は綴りが違うものがあり(モグラ婆は
 * NPC が `mogurababa`・モデルが `mogurabaa`)、両者は別物として扱う。
 */
export const VILLAGER_MODELS = ["mogurabaa", "gendo", "fuku", "pochi", "otama", "okiyo", "otone", "ito"] as const;

/**
 * 村の建物・小道具の正式モデル(`plan/models/archive/model-village-structures.md`、
 * `tools/models/props.py`)。`src/view/village.ts`の`VillageBuilding.model`から
 * 参照される。1棟・1小道具ずつここへ足していく(村人と同じ運用)。
 */
export const VILLAGE_STRUCTURE_MODELS = ["cave_gate", "bonfire", "house_workshop"] as const;

/**
 * 村人が備えているべきクリップ。村人は戦わないので、モンスターの5本
 * (`REQUIRED_CLIPS`)ではなく待機と会話の2本だけに揃える
 * (`tools/models/villagers.py` の `CLIPS` と対になっている)。
 */
export const VILLAGER_CLIPS = ["idle", "talk"] as const;

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
  for (const model of VILLAGER_MODELS) names.add(model);
  for (const model of VILLAGE_STRUCTURE_MODELS) names.add(model);
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

/**
 * 5つのクリップをすべて持っているべきモデル(プレイヤーとモンスター)。
 * 村人はここに入れない。戦わないので `VILLAGER_CLIPS` の2本しか持たない。
 */
export function animatedModelNames(): string[] {
  return ["garudo", ...new Set(SPECIES.map((s) => s.model))];
}

/** すべてのキャラクターが備えているべきクリップ */
export const REQUIRED_CLIPS = ["idle", "walk", "attack", "hit", "die"] as const;
