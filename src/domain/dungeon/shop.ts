import type { Vec2 } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import { type FloorState, type MonsterActor, roomContains } from "../../core/types";
import type { PlayerState } from "../../entities/player";
import { itemDef } from "../../entities/itemCatalog";
import { sellPrice } from "../../entities/shop";
import { removeItem } from "../item/inventory";

/**
 * checkShoplifting/sellItemが必要とする、narrowなGameアクセス
 * (plan/game/ddd-phase8-game-facade.md)。
 */
export interface ShopContext {
  floor: FloorState;
  player: PlayerState;
  getShopWary(): boolean;
  setShopWary(wary: boolean): void;
}

/**
 * 近道屋の出店(plan/shops-and-thieves.md)。未払いのまま持ち出した品を
 * 持ったまま部屋の外へ出ると万引き扱いになり、店主が豹変する。
 * 以後そのラン中は、新しく出会う出店すべてが最初から警戒状態(割高)になる
 */
export function checkShoplifting(from: Vec2, to: Vec2, events: GameEvent[], ctx: ShopContext): void {
  const shopRoom = ctx.floor.rooms.find((r) => r.kind === "shop");
  if (!shopRoom || !roomContains(shopRoom, from) || roomContains(shopRoom, to)) return;
  const hasUnpaid = ctx.player.inventory.items.some((i) => i.unpaid);
  if (!hasUnpaid) return;

  for (const item of ctx.player.inventory.items) item.unpaid = false;
  ctx.setShopWary(true);
  const keeper = ctx.floor.actors.find(
    (a): a is MonsterActor => a.alive && a.kind === "monster" && a.aiKind === "shopkeeper" && roomContains(shopRoom, a.pos),
  );
  if (keeper) keeper.angry = true;
  events.push({ type: "message", text: "万引きだ! 店主が豹変した!" });
}

/** 店の部屋で「置く」を使うと売却になる(plan/item-selling.md) */
export function sellItem(uid: number, events: GameEvent[], ctx: ShopContext): boolean {
  const item = removeItem(ctx.player.inventory, uid);
  if (!item) return false;
  const def = itemDef(item.defId);
  const price = sellPrice(def, item, ctx.getShopWary());
  ctx.player.gold += price;
  events.push({ type: "message", text: `${def.name}を${price}ゴールドで売った。` });
  return true;
}
