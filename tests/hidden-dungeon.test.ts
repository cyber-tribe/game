import { describe, expect, it } from "vitest";
import { TRIAL_CHAMBER_ID, dungeonById, isDungeonUnlocked } from "../src/entities/dungeons";
import { REGION_BOSS_ORDER } from "../src/entities/species";
import { Game } from "../src/game";
import { recordRun, type SaveData } from "../src/save";

describe("entities/dungeons.ts: 腕試しの間(plan/hidden-dungeon.md)", () => {
  it("村の発展段階4未満だと未解放", () => {
    const trial = dungeonById(TRIAL_CHAMBER_ID);
    expect(isDungeonUnlocked(trial, 999, 3)).toBe(false);
    expect(isDungeonUnlocked(trial, 999, 4)).toBe(true);
  });

  it("最深到達記録には左右されない(村の発展段階だけが条件)", () => {
    const trial = dungeonById(TRIAL_CHAMBER_ID);
    expect(isDungeonUnlocked(trial, 0, 4)).toBe(true);
  });

  it("maxDepthは実装済みの地方ボスの数と一致する", () => {
    const trial = dungeonById(TRIAL_CHAMBER_ID);
    expect(trial.maxDepth).toBe(REGION_BOSS_ORDER.length);
  });
});

describe("game.ts: 腕試しの間の各階は、地方ボスの出現順どおりの再戦になる", () => {
  it("1階は最初の地方ボスの階になる(野生モンスターなし)", () => {
    const game = new Game({ seed: 1, dungeonId: TRIAL_CHAMBER_ID });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe(REGION_BOSS_ORDER[0]);
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, dungeonId: TRIAL_CHAMBER_ID });
    expect(game.floor.gimmick).toBeUndefined();
  });
});

describe("save.ts: recordRunは腕試しの間の踏破を記録する(plan/hidden-dungeon.md)", () => {
  function baseSave(): SaveData {
    return {
      deepest: 40,
      runs: 10,
      clears: 5,
      bestLevel: 20,
      storage: [],
      knownCheckpoints: [1],
      seenTutorialTips: [],
      trainingFocus: "balance",
      hut: [],
      nextHutUid: 1,
      records: { totalDefeats: 0, totalCaptures: 0 },
      compendium: {},
      achievements: {},
      equipmentCompendium: {},
      markCompendium: {},
      materialCompendium: {},
      difficulty: "normal",
      gold: 0,
      boardDate: "",
      boardOffers: [],
      activeQuests: [],
      completedQuestIds: [],
      nightlyDreamBestDepth: 0,
      villageStage: 4,
      fontSize: "normal",
      unlockedCostumes: ["default"],
      equippedCostume: "default",
      arenaRecords: [],
      bonds: {},
      seenVillageEvents: [],
      lastGiftDates: {},
      foundVaultPassages: [],
      lastPlayedAt: new Date(0).toISOString(),
      defeatedRegionBosses: [],
      storyCleared: false,
      trueAwakeningCleared: false,
    };
  }

  it("踏破すると記録が1件積まれる", () => {
    const save = baseSave();
    const next = recordRun(save, {
      depth: 1,
      level: 20,
      cleared: true,
      broughtBack: [],
      dungeonId: TRIAL_CHAMBER_ID,
      turns: 50,
      damageTaken: 25,
    });
    expect(next.arenaRecords).toHaveLength(1);
    expect(next.arenaRecords[0]!.turns).toBe(50);
    expect(next.arenaRecords[0]!.damageTaken).toBe(25);
  });

  it("記録は積み上がる一方で、既存の記録は消えない", () => {
    let save = baseSave();
    save = {
      ...save,
      arenaRecords: [{ clearedAt: "2026-01-01T00:00:00.000Z", turns: 60, damageTaken: 40 }],
    };
    const next = recordRun(save, {
      depth: 1,
      level: 20,
      cleared: true,
      broughtBack: [],
      dungeonId: TRIAL_CHAMBER_ID,
      turns: 30,
      damageTaken: 10,
    });
    expect(next.arenaRecords).toHaveLength(2);
    expect(next.arenaRecords[0]!.turns).toBe(60);
    expect(next.arenaRecords[1]!.turns).toBe(30);
  });

  it("全滅時は記録されない", () => {
    const save = baseSave();
    const next = recordRun(save, {
      depth: 1,
      level: 20,
      cleared: false,
      broughtBack: [],
      dungeonId: TRIAL_CHAMBER_ID,
      turns: 20,
      damageTaken: 100,
    });
    expect(next.arenaRecords).toHaveLength(0);
  });

  it("表の寝穴の踏破では記録されない(腕試しの間だけの記録)", () => {
    const save = baseSave();
    const next = recordRun(save, {
      depth: 10,
      level: 20,
      cleared: true,
      broughtBack: [],
    });
    expect(next.arenaRecords).toHaveLength(0);
  });
});
