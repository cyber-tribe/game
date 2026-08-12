import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/dungeon/generate";
import {
  DUNGEONS,
  MAIN_CAVE_ID,
  MAIN_CAVE_MAX_DEPTH,
  NIGHTLY_DREAM_ID,
  dungeonById,
  isDungeonUnlocked,
} from "../src/entities/dungeons";
import { Game } from "../src/game";
import { initialSave, recordRun } from "../src/save";

describe("entities/dungeons.ts", () => {
  it("表の寝穴は常に解放済み", () => {
    const mainCave = dungeonById(MAIN_CAVE_ID);
    expect(isDungeonUnlocked(mainCave, 0, 1)).toBe(true);
  });

  it("近道屋の裏穴は最深到達記録が条件未満だと未解放", () => {
    const shortcut = dungeonById("shortcutBackHole");
    expect(shortcut.unlock).not.toBe("always");
    const minDeepest =
      shortcut.unlock !== "always" && "minDeepest" in shortcut.unlock ? shortcut.unlock.minDeepest : 0;
    expect(isDungeonUnlocked(shortcut, minDeepest - 1, 1)).toBe(false);
    expect(isDungeonUnlocked(shortcut, minDeepest, 1)).toBe(true);
  });

  it("夜ごとの夢は表の寝穴の踏破(最深MAIN_CAVE_MAX_DEPTH階)が条件", () => {
    const nightly = dungeonById(NIGHTLY_DREAM_ID);
    expect(isDungeonUnlocked(nightly, MAIN_CAVE_MAX_DEPTH - 1, 1)).toBe(false);
    expect(isDungeonUnlocked(nightly, MAIN_CAVE_MAX_DEPTH, 1)).toBe(true);
  });

  it("未知のidはエラーになる", () => {
    expect(() => dungeonById("みしらぬあな")).toThrow();
  });

  it("すべてのダンジョンにname/descriptionがある", () => {
    for (const d of DUNGEONS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});

describe("game.ts: RunOptions.dungeonIdによるmaxDepthの解決", () => {
  it("省略時は表の寝穴(maxDepth=10)", () => {
    const game = new Game({ seed: 1 });
    expect(game.maxDepth).toBe(MAIN_CAVE_MAX_DEPTH);
    expect(game.dungeonId).toBe(MAIN_CAVE_ID);
  });

  it("近道屋の裏穴はmaxDepth=5", () => {
    const game = new Game({ seed: 1, dungeonId: "shortcutBackHole" });
    expect(game.maxDepth).toBe(5);
    expect(game.dungeonId).toBe("shortcutBackHole");
  });

  it("夜ごとの夢はmaxDepthが無限大(踏破判定が発生しない)", () => {
    const game = new Game({ seed: 1, dungeonId: NIGHTLY_DREAM_ID });
    expect(game.maxDepth).toBe(Number.POSITIVE_INFINITY);
  });

  it("maxDepthを個別指定した場合はダンジョン既定より優先される", () => {
    const game = new Game({ seed: 1, dungeonId: "shortcutBackHole", maxDepth: 3 });
    expect(game.maxDepth).toBe(3);
  });

  it("toSnapshot/resumeでdungeonIdが引き継がれる", () => {
    const game = new Game({ seed: 1, dungeonId: "shortcutBackHole" });
    const snapshot = game.toSnapshot();
    expect(snapshot.dungeonId).toBe("shortcutBackHole");
    const resumed = new Game({ seed: 0, resume: snapshot });
    expect(resumed.dungeonId).toBe("shortcutBackHole");
    expect(resumed.maxDepth).toBe(5);
  });
});

describe("game.ts: floorOffsetによる出現テーブルのずれ", () => {
  it("表の寝穴の1階ではtsubute(minFloor:3)は出現しない", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game({ seed, dungeonId: MAIN_CAVE_ID, startDepth: 1 });
      const has = game.floor.actors.some((a) => a.kind === "monster" && a.speciesId === "tsubute");
      expect(has, `seed=${seed}`).toBe(false);
    }
  });

  it("近道屋の裏穴はfloorOffsetにより、1階でもtsubute(minFloor:3)が出現しうる", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const game = new Game({ seed, dungeonId: "shortcutBackHole", startDepth: 1 });
      found = game.floor.actors.some((a) => a.kind === "monster" && a.speciesId === "tsubute");
    }
    expect(found).toBe(true);
  });
});

describe("dungeon/generate.ts: forceShopオプション", () => {
  it("4階未満は通常なら出店が出ない(shopChance=0)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      expect(floor.rooms.some((r) => r.kind === "shop")).toBe(false);
    }
  });

  it("forceShop:trueなら、候補の部屋がある限り4階未満でも出店を出す", () => {
    let forcedCount = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1, forceShop: true });
      if (floor.rooms.some((r) => r.kind === "shop")) forcedCount++;
    }
    expect(forcedCount).toBeGreaterThan(0);
  });
});

describe("save.ts: recordRunとnightlyDreamBestDepth", () => {
  it("夜ごとの夢での到達階が自己ベストとして記録される", () => {
    let save = initialSave();
    expect(save.nightlyDreamBestDepth).toBe(0);
    save = recordRun(save, {
      depth: 12,
      level: 5,
      cleared: false,
      broughtBack: [],
      dungeonId: NIGHTLY_DREAM_ID,
    });
    expect(save.nightlyDreamBestDepth).toBe(12);
  });

  it("自己ベストを更新しない場合は元の値のまま", () => {
    let save = initialSave();
    save = { ...save, nightlyDreamBestDepth: 20 };
    save = recordRun(save, {
      depth: 5,
      level: 1,
      cleared: false,
      broughtBack: [],
      dungeonId: NIGHTLY_DREAM_ID,
    });
    expect(save.nightlyDreamBestDepth).toBe(20);
  });

  it("表の寝穴(dungeonId省略)のダイブでは更新されない", () => {
    let save = initialSave();
    save = recordRun(save, { depth: 8, level: 3, cleared: false, broughtBack: [] });
    expect(save.nightlyDreamBestDepth).toBe(0);
    // 通常のdeepestは従来どおり更新される
    expect(save.deepest).toBe(8);
  });
});
