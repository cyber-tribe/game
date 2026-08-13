import { describe, expect, it } from "vitest";
import { initialSave, loadSave } from "../src/save";
import v1 from "./fixtures/save/v1-initial.json";
import v2 from "./fixtures/save/v2-difficulty-and-shops.json";
import v3 from "./fixtures/save/v3-quest-board.json";
import v4 from "./fixtures/save/v4-multi-dungeon-and-village.json";
import v5 from "./fixtures/save/v5-costumes.json";
import v6 from "./fixtures/save/v6-hidden-dungeon.json";
import v7 from "./fixtures/save/v7-village-life.json";
import v8 from "./fixtures/save/v8-lost-and-found-vault.json";
import v9 from "./fixtures/save/v9-mountain-core.json";
import v10 from "./fixtures/save/v10-true-awakening.json";
import v11 from "./fixtures/save/v11-audio-playback.json";
import v12 from "./fixtures/save/v12-settings-screen.json";
import v13 from "./fixtures/save/v13-tarukurabe-minigame.json";
import v14 from "./fixtures/save/v14-i18n-foundation.json";
import { withMockedLocalStorage } from "./helpers/localStorage";

/**
 * セーブデータの後方互換チェック(plan/save-compat-testing.md)。
 * 過去の主要な節目を模したフィクスチャを読み込み、その世代で存在していた
 * フィールドが保持され、まだ存在しなかったフィールドは initialSave() と
 * 同じ既定値になることを確認する。フィクスチャは一度追加したら削除しない。
 */

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

describe("save-compat: v5-costumes(衣装導入後、腕試しの間導入以前)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v5, () => {
      const loaded = loadSave();
      expect(loaded.unlockedCostumes).toEqual(v5.unlockedCostumes);
      expect(loaded.equippedCostume).toBe(v5.equippedCostume);
      expect(loaded.villageStage).toBe(v5.villageStage);
      expect(loaded.fontSize).toBe(v5.fontSize);
      expect(loaded.nightlyDreamBestDepth).toBe(v5.nightlyDreamBestDepth);
      expect(loaded.gold).toBe(v5.gold);
      expect(loaded.hut).toEqual(v5.hut);
      expect(loaded.compendium).toEqual(v5.compendium);
      expect(loaded.achievements).toEqual(v5.achievements);
    });
  });

  it("腕試しの間(hidden-dungeon.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v5, () => {
      const loaded = loadSave();
      expect(loaded.arenaRecords).toEqual(DEFAULTS.arenaRecords);
    });
  });
});

describe("save-compat: v6-hidden-dungeon(腕試しの間導入後、村の暮らし導入以前)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v6, () => {
      const loaded = loadSave();
      expect(loaded.arenaRecords).toEqual(v6.arenaRecords);
      expect(loaded.unlockedCostumes).toEqual(v6.unlockedCostumes);
      expect(loaded.villageStage).toBe(v6.villageStage);
      expect(loaded.hut).toEqual(v6.hut);
      expect(loaded.compendium).toEqual(v6.compendium);
      expect(loaded.achievements).toEqual(v6.achievements);
    });
  });

  it("村の暮らし(village-life.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v6, () => {
      const loaded = loadSave();
      expect(loaded.bonds).toEqual(DEFAULTS.bonds);
      expect(loaded.seenVillageEvents).toEqual(DEFAULTS.seenVillageEvents);
      expect(loaded.lastGiftDates).toEqual(DEFAULTS.lastGiftDates);
    });
  });
});

describe("save-compat: v7-village-life(村の暮らし導入後、忘れ物蔵導入以前)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v7, () => {
      const loaded = loadSave();
      expect(loaded.bonds).toEqual(v7.bonds);
      expect(loaded.seenVillageEvents).toEqual(v7.seenVillageEvents);
      expect(loaded.lastGiftDates).toEqual(v7.lastGiftDates);
      expect(loaded.arenaRecords).toEqual(v7.arenaRecords);
      expect(loaded.unlockedCostumes).toEqual(v7.unlockedCostumes);
      expect(loaded.villageStage).toBe(v7.villageStage);
      expect(loaded.hut).toEqual(v7.hut);
      expect(loaded.compendium).toEqual(v7.compendium);
      expect(loaded.achievements).toEqual(v7.achievements);
    });
  });

  it("忘れ物蔵(lost-and-found-vault.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v7, () => {
      const loaded = loadSave();
      expect(loaded.foundVaultPassages).toEqual(DEFAULTS.foundVaultPassages);
    });
  });
});

