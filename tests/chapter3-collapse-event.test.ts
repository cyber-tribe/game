import { describe, expect, it } from "vitest";
import { placeChapter3CollapseObstacle } from "../src/dungeon/populate";
import { CHAPTER3_COLLAPSE_DEPTH, MAIN_CAVE_ID, REGION_SIZE } from "../src/entities/dungeons";
import { Game } from "../src/game";
import { TILE_ROOM, TILE_WALL, TILE_CORRIDOR, type FloorState, type Tile } from "../src/core/types";

/**
 * 5x5の小部屋(1,1)-(3,3)に、(4,2)だけ通路タイルをつなげた最小フロア。
 * (3,2)が唯一の「出口」タイルになる
 */
function floorWithOneExit(stairs = { x: 2, y: 2 }): FloorState {
  const size = 5;
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inRoom = x >= 1 && x <= 3 && y >= 1 && y <= 3;
      const isCorridor = x === 4 && y === 2;
      const kind = inRoom ? TILE_ROOM : isCorridor ? TILE_CORRIDOR : TILE_WALL;
      tiles.push({ kind, roomId: inRoom ? 0 : -1, explored: true, visible: true });
    }
  }
  return {
    depth: CHAPTER3_COLLAPSE_DEPTH,
    width: size,
    height: size,
    tiles,
    rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3 }],
    stairs,
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  } as unknown as FloorState;
}

describe("entities/dungeons.ts: CHAPTER3_COLLAPSE_DEPTH(plan/chapter3-collapse-event.md)", () => {
  it("骨積みの回廊(第四地方)最終階=24階", () => {
    expect(CHAPTER3_COLLAPSE_DEPTH).toBe(REGION_SIZE * 4);
    expect(CHAPTER3_COLLAPSE_DEPTH).toBe(24);
  });
});

describe("dungeon/populate.ts: placeChapter3CollapseObstacle", () => {
  it("階段のある部屋の、通路へ抜ける唯一の出口にrequires:breakを固定配置する", () => {
    const floor = floorWithOneExit();
    placeChapter3CollapseObstacle(floor);
    expect(floor.fieldObstacles).toEqual([{ pos: { x: 3, y: 2 }, requires: "break", opened: false }]);
  });

  it("階段が部屋に属していなければ何もしない", () => {
    const floor = floorWithOneExit({ x: 0, y: 0 }); // 壁の上=どの部屋にも属さない
    placeChapter3CollapseObstacle(floor);
    expect(floor.fieldObstacles).toEqual([]);
  });

  it("出口(通路に隣接する部屋タイル)が無ければ何もしない", () => {
    const floor = floorWithOneExit();
    // 通路タイルを壁に戻し、出口を無くす
    floor.tiles[2 * floor.width + 4] = { kind: TILE_WALL, roomId: -1, explored: true, visible: true };
    placeChapter3CollapseObstacle(floor);
    expect(floor.fieldObstacles).toEqual([]);
  });
});

describe("game.ts: 表の寝穴24階(骨積みの回廊最終階)の崩落は、deepest>=30の「戻り」のダイブでだけ発生する", () => {
  it("deepestが第三章未満(30未満)なら、初回プレイヤーを足止めしない(固定配置なし)", () => {
    const game = new Game({ seed: 5, dungeonId: MAIN_CAVE_ID, startDepth: 24, deepest: 0 });
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });

  it("deepestが第三章の境界未満(29)でもまだ発生しない", () => {
    const game = new Game({ seed: 5, dungeonId: MAIN_CAVE_ID, startDepth: 24, deepest: 29 });
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });

  it("deepestが第三章(30以上)に達していれば、requires:breakの崩落が固定配置される", () => {
    const game = new Game({ seed: 5, dungeonId: MAIN_CAVE_ID, startDepth: 24, deepest: 30 });
    expect(game.floor.fieldObstacles.some((o) => o.requires === "break")).toBe(true);
  });

  it("24階以外(23階)では、deepestが第三章以降でも固定配置しない", () => {
    const game = new Game({ seed: 5, dungeonId: MAIN_CAVE_ID, startDepth: 23, deepest: 30 });
    // ランダム生成のfieldObstacleは残りうるが、24階専用の固定配置ロジックは働かない
    // (このseedでは23階も0件になることを別途確認済み)
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });
});
