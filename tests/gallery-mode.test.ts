import { describe, expect, it } from "vitest";
import { HAJIME_NO_YUME_ID, SPECIES } from "../src/entities/species";
import { SPECIES_LORE, speciesLore } from "../src/entities/speciesLore";

describe("entities/speciesLore.ts", () => {
  it("最初の5種(design/characters.mdでカバーされている)は解説文を持つ", () => {
    for (const id of ["purun", "gajiri", "tsubute", "madoromi", "honegarami"]) {
      expect(speciesLore(id)).toBeTruthy();
    }
  });

  it("plan/archive/species-lore-expansion.mdで追加した種族も解説文を持つ", () => {
    for (const id of [
      "surigarasu",
      "yumekuimogura",
      "oonebosuke",
      "nushigaeru",
      "oomadoromi",
      "honezukaNoNushi",
      "fuchiNoNushi",
      "kodamaNoNushi",
      "misemonoNoNushi",
      "horikuiNoNushi",
      "yorishironozankyo",
    ]) {
      expect(speciesLore(id)).toBeTruthy();
    }
  });

  it("隠し最終局面(はじめの夢)も解説文を持つ", () => {
    expect(speciesLore(HAJIME_NO_YUME_ID)).toBeTruthy();
  });

  it("未知のidはundefined", () => {
    expect(speciesLore("みしらぬもの")).toBeUndefined();
  });

  it("SPECIESに実在する種族idは、すべて解説文を持つ(全68種を網羅している)", () => {
    for (const s of SPECIES) {
      expect(speciesLore(s.id), `${s.id} の解説文が無い`).toBeTruthy();
    }
  });

  it("解説文を持つ種族は、いずれも実在の種族idである", () => {
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of Object.keys(SPECIES_LORE)) {
      expect(ids.has(id), `${id} はSPECIESに存在しない`).toBe(true);
    }
  });
});
