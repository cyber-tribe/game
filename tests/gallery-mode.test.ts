import { describe, expect, it } from "vitest";
import { SPECIES } from "../src/entities/species";
import { speciesLore } from "../src/entities/speciesLore";

describe("entities/speciesLore.ts", () => {
  it("最初の5種(design/characters.mdでカバーされている)は解説文を持つ", () => {
    for (const id of ["purun", "gajiri", "tsubute", "madoromi", "honegarami"]) {
      expect(speciesLore(id)).toBeTruthy();
    }
  });

  it("design/characters.mdに記載の無い種族は解説文を持たない(未記載として扱う)", () => {
    expect(speciesLore("surigarasu")).toBeUndefined();
    expect(speciesLore("yumekuimogura")).toBeUndefined();
  });

  it("未知のidはundefined", () => {
    expect(speciesLore("みしらぬもの")).toBeUndefined();
  });

  it("解説文を持つ種族は、いずれも実在の種族idである", () => {
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of ["purun", "gajiri", "tsubute", "madoromi", "honegarami"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
