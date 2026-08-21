import type { Rng } from "../core/rng";
import type { Item, ItemDef } from "../core/types";
import { itemsForDepth } from "../items/catalog";
import { HOKORA_DUST_DEF_ID, MARK_STONE_DEF_ID, MARKS } from "./forging";

/** 「ぬしの置き土産」の強化値の幅。高強化値の武器/盾を引いたときだけ使う */
const FIRST_CLEAR_PLUS_MIN = 3;
const FIRST_CLEAR_PLUS_MAX = 5;

function weaponsAndShields(tableDepth: number): { weapons: ItemDef[]; shields: ItemDef[] } {
  const pool = itemsForDepth(tableDepth).filter((d) => d.weight > 0);
  return {
    weapons: pool.filter((d) => d.category === "weapon"),
    shields: pool.filter((d) => d.category === "shield"),
  };
}

function rollPlusEquip(rng: Rng, nextItemUid: () => number, tableDepth: number): Item | null {
  const { weapons, shields } = weaponsAndShields(tableDepth);
  const pool = rng.chance(0.5) && weapons.length > 0 ? weapons : shields.length > 0 ? shields : weapons;
  if (pool.length === 0) return null;
  const def = rng.pickWeighted(pool, (d) => d.weight);
  return { uid: nextItemUid(), defId: def.id, plus: rng.int(FIRST_CLEAR_PLUS_MIN, FIRST_CLEAR_PLUS_MAX) };
}

function rollMarkedEquip(rng: Rng, nextItemUid: () => number, tableDepth: number): Item | null {
  const { weapons, shields } = weaponsAndShields(tableDepth);
  const mark = rng.pick(MARKS);
  const pool = mark.slot === "weapon" ? weapons : shields;
  if (pool.length === 0) return null;
  const def = rng.pickWeighted(pool, (d) => d.weight);
  return { uid: nextItemUid(), defId: def.id, markIds: [mark.id] };
}

function rollMaterialBundle(rng: Rng, nextItemUid: () => number, generous: boolean): Item[] {
  const dustCount = generous ? 3 : 1;
  const items: Item[] = [];
  for (let i = 0; i < dustCount; i++) items.push({ uid: nextItemUid(), defId: HOKORA_DUST_DEF_ID });
  if (generous || rng.chance(0.5)) {
    const mark = rng.pick(MARKS);
    items.push({ uid: nextItemUid(), defId: MARK_STONE_DEF_ID[mark.id] });
  }
  return items;
}

/**
 * ぬしの置き土産(plan/game/dungeon-boss-rooms.md)。地方ボスを撃破すると、
 * 既存の確定ドロップ(bossGuaranteedDrop、地方限定素材)とは別に、
 * 宝箱相当のこの報酬をその場に落とす。
 *
 * doc本文は「そのダンジョンでは拾えない上位の草・巻物」も候補に挙げるが、
 * 草・巻物のminFloorは最大でも4(items/catalog.ts参照)で、ボス階(各地方
 * 最終階、tableDepth>=REGION_SIZE=6)には常にすでに出揃っているため
 * 「そのダンジョンでは拾えない上位」が実在しない。docの未決事項どおり
 * 具体的な中身は未確定だったため、実装にあたりこの枠は「印つき装備」
 * 「レア素材の束」の残り2枠に統合した(実質3枠から抽選)。
 *
 * 初回踏破: 高強化値(+3〜+5)の武器/盾・印つき装備・レア素材の束(多め)
 * のいずれか1つ(等確率)。2回目以降の踏破は「一段軽く」、レア素材の束
 * (少なめ)だけに絞る。
 */
export function rollBossTreasure(
  rng: Rng,
  nextItemUid: () => number,
  tableDepth: number,
  firstClear: boolean,
): Item[] {
  if (!firstClear) return rollMaterialBundle(rng, nextItemUid, false);

  const roll = rng.int(0, 2);
  if (roll === 0) {
    const item = rollPlusEquip(rng, nextItemUid, tableDepth);
    if (item) return [item];
  } else if (roll === 1) {
    const item = rollMarkedEquip(rng, nextItemUid, tableDepth);
    if (item) return [item];
  }
  return rollMaterialBundle(rng, nextItemUid, true);
}
