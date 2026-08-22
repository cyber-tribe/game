import { describe, expect, it } from "vitest";
import {
  HINATA_ID,
  REGION_DUNGEON_IDS,
  dungeonById,
  isCheckpointFloor,
} from "../src/entities/dungeons";
import { Game } from "../src/application/dungeonRun/game";
import { initialSave, recordHinataClear } from "../src/save";

describe("entities/dungeons.ts: ひなたの寝穴(plan/game/tutorial-dungeon.md)", () => {
  it("maxDepth=3, unlock=alwaysのDungeonDefが登録されている", () => {
    const hinata = dungeonById(HINATA_ID);
    expect(hinata.maxDepth).toBe(3);
    expect(hinata.unlock).toBe("always");
  });

  it("めざめの階段は最終階(3階)だけ", () => {
    expect(isCheckpointFloor(HINATA_ID, 1)).toBe(false);
    expect(isCheckpointFloor(HINATA_ID, 2)).toBe(false);
    expect(isCheckpointFloor(HINATA_ID, 3)).toBe(true);
  });
});

describe("game.ts: ひなたの寝穴は階ごとに手作りの固定Floorになる", () => {
  it("1階: ぷるん1体だけ配置され、罠・ギミック・モンスターハウスは無い", () => {
    const game = new Game({ seed: 1, dungeonId: HINATA_ID, startDepth: 1 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("purun");
    expect(game.floor.traps).toHaveLength(0);
    expect(game.floor.gimmick).toBeUndefined();
    expect(game.floor.rooms.every((r) => r.kind === undefined)).toBe(true);
  });

  it("2階: 空のタルが1つと、ぷるん1体が配置される", () => {
    const game = new Game({ seed: 1, dungeonId: HINATA_ID, startDepth: 2 });
    expect(game.floor.barrels).toHaveLength(1);
    expect(game.floor.barrels[0]!.kind).toBe("empty");
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("purun");
  });

  it("3階: いやしの葉・かたパンと、番人のぷるん2体が配置される", () => {
    const game = new Game({ seed: 1, dungeonId: HINATA_ID, startDepth: 3 });
    const itemIds = game.floor.items.map((i) => i.item.defId).sort();
    expect(itemIds).toEqual(["hardBread", "healLeaf"]);
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(2);
    expect(monsters.every((m) => m.speciesId === "purun")).toBe(true);
  });

  it("seedを変えても内容は同じ(乱数に依存しない手作り配置)", () => {
    const a = new Game({ seed: 5, dungeonId: HINATA_ID, startDepth: 1 });
    const b = new Game({ seed: 99, dungeonId: HINATA_ID, startDepth: 1 });
    expect(a.floor.actors.filter((x) => x.kind === "monster")).toHaveLength(1);
    expect(b.floor.actors.filter((x) => x.kind === "monster")).toHaveLength(1);
  });
});

describe("save.ts: recordHinataClear", () => {
  it("hinataClearedを立て、持ち帰った道具・仲間を反映する。runs/clears/deepestは変えない", () => {
    const save = initialSave();
    expect(save.hinataCleared).toBe(false);
    const next = recordHinataClear(save, [{ uid: 1, defId: "healLeaf" }], []);
    expect(next.hinataCleared).toBe(true);
    expect(next.storage.some((s) => s.defId === "healLeaf")).toBe(true);
    expect(next.runs).toBe(save.runs);
    expect(next.clears).toBe(save.clears);
    expect(next.deepest).toBe(save.deepest);
  });
});

describe("entities/dungeons.ts: 第一地方の解放条件", () => {
  it("REGION_DUNGEON_IDS[0]はhinataClearedがtrueのときだけ解放される", () => {
    const region1 = dungeonById(REGION_DUNGEON_IDS[0]);
    expect(region1.unlock).toEqual({ afterDungeonCleared: HINATA_ID });
  });
});
