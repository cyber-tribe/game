import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/domain/dungeon/generate";
import {
  DUNGEONS,
  ECHO_NEST_ID,
  HINATA_ID,
  MOUNTAIN_CORE_ID,
  MUDDY_DEPTHS_ID,
  NIGHTLY_DREAM_ID,
  REGION_DUNGEON_IDS,
  REGION_SIZE,
  TOTAL_REGION_FLOORS,
  TRIAL_CHAMBER_ID,
  TRUE_AWAKENING_ID,
  dungeonById,
  isDungeonUnlocked,
  regionIndexForDungeonId,
  regionIndexForFloor,
} from "../src/entities/dungeons";
import { REGION_BOSS_ORDER, REGIONS } from "../src/entities/regions";
import { Game } from "../src/application/dungeonRun/game";
import { initialSave, recordRun } from "../src/save";

const region1 = REGION_DUNGEON_IDS[0];

describe("entities/dungeons.ts", () => {
  it("第一地方はひなたの寝穴の踏破が条件(plan/game/tutorial-dungeon.md)", () => {
    const dungeon = dungeonById(region1);
    expect(isDungeonUnlocked(dungeon, 0, 1, 0, [], false)).toBe(false);
    expect(isDungeonUnlocked(dungeon, 0, 1, 0, [], true)).toBe(true);
  });

  it("近道屋の裏穴は最深到達記録が条件未満だと未解放", () => {
    const shortcut = dungeonById("shortcutBackHole");
    expect(shortcut.unlock).not.toBe("always");
    const minDeepest =
      shortcut.unlock !== "always" && "minDeepest" in shortcut.unlock ? shortcut.unlock.minDeepest : 0;
    expect(isDungeonUnlocked(shortcut, minDeepest - 1, 1)).toBe(false);
    expect(isDungeonUnlocked(shortcut, minDeepest, 1)).toBe(true);
  });

  it("夜ごとの夢は8地方すべてのボス撃破が条件", () => {
    const nightly = dungeonById(NIGHTLY_DREAM_ID);
    expect(isDungeonUnlocked(nightly, 0, 1, 0, REGION_BOSS_ORDER.slice(0, 7))).toBe(false);
    expect(isDungeonUnlocked(nightly, 0, 1, 0, REGION_BOSS_ORDER)).toBe(true);
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
  it("省略時は第一地方(maxDepth=REGION_SIZE)", () => {
    const game = new Game({ seed: 1 });
    expect(game.maxDepth).toBe(REGION_SIZE);
    expect(game.dungeonId).toBe(region1);
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
  it("第一地方の1階ではtsubute(minFloor:3)は出現しない", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game({ seed, dungeonId: region1, startDepth: 1 });
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

describe("entities/dungeons.ts: regionIndexForFloor(plan/models/archive/dungeon-region-detection.md)", () => {
  it("地方ダンジョン本体は各階でregionIndexForDungeonIdと一致する", () => {
    for (const id of REGION_DUNGEON_IDS) {
      const expected = regionIndexForDungeonId(id);
      for (let depth = 1; depth <= REGION_SIZE; depth++) {
        expect(regionIndexForFloor(id, depth)).toBe(expected);
      }
    }
  });

  it("ぬかるみの底・こだまの巣・山の芯・はじめの夢は流用元の地方番号を返す", () => {
    expect(regionIndexForFloor(MUDDY_DEPTHS_ID, 1)).toBe(2);
    expect(regionIndexForFloor(ECHO_NEST_ID, 1)).toBe(6);
    expect(regionIndexForFloor(MOUNTAIN_CORE_ID, 1)).toBe(8);
    expect(regionIndexForFloor(TRUE_AWAKENING_ID, 1)).toBe(8);
  });

  it("近道屋の裏穴は深さに応じて地方1→2の番号へ切り替わる", () => {
    expect(regionIndexForFloor("shortcutBackHole", 4)).toBe(1);
    expect(regionIndexForFloor("shortcutBackHole", 5)).toBe(2);
  });

  it("夜ごとの夢は深さ48を超えたところで地方1へ周回する", () => {
    expect(regionIndexForFloor(NIGHTLY_DREAM_ID, TOTAL_REGION_FLOORS)).toBe(8);
    expect(regionIndexForFloor(NIGHTLY_DREAM_ID, TOTAL_REGION_FLOORS + 1)).toBe(1);
  });

  it("腕試しの間は各階でその階のボスの地方番号を返す", () => {
    for (let depth = 1; depth <= REGION_BOSS_ORDER.length; depth++) {
      const expected = REGIONS.find((r) => r.bossSpeciesId === REGION_BOSS_ORDER[depth - 1])?.index;
      expect(regionIndexForFloor(TRIAL_CHAMBER_ID, depth)).toBe(expected);
    }
  });

  it("ひなたの寝穴は常に地方1のタイルセットを使う", () => {
    expect(regionIndexForFloor(HINATA_ID, 1)).toBe(1);
    expect(regionIndexForFloor(HINATA_ID, 3)).toBe(1);
  });
});
