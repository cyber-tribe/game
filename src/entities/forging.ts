import type { MarkId } from "../core/types";

/** 装備の強化値・印(plan/equipment-forging.md) */
export const MAX_PLUS = 9;
export const WEAPON_PLUS_BONUS = 2;
export const SHIELD_PLUS_BONUS = 1;

/** 強化に必要な、ほこら粉の個数。強化値が上がるほど増える */
export function hokoraDustCost(currentPlus: number): number {
  return 2 + currentPlus;
}

/** 印を刻むのに必要な、ほこら粉の個数(刻印石1個は別途消費する) */
export const MARK_IMPRINT_DUST_COST = 3;

export const HOKORA_DUST_DEF_ID = "hokoraDust";

/**
 * 2つ目の刻印を可能にする条件(plan/dual-mark-equipment.md)。
 * 装備1つが持てる印の上限
 */
export const MAX_MARK_SLOTS = 2;

/** 重ね刻みの砥石(2つ目の刻印の解放素材)のdefId */
export const OVERLAY_STONE_DEF_ID = "overlayMarkStone";

/** 重ね刻みの砥石を合成するのに必要な、ほこら粉の個数(刻印石2個は別途消費する) */
export const OVERLAY_STONE_DUST_COST = 8;

export interface MarkDef {
  id: MarkId;
  name: string;
  slot: "weapon" | "shield";
  description: string;
}

export const MARKS: readonly MarkDef[] = [
  {
    id: "purun",
    name: "ぷるんの印",
    slot: "shield",
    description: "被弾ダメージを確率5割で1割軽減する。",
  },
  {
    id: "gajiri",
    name: "ガジリねずみの印",
    slot: "weapon",
    description: "そのランの最初の1手を必ず会心の一撃にする。",
  },
  {
    id: "tsubute",
    name: "ツブテガエルの印",
    slot: "weapon",
    description: "タルを投げたときのダメージ+2。",
  },
  {
    id: "madoromi",
    name: "マドロミダケの印",
    slot: "weapon",
    description: "攻撃時、眠り付与の確率+10%。",
  },
  {
    id: "honegarami",
    name: "ホネガラミの印",
    slot: "shield",
    description: "HPが1残っていれば、致死ダメージを1回だけ耐える(1ラン1回)。",
  },
];

export function markDef(id: MarkId): MarkDef {
  const def = MARKS.find((m) => m.id === id);
  if (!def) throw new Error(`未知の印: ${id}`);
  return def;
}

/** 各印に対応する刻印石のアイテムdefId */
export const MARK_STONE_DEF_ID: Record<MarkId, string> = {
  purun: "markStonePurun",
  gajiri: "markStoneGajiri",
  tsubute: "markStoneTsubute",
  madoromi: "markStoneMadoromi",
  honegarami: "markStoneHonegarami",
};
