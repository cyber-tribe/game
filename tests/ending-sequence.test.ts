import { describe, expect, it } from "vitest";
import { CREDIT_REGIONS, creditMonsterNames, creditVillagerNames } from "../src/entities/credits";
import { SPECIES } from "../src/entities/species";
import { VILLAGE_NPCS } from "../src/entities/village";

describe("entities/credits.ts(plan/ending-sequence.md)", () => {
  it("CREDIT_REGIONSはdesign/regions.mdの8地方ぶんある", () => {
    expect(CREDIT_REGIONS).toHaveLength(8);
    expect(CREDIT_REGIONS[0]).toBe("うたたねの参道");
    expect(CREDIT_REGIONS.at(-1)).toBe("めざめの前庭");
  });

  it("creditVillagerNamesは既存のVILLAGE_NPCSから生成する(二重管理を避ける)", () => {
    const names = creditVillagerNames();
    expect(names).toEqual(VILLAGE_NPCS.map((npc) => npc.name));
    expect(names).toContain("モグラ婆");
  });

  it("creditMonsterNamesは既存のSPECIESから生成する(モンスター追加時の手作業更新が不要)", () => {
    const names = creditMonsterNames();
    expect(names).toEqual(SPECIES.map((s) => s.name));
    expect(names.length).toBe(SPECIES.length);
  });
});
