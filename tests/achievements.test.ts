import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, achievementDef } from "../src/entities/achievements";
import { MARKS, MAX_PLUS } from "../src/entities/forging";
import { SPECIES } from "../src/entities/species";
import {
  checkAchievements,
  initialSave,
  loadSave,
  markSpeciesCaptured,
  setEquippedTitle,
  unlockAchievement,
  type SaveData,
  type StoredItem,
} from "../src/save";

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

describe("entities/achievements.ts", () => {
  it("すべての実績が一意なidを持つ", () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
  });

  it("achievementDefは存在するidだけ解決できる", () => {
    expect(achievementDef("compendiumFull")?.title).toBe("図鑑の達人");
    expect(achievementDef("みしらぬ実績")).toBeUndefined();
  });
});

describe("save.ts: unlockAchievement", () => {
  it("未知のidは記録しない", () => {
    withMockedLocalStorage(() => {
      const save = initialSave();
      const next = unlockAchievement(save, "みしらぬ実績");
      expect(next).toBe(save);
    });
  });

  it("一度記録すると、日時が変わらず据え置かれる(取り消されない)", () => {
    withMockedLocalStorage(() => {
      let save = initialSave();
      save = unlockAchievement(save, "clear1");
      const firstDate = save.achievements["clear1"];
      expect(firstDate).toBeDefined();
      save = unlockAchievement(save, "clear1");
      expect(save.achievements["clear1"]).toBe(firstDate);
    });
  });
});

describe("save.ts: checkAchievements", () => {
  it("累計撃破・捕獲のしきい値を満たすと実績が付く", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = { ...initialSave(), records: { totalDefeats: 50, totalCaptures: 10 } };
      save = checkAchievements(save);
      expect(save.achievements["defeats50"]).toBeDefined();
      expect(save.achievements["captures10"]).toBeDefined();
    });
  });

  it("踏破回数・最高レベルのしきい値を満たすと実績が付く", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = { ...initialSave(), clears: 1, bestLevel: 10 };
      save = checkAchievements(save);
      expect(save.achievements["clear1"]).toBeDefined();
      expect(save.achievements["level10"]).toBeDefined();
    });
  });

  it("図鑑を半分・全部埋めると、それぞれの実績が付く", () => {
    withMockedLocalStorage(() => {
      let save = initialSave();
      const half = SPECIES.slice(0, Math.ceil(SPECIES.length / 2));
      for (const s of half) save = markSpeciesCaptured(save, s.id);
      save = checkAchievements(save);
      expect(save.achievements["compendiumHalf"]).toBeDefined();
      expect(save.achievements["compendiumFull"]).toBeUndefined();

      for (const s of SPECIES) save = markSpeciesCaptured(save, s.id);
      save = checkAchievements(save);
      expect(save.achievements["compendiumFull"]).toBeDefined();
    });
  });

  it("倉庫に+9の武器・盾があれば、maxPlusReachedが付く", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = { ...initialSave(), storage: [{ defId: "hatchet", plus: MAX_PLUS }] };
      save = checkAchievements(save);
      expect(save.achievements["maxPlusReached"]).toBeDefined();
    });
  });

  it("倉庫と持ち込み品を合わせて5種類すべての印が揃うと、allMarksForgedが付く", () => {
    withMockedLocalStorage(() => {
      const forged: StoredItem[] = MARKS.map((m, i) => ({ defId: "hatchet", markId: m.id, charges: i }));
      // 1つは倉庫、残りは持ち込み品(まだ倉庫に戻っていない)側にある想定
      let save: SaveData = { ...initialSave(), storage: [forged[0]!] };
      save = checkAchievements(save, forged.slice(1));
      expect(save.achievements["allMarksForged"]).toBeDefined();
    });
  });

  it("しきい値を満たさなければ何も付かない", () => {
    withMockedLocalStorage(() => {
      const save = checkAchievements(initialSave());
      expect(Object.keys(save.achievements)).toHaveLength(0);
    });
  });
});

describe("save.ts: setEquippedTitle", () => {
  it("称号を持つ達成済み実績は装備できる", () => {
    withMockedLocalStorage(() => {
      let save = unlockAchievement(initialSave(), "clear1");
      save = setEquippedTitle(save, "clear1");
      expect(save.equippedTitle).toBe("clear1");
      save = setEquippedTitle(save, undefined);
      expect(save.equippedTitle).toBeUndefined();
    });
  });

  it("未達成、または称号を持たない実績は装備できない", () => {
    withMockedLocalStorage(() => {
      const save = initialSave();
      // 未達成
      expect(setEquippedTitle(save, "clear1")).toBe(save);
      // 達成済みだが称号を持たない実績(例: defeats50)
      const unlocked = unlockAchievement(save, "defeats50");
      expect(setEquippedTitle(unlocked, "defeats50")).toBe(unlocked);
    });
  });
});

describe("save.ts: 壊れたセーブデータのachievements/equippedTitle", () => {
  it("未知のid・不正な形式は捨てる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({
          achievements: { clear1: "2026-01-01T00:00:00.000Z", みしらぬ実績: "2026-01-01T00:00:00.000Z" },
          equippedTitle: "みしらぬ実績",
        }),
      );
      const loaded = loadSave();
      expect(loaded.achievements).toEqual({ clear1: "2026-01-01T00:00:00.000Z" });
      // equippedTitleは未達成扱い(みしらぬ実績はachievementsから除外済み)なのでundefined
      expect(loaded.equippedTitle).toBeUndefined();
    });
  });

  it("称号を持たない実績をequippedTitleに指定していた場合は捨てる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({
          achievements: { defeats50: "2026-01-01T00:00:00.000Z" },
          equippedTitle: "defeats50",
        }),
      );
      const loaded = loadSave();
      expect(loaded.equippedTitle).toBeUndefined();
    });
  });
});
