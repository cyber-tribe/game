import { describe, expect, it } from "vitest";
import { initialSave, loadSave, type SaveData } from "../src/save";
import v1 from "./fixtures/save/v1-initial.json";
import v2 from "./fixtures/save/v2-difficulty-and-shops.json";
import v3 from "./fixtures/save/v3-quest-board.json";
import v4 from "./fixtures/save/v4-multi-dungeon-and-village.json";
import v5 from "./fixtures/save/v5-costumes.json";

/**
 * セーブデータの後方互換チェック(plan/save-compat-testing.md)。
 * 過去の主要な節目を模したフィクスチャを読み込み、その世代で存在していた
 * フィールドが保持され、まだ存在しなかったフィールドは initialSave() と
 * 同じ既定値になることを確認する。フィクスチャは一度追加したら削除しない。
 */

function withMockedLocalStorage(raw: unknown, run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  store.set("garudo-dungeon/v1", JSON.stringify(raw));
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

const DEFAULTS = initialSave();

describe("save-compat: v1-initial(難易度モード以前)", () => {
  it("その世代のフィールドが保持される", () => {
    withMockedLocalStorage(v1, () => {
      const loaded = loadSave();
      expect(loaded.deepest).toBe(v1.deepest);
      expect(loaded.runs).toBe(v1.runs);
      expect(loaded.clears).toBe(v1.clears);
      expect(loaded.bestLevel).toBe(v1.bestLevel);
      expect(loaded.storage).toEqual(v1.storage);
      expect(loaded.knownCheckpoints).toEqual(v1.knownCheckpoints);
      expect(loaded.seenTutorialTips).toEqual(v1.seenTutorialTips);
      expect(loaded.trainingFocus).toBe(v1.trainingFocus);
      expect(loaded.nextHutUid).toBe(v1.nextHutUid);
      expect(loaded.records).toEqual(v1.records);
      expect(loaded.compendium).toEqual(v1.compendium);
      expect(loaded.achievements).toEqual(v1.achievements);
      expect(loaded.equipmentCompendium).toEqual(v1.equipmentCompendium);
      expect(loaded.markCompendium).toEqual(v1.markCompendium);
      expect(loaded.materialCompendium).toEqual(v1.materialCompendium);
    });
  });

  it("なじみ成長・進化(companion-bond-growth.md/companion-evolution.md)以前のhutは、その2フィールドが既定値で補われる", () => {
    withMockedLocalStorage(v1, () => {
      const loaded = loadSave();
      expect(loaded.hut).toHaveLength(v1.hut.length);
      for (const [i, m] of loaded.hut.entries()) {
        expect(m.uid).toBe(v1.hut[i]!.uid);
        expect(m.speciesId).toBe(v1.hut[i]!.speciesId);
        expect(m.bondSuccessCount).toBe(0);
        expect(m.recentFusionMaterials).toEqual([]);
      }
    });
  });

  it("まだ存在しなかったフィールドはinitialSave()と同じ既定値になる", () => {
    withMockedLocalStorage(v1, () => {
      const loaded = loadSave();
      expect(loaded.equippedTitle).toBeUndefined();
      expect(loaded.difficulty).toBe(DEFAULTS.difficulty);
      expect(loaded.gold).toBe(DEFAULTS.gold);
      expect(loaded.boardDate).toBe(DEFAULTS.boardDate);
      expect(loaded.boardOffers).toEqual(DEFAULTS.boardOffers);
      expect(loaded.activeQuests).toEqual(DEFAULTS.activeQuests);
      expect(loaded.completedQuestIds).toEqual(DEFAULTS.completedQuestIds);
      expect(loaded.nightlyDreamBestDepth).toBe(DEFAULTS.nightlyDreamBestDepth);
      expect(loaded.villageStage).toBe(DEFAULTS.villageStage);
      expect(loaded.fontSize).toBe(DEFAULTS.fontSize);
      expect(loaded.unlockedCostumes).toEqual(DEFAULTS.unlockedCostumes);
      expect(loaded.equippedCostume).toBe(DEFAULTS.equippedCostume);
    });
  });
});

describe("save-compat: v2-difficulty-and-shops(難易度モード・所持金導入後)", () => {
  it("difficulty・goldを含め、その世代のフィールドが保持される", () => {
    withMockedLocalStorage(v2, () => {
      const loaded = loadSave();
      expect(loaded.difficulty).toBe(v2.difficulty);
      expect(loaded.gold).toBe(v2.gold);
      expect(loaded.hut).toEqual(v2.hut);
      expect(loaded.compendium).toEqual(v2.compendium);
      expect(loaded.achievements).toEqual(v2.achievements);
    });
  });

  it("依頼板(quest-board.md)以降のフィールドはまだ既定値のまま", () => {
    withMockedLocalStorage(v2, () => {
      const loaded = loadSave();
      expect(loaded.boardDate).toBe(DEFAULTS.boardDate);
      expect(loaded.boardOffers).toEqual(DEFAULTS.boardOffers);
      expect(loaded.activeQuests).toEqual(DEFAULTS.activeQuests);
      expect(loaded.completedQuestIds).toEqual(DEFAULTS.completedQuestIds);
      expect(loaded.villageStage).toBe(DEFAULTS.villageStage);
      expect(loaded.unlockedCostumes).toEqual(DEFAULTS.unlockedCostumes);
    });
  });
});

describe("save-compat: v3-quest-board(依頼板導入後)", () => {
  it("依頼板まわりのフィールドが保持される", () => {
    withMockedLocalStorage(v3, () => {
      const loaded = loadSave();
      expect(loaded.boardDate).toBe(v3.boardDate);
      expect(loaded.boardOffers).toEqual(v3.boardOffers);
      expect(loaded.activeQuests).toEqual(v3.activeQuests);
      expect(loaded.completedQuestIds).toEqual(v3.completedQuestIds);
      expect(loaded.equippedTitle).toBe(v3.equippedTitle);
    });
  });

  it("複数のダンジョン・村の発展以降のフィールドはまだ既定値のまま", () => {
    withMockedLocalStorage(v3, () => {
      const loaded = loadSave();
      expect(loaded.nightlyDreamBestDepth).toBe(DEFAULTS.nightlyDreamBestDepth);
      expect(loaded.villageStage).toBe(DEFAULTS.villageStage);
      expect(loaded.fontSize).toBe(DEFAULTS.fontSize);
      expect(loaded.unlockedCostumes).toEqual(DEFAULTS.unlockedCostumes);
      expect(loaded.equippedCostume).toBe(DEFAULTS.equippedCostume);
    });
  });
});

describe("save-compat: v4-multi-dungeon-and-village(複数のダンジョン・村の発展導入後)", () => {
  it("nightlyDreamBestDepth・villageStage・fontSizeが保持される", () => {
    withMockedLocalStorage(v4, () => {
      const loaded = loadSave();
      expect(loaded.nightlyDreamBestDepth).toBe(v4.nightlyDreamBestDepth);
      expect(loaded.villageStage).toBe(v4.villageStage);
      expect(loaded.fontSize).toBe(v4.fontSize);
      expect(loaded.gold).toBe(v4.gold);
      expect(loaded.hut).toEqual(v4.hut);
    });
  });

  it("衣装(costumes.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v4, () => {
      const loaded = loadSave();
      expect(loaded.unlockedCostumes).toEqual(DEFAULTS.unlockedCostumes);
      expect(loaded.equippedCostume).toBe(DEFAULTS.equippedCostume);
    });
  });
});

describe("save-compat: v5-costumes(現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v5, () => {
      const loaded = loadSave();
      const expected: SaveData = v5 as SaveData;
      expect(loaded.unlockedCostumes).toEqual(expected.unlockedCostumes);
      expect(loaded.equippedCostume).toBe(expected.equippedCostume);
      expect(loaded.villageStage).toBe(expected.villageStage);
      expect(loaded.fontSize).toBe(expected.fontSize);
      expect(loaded.nightlyDreamBestDepth).toBe(expected.nightlyDreamBestDepth);
      expect(loaded.gold).toBe(expected.gold);
      expect(loaded.hut).toEqual(expected.hut);
      expect(loaded.compendium).toEqual(expected.compendium);
      expect(loaded.achievements).toEqual(expected.achievements);
    });
  });
});
