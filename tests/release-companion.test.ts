import { describe, expect, it } from "vitest";
import { HOKORA_DUST_DEF_ID } from "../src/entities/forging";
import { RELEASE_COMPANION_HOKORA_DUST, initialSave, releaseCompanion, type StoredMonster } from "../src/save";

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return { uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [], bondSuccessCount: 0, ...overrides };
}

describe("save.ts: 夢に還す(releaseCompanion)", () => {
  it("hutから取り除かれ、ごくわずかなほこら粉を残す", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 }), stored({ uid: 2, speciesId: "purun" })] };
    const before = save.storage.filter((s) => s.defId === HOKORA_DUST_DEF_ID).length;

    save = releaseCompanion(save, 1);

    expect(save.hut).toEqual([stored({ uid: 2, speciesId: "purun" })]);
    const after = save.storage.filter((s) => s.defId === HOKORA_DUST_DEF_ID).length;
    expect(after - before).toBe(RELEASE_COMPANION_HOKORA_DUST);
  });

  it("存在しないuidを指定しても何も起きない", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 })] };
    const next = releaseCompanion(save, 999);
    expect(next).toBe(save);
  });

  it("図鑑の記録には影響しない(hutとは独立)", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [stored({ uid: 1, speciesId: "gajiri" })],
      compendium: { gajiri: "captured" },
    };
    save = releaseCompanion(save, 1);
    expect(save.compendium.gajiri).toBe("captured");
  });
});
