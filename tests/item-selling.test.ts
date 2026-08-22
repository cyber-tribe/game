import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import { access } from "./helpers/access";
import { shopPrice, sellPrice, WARY_PRICE_MULTIPLIER } from "../src/entities/shop";
import { itemDef } from "../src/entities/itemCatalog";
import { roomCenter, roomContains } from "../src/core/types";

function setupShop(seed: number) {
  const game = new Game({ seed });
  game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
  const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
  room.kind = "shop";
  const center = roomCenter(room);
  game.player.pos = { ...center };
  return { game, room };
}

describe("entities/shop.ts: sellPrice", () => {
  it("shopPriceの4割になる(四捨五入)", () => {
    const def = itemDef("healLeaf");
    const item = { uid: 1, defId: "healLeaf" };
    const buy = shopPrice(def, item, false);
    expect(sellPrice(def, item, false)).toBe(Math.round(buy * 0.4));
  });

  it("wary(万引き後)なら買値と同様に割高な売却額になる", () => {
    const def = itemDef("healLeaf");
    const item = { uid: 1, defId: "healLeaf" };
    const wary = sellPrice(def, item, true);
    expect(wary).toBe(Math.round(shopPrice(def, item, false) * WARY_PRICE_MULTIPLIER * 0.4));
  });
});

describe("game.ts: 店の部屋でアイテムを「置く」と売却になる", () => {
  it("店の部屋で置くと、床に落とさず所持金が増える", () => {
    const { game } = setupShop(1);
    game.player.gold = 0;
    game.player.inventory.items.push({ uid: 1, defId: "healLeaf" });
    const price = sellPrice(itemDef("healLeaf"), { uid: 1, defId: "healLeaf" }, false);

    const events = game.command({ type: "drop", uid: 1 });

    expect(game.player.gold).toBe(price);
    expect(game.player.inventory.items.find((i) => i.uid === 1)).toBeUndefined();
    expect(game.floor.items.some((gi) => gi.item.uid === 1)).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === `いやしの葉を${price}ゴールドで売った。`)).toBe(
      true,
    );
  });

  it("店の部屋の外で置くと、従来どおり床に落ちる(売却されない)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
    expect(room.kind).not.toBe("shop");
    game.player.gold = 0;
    game.player.inventory.items.push({ uid: 1, defId: "healLeaf" });

    game.command({ type: "drop", uid: 1 });

    expect(game.player.gold).toBe(0);
    expect(game.floor.items.some((gi) => gi.item.uid === 1 && eqPos(gi.pos, game.player.pos))).toBe(true);
  });

  it("万引き後の警戒状態(shopWary)では、売却額も割高な計算式になる", () => {
    const { game } = setupShop(1);
    access(game).shopWary = true;
    game.player.gold = 0;
    game.player.inventory.items.push({ uid: 1, defId: "healLeaf" });
    const price = sellPrice(itemDef("healLeaf"), { uid: 1, defId: "healLeaf" }, true);

    game.command({ type: "drop", uid: 1 });

    expect(game.player.gold).toBe(price);
  });

  it("装備中のアイテムも売却できる(既存のdropの制約をそのまま踏襲)", () => {
    const { game } = setupShop(1);
    game.player.gold = 0;
    game.player.inventory.items.push({ uid: 1, defId: "hatchet" });
    game.player.inventory.weaponUid = 1;
    const price = sellPrice(itemDef("hatchet"), { uid: 1, defId: "hatchet" }, false);

    game.command({ type: "drop", uid: 1 });

    expect(game.player.gold).toBe(price);
    expect(game.player.inventory.weaponUid).toBeNull();
  });
});

function eqPos(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}
