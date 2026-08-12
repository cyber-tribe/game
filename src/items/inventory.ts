import type { Item, MarkId } from "../core/types";
import { SHIELD_PLUS_BONUS, WEAPON_PLUS_BONUS, markDef } from "../entities/forging";
import { itemDef } from "./catalog";

export const INVENTORY_SIZE = 20;

export interface Inventory {
  items: Item[];
  maxSize: number;
  /** 装備中の武器の uid。未装備なら null */
  weaponUid: number | null;
  shieldUid: number | null;
  /** 頭防具・装身具の uid。plan/protagonist-equipment.md 参照 */
  headUid: number | null;
  charmUid: number | null;
}

export function createInventory(maxSize = INVENTORY_SIZE): Inventory {
  return { items: [], maxSize, weaponUid: null, shieldUid: null, headUid: null, charmUid: null };
}

export function isFull(inv: Inventory): boolean {
  return inv.items.length >= inv.maxSize;
}

export function addItem(inv: Inventory, item: Item): boolean {
  if (isFull(inv)) return false;
  inv.items.push(item);
  return true;
}

export function removeItem(inv: Inventory, uid: number): Item | undefined {
  const idx = inv.items.findIndex((i) => i.uid === uid);
  if (idx < 0) return undefined;
  const [item] = inv.items.splice(idx, 1);
  if (inv.weaponUid === uid) inv.weaponUid = null;
  if (inv.shieldUid === uid) inv.shieldUid = null;
  if (inv.headUid === uid) inv.headUid = null;
  if (inv.charmUid === uid) inv.charmUid = null;
  return item;
}

export function findItem(inv: Inventory, uid: number): Item | undefined {
  return inv.items.find((i) => i.uid === uid);
}

/** 装備すると同じ部位の先の装備は自動的に外れる */
export function equip(inv: Inventory, uid: number): boolean {
  const item = findItem(inv, uid);
  if (!item) return false;
  const def = itemDef(item.defId);
  if (def.category === "weapon") {
    inv.weaponUid = inv.weaponUid === uid ? null : uid;
    return true;
  }
  if (def.category === "shield") {
    inv.shieldUid = inv.shieldUid === uid ? null : uid;
    return true;
  }
  if (def.category === "head") {
    inv.headUid = inv.headUid === uid ? null : uid;
    return true;
  }
  if (def.category === "charm") {
    inv.charmUid = inv.charmUid === uid ? null : uid;
    return true;
  }
  return false;
}

export function isEquipped(inv: Inventory, uid: number): boolean {
  return inv.weaponUid === uid || inv.shieldUid === uid || inv.headUid === uid || inv.charmUid === uid;
}

export function weaponBonus(inv: Inventory): number {
  if (inv.weaponUid === null) return 0;
  const item = findItem(inv, inv.weaponUid);
  if (!item) return 0;
  return (itemDef(item.defId).bonus ?? 0) + (item.plus ?? 0) * WEAPON_PLUS_BONUS;
}

export function shieldBonus(inv: Inventory): number {
  if (inv.shieldUid === null) return 0;
  const item = findItem(inv, inv.shieldUid);
  if (!item) return 0;
  return (itemDef(item.defId).bonus ?? 0) + (item.plus ?? 0) * SHIELD_PLUS_BONUS;
}

/** 装備中の武器に刻んである印の一覧。未刻印/未装備なら空配列(plan/dual-mark-equipment.md、最大2件) */
export function weaponMarkIds(inv: Inventory): MarkId[] {
  if (inv.weaponUid === null) return [];
  return findItem(inv, inv.weaponUid)?.markIds ?? [];
}

/** 装備中の盾に刻んである印の一覧。未刻印/未装備なら空配列(plan/dual-mark-equipment.md、最大2件) */
export function shieldMarkIds(inv: Inventory): MarkId[] {
  if (inv.shieldUid === null) return [];
  return findItem(inv, inv.shieldUid)?.markIds ?? [];
}

/** 装備中の頭防具の防御ボーナス(鉄兜のみ)。他の頭防具は数値に触れない方向の効果なので0 */
export function headBonus(inv: Inventory): number {
  if (inv.headUid === null) return 0;
  const item = findItem(inv, inv.headUid);
  return item ? (itemDef(item.defId).bonus ?? 0) : 0;
}

/** 装備中の頭防具のdefId。未装備ならnull */
export function headDefId(inv: Inventory): string | null {
  if (inv.headUid === null) return null;
  return findItem(inv, inv.headUid)?.defId ?? null;
}

/** 装備中の装身具のdefId。未装備ならnull */
export function charmDefId(inv: Inventory): string | null {
  if (inv.charmUid === null) return null;
  return findItem(inv, inv.charmUid)?.defId ?? null;
}

/** 表示用の名前。杖は残り回数、武器・盾は強化値と印、装備品は装備中である旨を添える */
export function displayName(inv: Inventory, item: Item): string {
  const def = itemDef(item.defId);
  let name = def.name;
  if (def.category === "staff" && item.charges !== undefined) name += `[${item.charges}]`;
  if (def.category === "weapon" || def.category === "shield") {
    if (item.plus) name += `+${item.plus}`;
    for (const markId of item.markIds ?? []) name += `【${markDef(markId).name}】`;
  }
  if (isEquipped(inv, item.uid)) name += " (装備中)";
  return name;
}
