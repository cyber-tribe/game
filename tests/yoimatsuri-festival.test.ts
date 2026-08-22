import { describe, expect, it } from "vitest";
import { FESTIVAL_SHOP_OFFERS, isYoimatsuri } from "../src/entities/festivals";
import { itemDef } from "../src/entities/itemCatalog";
import { buyFestivalItem, initialSave } from "../src/save";

describe("entities/festivals.ts: isYoimatsuri", () => {
  it("日付キーの下1桁が0の日は宵祭り", () => {
    expect(isYoimatsuri("2026-08-10")).toBe(true);
    expect(isYoimatsuri("2026-08-20")).toBe(true);
    expect(isYoimatsuri("2026-08-30")).toBe(true);
  });

  it("それ以外の日は宵祭りではない", () => {
    expect(isYoimatsuri("2026-08-12")).toBe(false);
    expect(isYoimatsuri("2026-08-01")).toBe(false);
  });
});

describe("entities/festivals.ts: FESTIVAL_SHOP_OFFERS", () => {
  it("品揃えの全defIdが実在するアイテムを指す", () => {
    for (const offer of FESTIVAL_SHOP_OFFERS) {
      expect(() => itemDef(offer.defId)).not.toThrow();
      expect(offer.price).toBeGreaterThan(0);
    }
  });
});

describe("save.ts: buyFestivalItem", () => {
  it("宵祭りの日でなければ何も起きない", () => {
    const save = { ...initialSave(), gold: 10000 };
    const next = buyFestivalItem(save, "hokoraDust", "2026-08-12");
    expect(next).toBe(save);
  });

  it("所持金が足りなければ何も起きない", () => {
    const save = { ...initialSave(), gold: 0 };
    const next = buyFestivalItem(save, "hokoraDust", "2026-08-10");
    expect(next).toBe(save);
  });

  it("未知のdefIdなら何も起きない", () => {
    const save = { ...initialSave(), gold: 10000 };
    const next = buyFestivalItem(save, "notAFestivalItem", "2026-08-10");
    expect(next).toBe(save);
  });

  it("宵祭りの日+所持金が足りていれば、代金を払って手に入る", () => {
    const save = { ...initialSave(), gold: 10000 };
    const offer = FESTIVAL_SHOP_OFFERS[0]!;
    const next = buyFestivalItem(save, offer.defId, "2026-08-10");
    expect(next.gold).toBe(10000 - offer.price);
    expect(next.storage.some((i) => i.defId === offer.defId)).toBe(true);
  });

  it("補充・売り切れの概念は無く、同じ品を何度でも買える", () => {
    let save = { ...initialSave(), gold: 10000 };
    const offer = FESTIVAL_SHOP_OFFERS[0]!;
    save = buyFestivalItem(save, offer.defId, "2026-08-10");
    save = buyFestivalItem(save, offer.defId, "2026-08-10");
    expect(save.storage.filter((i) => i.defId === offer.defId)).toHaveLength(2);
  });
});
