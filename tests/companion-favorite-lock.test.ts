import { describe, expect, it } from "vitest";
import { HOKORA_DUST_DEF_ID } from "../src/entities/forging";
import {
  fuseMonsters,
  initialSave,
  releaseCompanion,
  toggleFavorite,
  loadSave,
  type StoredMonster,
} from "../src/save";

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    ...overrides,
  };
}

function withMockedLocalStorage(run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

describe("save.ts: toggleFavorite(plan/companion-favorite-lock.md)", () => {
  it("favoriteを持たない個体はtrueに、trueの個体はfalseに切り替わる", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 })] };

    const withFavorite = toggleFavorite(save, 1);
    expect(withFavorite?.hut[0]?.favorite).toBe(true);

    const withoutFavorite = toggleFavorite(withFavorite!, 1);
    expect(withoutFavorite?.hut[0]?.favorite).toBe(false);
  });

  it("存在しないuidを指定するとnullを返す(何もしない)", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 })] };
    expect(toggleFavorite(save, 999)).toBeNull();
  });

  it("他の個体には影響しない", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 }), stored({ uid: 2, speciesId: "purun" })] };
    const next = toggleFavorite(save, 1);
    expect(next?.hut.find((m) => m.uid === 2)?.favorite).toBeUndefined();
  });
});

describe("save.ts: お気に入りロックがreleaseCompanion(夢に還す)を防ぐ", () => {
  it("favorite: trueの個体はhutから取り除かれない", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1, favorite: true })] };
    const before = save.storage.filter((s) => s.defId === HOKORA_DUST_DEF_ID).length;

    const next = releaseCompanion(save, 1);

    expect(next).toBe(save);
    expect(next.hut).toHaveLength(1);
    expect(next.storage.filter((s) => s.defId === HOKORA_DUST_DEF_ID).length).toBe(before);
  });

  it("お気に入りを外せば通常通り夢に還せる", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1, favorite: true })] };
    const unlocked = toggleFavorite(save, 1)!;

    const next = releaseCompanion(unlocked, 1);

    expect(next.hut).toHaveLength(0);
  });
});

describe("save.ts: お気に入りロックがfuseMonsters(夢あわせ)の糧側を防ぐ", () => {
  it("糧がfavorite: trueならnullを返し、hutは変化しない", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [stored({ uid: 1, speciesId: "gajiri" }), stored({ uid: 2, speciesId: "purun", favorite: true })],
    };

    const result = fuseMonsters(save, 1, 2);

    expect(result).toBeNull();
  });

  it("軸がfavorite: trueでも制限しない(軸は消えないため)", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", favorite: true }),
        stored({ uid: 2, speciesId: "purun" }),
      ],
    };

    const result = fuseMonsters(save, 1, 2);

    expect(result).not.toBeNull();
    expect(result?.save.hut.some((m) => m.uid === 2)).toBe(false);
    expect(result?.save.hut.some((m) => m.uid === 1)).toBe(true);
  });

  it("糧のfavoriteを外せば通常通り夢あわせできる", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [stored({ uid: 1, speciesId: "gajiri" }), stored({ uid: 2, speciesId: "purun", favorite: true })],
    };
    const unlocked = toggleFavorite(save, 2)!;

    const result = fuseMonsters(unlocked, 1, 2);

    expect(result).not.toBeNull();
  });
});

describe("save.ts: 壊れたセーブデータのfavorite", () => {
  it("favorite: falseは保存されず、キー自体を持たない(既定のundefined相当)", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          hut: [
            { uid: 1, speciesId: "gajiri", level: 1, skills: [], favorite: false },
            { uid: 2, speciesId: "gajiri", level: 1, skills: [], favorite: "みしらぬ値" },
          ],
        }),
      );
      const loaded = loadSave();
      expect(loaded.hut[0]?.favorite).toBeUndefined();
      expect(loaded.hut[1]?.favorite).toBeUndefined();
    });
  });

  it("favorite: trueは保持される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          hut: [{ uid: 1, speciesId: "gajiri", level: 1, skills: [], favorite: true }],
        }),
      );
      const loaded = loadSave();
      expect(loaded.hut[0]?.favorite).toBe(true);
    });
  });
});
