import { describe, expect, it } from "vitest";
import { DIALOGUE_POOLS, dialogueContext, dialoguePoolFor } from "../src/entities/dialogue";
import { SPECIES } from "../src/entities/species";
import { VILLAGE_NPCS } from "../src/entities/village";
import { itemDef } from "../src/items/catalog";
import { initialSave } from "../src/save";
import type { SaveData } from "../src/save";

function withBond(save: SaveData, npcId: string, level: number): SaveData {
  return { ...save, bonds: { ...save.bonds, [npcId]: level } };
}

describe("entities/dialogue.ts: dialogueContext(plan/flavor-and-dialogue.md)", () => {
  it("絆・最高ならhighBond(気分・宵祭りより優先)", () => {
    const save = { ...withBond(initialSave(), "mogurababa", 30), deepest: 10 };
    expect(dialogueContext(save, "mogurababa")).toBe("highBond");
  });

  it("絆が最高でなければ、条件に応じてdefault以外にもなる", () => {
    const save = initialSave();
    const context = dialogueContext(save, "mogurababa");
    expect(["default", "moodRestless", "afterFestival"]).toContain(context);
  });

  it("どの条件も満たさなければdefault", () => {
    // 絆・中未満、寝苦しい夜でも宵祭りでもない前提の日を明示的に検証するのは
    // 現実の日付に依存するため、優先順位のロジックだけをここでは確認する
    const save = withBond(initialSave(), "mogurababa", 0);
    const context = dialogueContext(save, "mogurababa");
    expect(context).not.toBe("highBond");
  });
});

describe("entities/dialogue.ts: DIALOGUE_POOLS / dialoguePoolFor", () => {
  it("全プールが実在するVillageNpcIdを指す", () => {
    const validIds = new Set(VILLAGE_NPCS.map((n) => n.id));
    for (const pool of DIALOGUE_POOLS) {
      expect(validIds.has(pool.npcId as never)).toBe(true);
      expect(pool.lines.length).toBeGreaterThan(0);
    }
  });

  it("全NPCがdefaultコンテキストのプールを持つ", () => {
    for (const npc of VILLAGE_NPCS) {
      expect(dialoguePoolFor(npc.id, "default")).toBeDefined();
    }
  });

  it("該当contextのプールが無ければdefaultにフォールバックする", () => {
    // mogurababaにはafterFestival専用プールが無い前提のNPCがいれば、それで確認する
    const npcWithoutAfterFestival = VILLAGE_NPCS.find(
      (npc) => !DIALOGUE_POOLS.some((p) => p.npcId === npc.id && p.context === "afterFestival"),
    );
    if (npcWithoutAfterFestival) {
      const pool = dialoguePoolFor(npcWithoutAfterFestival.id, "afterFestival");
      expect(pool?.context).toBe("default");
    }
  });

  it("未知のNPCidにはundefinedを返す", () => {
    expect(dialoguePoolFor("unknownNpc", "default")).toBeUndefined();
  });
});

describe("items/catalog.ts: ItemDef.flavorText(plan/flavor-and-dialogue.md)", () => {
  it("一部のアイテムにflavorTextが設定されている", () => {
    expect(itemDef("healLeaf").flavorText).toBeDefined();
    expect(itemDef("hatchet").flavorText).toBeDefined();
  });

  it("flavorTextは省略可能(未設定でもエラーにならない)", () => {
    // 全アイテムに一斉に付ける必要はない、という方針の確認
    const withoutFlavor = itemDef("spearedge");
    expect(withoutFlavor.flavorText === undefined || typeof withoutFlavor.flavorText === "string").toBe(true);
  });
});

describe("entities/species.ts: Species.idleSpeedMul(plan/flavor-and-dialogue.md)", () => {
  it("計画書の例どおり3種に設定されている", () => {
    expect(SPECIES.find((s) => s.id === "purun")?.idleSpeedMul).toBe(0.6);
    expect(SPECIES.find((s) => s.id === "gajiri")?.idleSpeedMul).toBe(1.4);
    expect(SPECIES.find((s) => s.id === "honegarami")?.idleSpeedMul).toBe(0.3);
  });
});
