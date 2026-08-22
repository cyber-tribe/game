import { describe, expect, it } from "vitest";
import { placeChapter3CollapseObstacle } from "../src/domain/dungeon/populate";
import { REGION_DUNGEON_IDS, REGION_SIZE, isChapter3CollapseFloor } from "../src/entities/dungeons";
import { Game } from "../src/game";
import { TILE_ROOM, TILE_WALL, TILE_CORRIDOR, type FloorState, type Tile } from "../src/core/types";

/** 骨積みの回廊(第四地方)ダンジョンid */
const bonepileCorridor = REGION_DUNGEON_IDS[3]!;

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
    depth: REGION_SIZE,
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

describe("entities/dungeons.ts: isChapter3CollapseFloor(plan/chapter3-collapse-event.md)", () => {
  it("骨積みの回廊(第四地方)ダンジョンの最終階だけがtrue", () => {
    expect(isChapter3CollapseFloor(bonepileCorridor, REGION_SIZE)).toBe(true);
    expect(isChapter3CollapseFloor(bonepileCorridor, REGION_SIZE - 1)).toBe(false);
    expect(isChapter3CollapseFloor(REGION_DUNGEON_IDS[0]!, REGION_SIZE)).toBe(false);
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

describe("game.ts: 骨積みの回廊(第四地方)最終階の崩落は、地方ボス5体撃破済み(第三章)の「戻り」のダイブでだけ発生する", () => {
  it("撃破済み地方ボスが第三章未満(5体未満)なら、初回プレイヤーを足止めしない(固定配置なし)", () => {
    const game = new Game({ seed: 5, dungeonId: bonepileCorridor, startDepth: REGION_SIZE, defeatedRegionBossCount: 0 });
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });

  it("撃破済み地方ボスが第三章の境界未満(4体)でもまだ発生しない", () => {
    const game = new Game({ seed: 5, dungeonId: bonepileCorridor, startDepth: REGION_SIZE, defeatedRegionBossCount: 4 });
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });

  it("撃破済み地方ボスが第三章(5体以上)に達していれば、requires:breakの崩落が固定配置される", () => {
    const game = new Game({ seed: 5, dungeonId: bonepileCorridor, startDepth: REGION_SIZE, defeatedRegionBossCount: 5 });
    expect(game.floor.fieldObstacles.some((o) => o.requires === "break")).toBe(true);
  });

  it("最終階以外(1つ前の階)では、地方ボス撃破数が第三章以降でも固定配置しない", () => {
    const game = new Game({
      seed: 1,
      dungeonId: bonepileCorridor,
      startDepth: REGION_SIZE - 1,
      defeatedRegionBossCount: 5,
    });
    // ランダム生成のfieldObstacleは残りうるが、最終階専用の固定配置ロジックは
    // 働かない(このseedでは0件になることを別途確認済み)
    expect(game.floor.fieldObstacles).toHaveLength(0);
  });
});
