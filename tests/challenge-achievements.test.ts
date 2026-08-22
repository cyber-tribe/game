import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import { NIGHTLY_DREAM_ID, REGION_DUNGEON_IDS, REGION_SIZE } from "../src/entities/dungeons";
import { achievementDef } from "../src/entities/achievements";
import { initialSave, recordRun } from "../src/save";

const region1 = REGION_DUNGEON_IDS[0];
const region8 = REGION_DUNGEON_IDS[REGION_DUNGEON_IDS.length - 1]!;

function newGame(seed = 42) {
  return new Game({ seed });
}

describe("entities/achievements.ts: 「挑戦」カテゴリ(plan/challenge-achievements.md)", () => {
  it("4つの実績が定義済み", () => {
    expect(achievementDef("noItemRegion")).toBeDefined();
    expect(achievementDef("noItemFullClear")?.title).toBe("素手の樽守り");
    expect(achievementDef("singleWeapon")?.title).toBe("一本気");
    expect(achievementDef("noItemSingleWeapon")?.title).toBe("求道者");
  });
});

describe("game.ts: usedItemThisRun(plan/challenge-achievements.md)", () => {
  it("初期状態はfalse", () => {
    expect(newGame().usedItemThisRun).toBe(false);
  });

  it("食料を食べるとtrueになる", () => {
    const game = newGame(33);
    const item = game.giveItem("hardBread")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.usedItemThisRun).toBe(true);
  });

  it("素材を使おうとしても(使えず終わるので)trueにならない", () => {
    const game = newGame();
    const item = game.giveItem("hokoraDust")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.usedItemThisRun).toBe(false);
  });

  it("残り回数0の杖を振ろうとしても(不発なので)trueにならない", () => {
    const game = newGame(37);
    const item = game.giveItem("sleepStaff")!;
    item.charges = 0;
    game.command({ type: "use", uid: item.uid });
    expect(game.usedItemThisRun).toBe(false);
  });

  it("道具(category: tool)を使うとtrueになる", () => {
    const game = newGame();
    const item = game.giveItem("barrelAppraisal")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.usedItemThisRun).toBe(true);
  });

  it("武器・防具の装備(equipコマンド)ではtrueにならない", () => {
    const game = newGame();
    const item = game.giveItem("ironHatchet")!;
    game.command({ type: "equip", uid: item.uid });
    expect(game.usedItemThisRun).toBe(false);
  });
});

describe("game.ts: usedMultipleWeaponsThisRun(plan/challenge-achievements.md)", () => {
  it("最初の1本を装備しただけでは持ち替えに数えない", () => {
    const game = newGame();
    const hatchet = game.giveItem("hatchet")!; // attackPattern未指定(basic系統)
    game.command({ type: "equip", uid: hatchet.uid });
    expect(game.usedMultipleWeaponsThisRun).toBe(false);
  });

  it("同じ系統の上位武器に持ち替えても数えない(なた→鉄のなた)", () => {
    const game = newGame();
    const hatchet = game.giveItem("hatchet")!;
    const ironHatchet = game.giveItem("ironHatchet")!;
    game.command({ type: "equip", uid: hatchet.uid });
    game.command({ type: "equip", uid: ironHatchet.uid });
    expect(game.usedMultipleWeaponsThisRun).toBe(false);
  });

  it("異なる系統の武器に持ち替えると数える(なた→穂突き)", () => {
    const game = newGame();
    const hatchet = game.giveItem("hatchet")!; // basic
    const spearedge = game.giveItem("spearedge")!; // attackPattern: line2
    game.command({ type: "equip", uid: hatchet.uid });
    game.command({ type: "equip", uid: spearedge.uid });
    expect(game.usedMultipleWeaponsThisRun).toBe(true);
  });

  it("はずす操作(トグルの逆方向)は持ち替えに数えない", () => {
    const game = newGame();
    const hatchet = game.giveItem("hatchet")!;
    game.command({ type: "equip", uid: hatchet.uid }); // 装備
    game.command({ type: "equip", uid: hatchet.uid }); // はずす(同じuidをもう一度)
    expect(game.usedMultipleWeaponsThisRun).toBe(false);
    expect(game.player.inventory.weaponUid).toBeNull();
  });

  it("はずしたあとに別系統を装備すると、外す前の系統と比較して持ち替えに数える", () => {
    const game = newGame();
    const hatchet = game.giveItem("hatchet")!; // basic
    const spearedge = game.giveItem("spearedge")!; // line2
    game.command({ type: "equip", uid: hatchet.uid }); // 装備
    game.command({ type: "equip", uid: hatchet.uid }); // はずす
    game.command({ type: "equip", uid: spearedge.uid }); // 別系統を装備
    expect(game.usedMultipleWeaponsThisRun).toBe(true);
  });
});

describe("save.ts: recordRunの「挑戦」カテゴリ即時判定(plan/challenge-achievements.md)", () => {
  const base = initialSave();

  it("最後の第八地方ダンジョンを無道具・単一武器でクリアすると4実績すべて解放される", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 5,
      cleared: true,
      broughtBack: [],
      dungeonId: region8,
      usedItem: false,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeDefined();
    expect(save.achievements.noItemFullClear).toBeDefined();
    expect(save.achievements.singleWeapon).toBeDefined();
    expect(save.achievements.noItemSingleWeapon).toBeDefined();
  });

  it("道具を使っていれば無道具系の実績は解放されない(武器持ち替え無しならsingleWeaponだけ解放)", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 5,
      cleared: true,
      broughtBack: [],
      dungeonId: region8,
      usedItem: true,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeUndefined();
    expect(save.achievements.noItemFullClear).toBeUndefined();
    expect(save.achievements.noItemSingleWeapon).toBeUndefined();
    expect(save.achievements.singleWeapon).toBeDefined();
  });

  it("武器を持ち替えていればsingleWeapon系は解放されない", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 5,
      cleared: true,
      broughtBack: [],
      dungeonId: region8,
      usedItem: false,
      usedMultipleWeapons: true,
    });
    expect(save.achievements.singleWeapon).toBeUndefined();
    expect(save.achievements.noItemSingleWeapon).toBeUndefined();
    expect(save.achievements.noItemFullClear).toBeDefined();
  });

  it("最終地方でない地方ダンジョンをクリアすればnoItemRegionだけ解放される", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 3,
      cleared: true,
      broughtBack: [],
      dungeonId: region1,
      usedItem: false,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeDefined();
    expect(save.achievements.noItemFullClear).toBeUndefined();
  });

  it("地方ダンジョンの最終階でない深さ(中間のめざめの階段)では、道具を使っていなくてもnoItemRegionは解放されない", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE - 1,
      level: 3,
      cleared: true,
      broughtBack: [],
      dungeonId: region1,
      usedItem: false,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeUndefined();
  });

  it("全滅(cleared: false)では、条件を満たしていても何も解放されない", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 5,
      cleared: false,
      broughtBack: [],
      dungeonId: region8,
      usedItem: false,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeUndefined();
    expect(save.achievements.noItemFullClear).toBeUndefined();
  });

  it("地方ダンジョン以外(夜ごとの夢)では「地方」の概念が無いため解放されない", () => {
    const save = recordRun(base, {
      depth: REGION_SIZE,
      level: 5,
      cleared: true,
      broughtBack: [],
      dungeonId: NIGHTLY_DREAM_ID,
      usedItem: false,
      usedMultipleWeapons: false,
    });
    expect(save.achievements.noItemRegion).toBeUndefined();
    expect(save.achievements.noItemFullClear).toBeUndefined();
  });
});
