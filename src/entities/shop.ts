import type { Item, ItemDef } from "../core/types";

/** 万引きされたあと、そのラン中ずっと適用される価格の割高係数(plan/shops-and-thieves.md) */
export const WARY_PRICE_MULTIPLIER = 1.5;

/**
 * 近道屋の出店(plan/shops-and-thieves.md)の売値。出現階が深く・レアな
 * ものほど高くなる。武器・盾はbonus、杖はchargesぶんも上乗せする。
 * waryなら(万引き後の警戒状態)割高になる。
 */
export function shopPrice(def: ItemDef, item: Item, wary: boolean): number {
  let price = 20 + def.minFloor * 8 + (10 - def.weight) * 5;
  if (def.category === "weapon" || def.category === "shield") {
    price += (def.bonus ?? 0) * 3;
  }
  if (def.category === "staff") {
    price += (item.charges ?? 0) * 5;
  }
  if (wary) price = Math.round(price * WARY_PRICE_MULTIPLIER);
  return Math.max(1, price);
}

/** アイテムの売却額(plan/item-selling.md)。買値の4割。waryなら買値と同様に割高が乗る */
export function sellPrice(def: ItemDef, item: Item, wary: boolean): number {
  return Math.round(shopPrice(def, item, wary) * 0.4);
}