describe("save-compat: v8-lost-and-found-vault(忘れ物蔵導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v8, () => {
      const loaded = loadSave();
      expect(loaded.foundVaultPassages).toEqual(v8.foundVaultPassages);
      expect(loaded.bonds).toEqual(v8.bonds);
      expect(loaded.seenVillageEvents).toEqual(v8.seenVillageEvents);
      expect(loaded.lastGiftDates).toEqual(v8.lastGiftDates);
      expect(loaded.arenaRecords).toEqual(v8.arenaRecords);
      expect(loaded.unlockedCostumes).toEqual(v8.unlockedCostumes);
      expect(loaded.villageStage).toBe(v8.villageStage);
      expect(loaded.hut).toEqual(v8.hut);
      expect(loaded.compendium).toEqual(v8.compendium);
      expect(loaded.achievements).toEqual(v8.achievements);
    });
  });

  it("山の芯(mountain-core.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v8, () => {
      const loaded = loadSave();
      expect(loaded.defeatedRegionBosses).toEqual(DEFAULTS.defeatedRegionBosses);
      expect(loaded.storyCleared).toBe(DEFAULTS.storyCleared);
    });
  });
});

describe("save-compat: v9-mountain-core(山の芯導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v9, () => {
      const loaded = loadSave();
      expect(loaded.defeatedRegionBosses).toEqual(v9.defeatedRegionBosses);
      expect(loaded.storyCleared).toBe(v9.storyCleared);
      expect(loaded.foundVaultPassages).toEqual(v9.foundVaultPassages);
      expect(loaded.lastPlayedAt).toBe(v9.lastPlayedAt);
    });
  });

  it("真の目覚め(true-awakening.md)導入以前は既定値のまま", () => {
    withMockedLocalStorage(v9, () => {
      const loaded = loadSave();
      expect(loaded.trueAwakeningCleared).toBe(DEFAULTS.trueAwakeningCleared);
    });
  });
});

describe("save-compat: v10-true-awakening(真の目覚め導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v10, () => {
      const loaded = loadSave();
      expect(loaded.trueAwakeningCleared).toBe(v10.trueAwakeningCleared);
      expect(loaded.defeatedRegionBosses).toEqual(v10.defeatedRegionBosses);
      expect(loaded.storyCleared).toBe(v10.storyCleared);
      expect(loaded.compendium).toEqual(v10.compendium);
      expect(loaded.achievements).toEqual(v10.achievements);
      expect(loaded.equippedTitle).toBe(v10.equippedTitle);
    });
  });

  it("サウンド再生(plan/audio-playback.md)以前のセーブは、ミュート・音量が既定値で補われる", () => {
    withMockedLocalStorage(v10, () => {
      const loaded = loadSave();
      expect(loaded.audioMuted).toBe(DEFAULTS.audioMuted);
      expect(loaded.audioVolume).toBe(DEFAULTS.audioVolume);
    });
  });
});

describe("save-compat: v11-audio-playback(サウンド再生導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v11, () => {
      const loaded = loadSave();
      expect(loaded.audioMuted).toBe(v11.audioMuted);
      expect(loaded.audioVolume).toBe(v11.audioVolume);
      expect(loaded.trueAwakeningCleared).toBe(v11.trueAwakeningCleared);
    });
  });

  it("設定画面(plan/settings-screen.md)以前のセーブは、messageSpeedが既定値で補われる", () => {
    withMockedLocalStorage(v11, () => {
      const loaded = loadSave();
      expect(loaded.messageSpeed).toBe(DEFAULTS.messageSpeed);
    });
  });
});

describe("save-compat: v12-settings-screen(設定画面導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v12, () => {
      const loaded = loadSave();
      expect(loaded.messageSpeed).toBe(v12.messageSpeed);
      expect(loaded.audioMuted).toBe(v12.audioMuted);
      expect(loaded.trueAwakeningCleared).toBe(v12.trueAwakeningCleared);
    });
  });

  it("樽比べ(plan/tarukurabe-minigame.md)以前のセーブは、tarukurabeBestScoreが既定値で補われる", () => {
    withMockedLocalStorage(v12, () => {
      const loaded = loadSave();
      expect(loaded.tarukurabeBestScore).toBe(DEFAULTS.tarukurabeBestScore);
    });
  });
});

describe("save-compat: v13-tarukurabe-minigame(樽比べ導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v13, () => {
      const loaded = loadSave();
      expect(loaded.tarukurabeBestScore).toBe(v13.tarukurabeBestScore);
      expect(loaded.messageSpeed).toBe(v13.messageSpeed);
      expect(loaded.achievements.tarukurabePerfect).toBe(v13.achievements.tarukurabePerfect);
    });
  });

  it("多言語対応の土台(plan/i18n-foundation.md)以前のセーブは、localeが既定値で補われる", () => {
    withMockedLocalStorage(v13, () => {
      const loaded = loadSave();
      expect(loaded.locale).toBe(DEFAULTS.locale);
    });
  });
});

describe("save-compat: v14-i18n-foundation(多言語対応の土台導入後、現行の全フィールド)", () => {
  it("すべてのフィールドが保持される", () => {
    withMockedLocalStorage(v14, () => {
      const loaded = loadSave();
      expect(loaded.locale).toBe(v14.locale);
      expect(loaded.tarukurabeBestScore).toBe(v14.tarukurabeBestScore);
      expect(loaded.messageSpeed).toBe(v14.messageSpeed);
      expect(loaded.achievements.tarukurabePerfect).toBe(v14.achievements.tarukurabePerfect);
    });
  });
});
