import { describe, expect, it } from "vitest";
import { TILE_CORRIDOR, TILE_ROOM, TILE_WALL, tileAt } from "../../src/core/types";
import { buildTestFloor } from "./floor";

describe("箱庭ダンジョンのASCIIマップビルダー(plan/game/test-dungeon-harness.md)", () => {
  it("既定の記号(# . > @)だけの単純な部屋を組み立てる", () => {
    const { floor, at } = buildTestFloor(`
      ##########
      #@.......#
      #........#
      #.......>#
      ##########
    `);

    expect(floor.width).toBe(10);
    expect(floor.height).toBe(5);
    expect(at("@")).toEqual({ x: 1, y: 1 });
    expect(at(">")).toEqual({ x: 8, y: 3 });
    expect(floor.stairs).toEqual({ x: 8, y: 3 });
    expect(floor.actors).toEqual([]);

    expect(tileAt(floor, { x: 0, y: 0 })!.kind).toBe(TILE_WALL);
    const inner = tileAt(floor, { x: 1, y: 1 })!;
    expect(inner.kind).toBe(TILE_ROOM);
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0]).toMatchObject({ x: 1, y: 1, w: 8, h: 3 });
  });

  it("legendでモンスター・タルを配置し、depthも反映する", () => {
    const { floor, at } = buildTestFloor(
      `
      ##########
      #@...p...#
      #....#...#
      #..b.#..>#
      ##########
    `,
      {
        depth: 5,
        legend: {
          p: { actor: "purun", hp: 3 },
          b: { barrel: "empty" },
        },
      },
    );

    expect(floor.depth).toBe(5);
    expect(floor.actors).toHaveLength(1);
    expect(floor.actors[0]).toMatchObject({ kind: "monster", speciesId: "purun", hp: 3, pos: at("p") });
    expect(floor.barrels).toHaveLength(1);
    expect(floor.barrels[0]).toMatchObject({ kind: "empty", pos: at("b") });

    // #.......#の内部にある壁("#....#...#"の1マス)は通路扱いになり、部屋にはならない
    const corridorTile = tileAt(floor, { x: 5, y: 2 })!;
    expect(corridorTile.kind).toBe(TILE_WALL);
  });

  it("goldとtrapのlegendが対応する配列に入る", () => {
    const { floor, at } = buildTestFloor(
      `
      #####
      #@g.#
      #.t>#
      #####
    `,
      {
        legend: {
          g: { gold: 42 },
          t: { trap: "poison" },
        },
      },
    );

    expect(floor.goldPiles).toEqual([{ id: 1, pos: at("g"), amount: 42 }]);
    expect(floor.traps).toEqual([{ pos: at("t"), kind: "poison", revealed: false }]);
  });

  it('"@"が無いと例外', () => {
    expect(() =>
      buildTestFloor(`
      ###
      #.#
      #>#
      ###
    `),
    ).toThrow(/@/);
  });

  it("行の幅が揃っていないと例外", () => {
    expect(() =>
      buildTestFloor(`
      ####
      #@>#
      ###
    `),
    ).toThrow(/幅/);
  });

  it("未知の記号があると例外", () => {
    expect(() =>
      buildTestFloor(`
      #####
      #@.z#
      #..>#
      #####
    `),
    ).toThrow(/未知の記号/);
  });

  it("1マス幅しかないL字の床には部屋が1つも検出されない(全て通路)", () => {
    const { floor } = buildTestFloor(`
      ######
      #@...#
      ####.#
      #...>#
      ######
    `);
    expect(floor.rooms).toEqual([]);
    const bendTile = tileAt(floor, { x: 4, y: 2 })!;
    expect(bendTile.kind).toBe(TILE_CORRIDOR);
    expect(bendTile.roomId).toBe(-1);
  });

  it("通路でつながった2つの矩形の部屋をそれぞれ検出する", () => {
    const { floor, at } = buildTestFloor(
      `
      ##########
      #@...p...#
      #....#...#
      #..b.#..>#
      ##########
    `,
      { legend: { p: { actor: "purun" }, b: { barrel: "empty" } } },
    );
    // 左の部屋(x1-4)と右の部屋(x6-8)の2つに分かれ、間の1マス(5,1)は通路のまま
    expect(floor.rooms).toHaveLength(2);
    expect(floor.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))).toEqual(
      expect.arrayContaining([
        { x: 1, y: 1, w: 4, h: 3 },
        { x: 6, y: 1, w: 3, h: 3 },
      ]),
    );
    const corridor = tileAt(floor, { x: 5, y: 1 })!;
    expect(corridor.kind).toBe(TILE_CORRIDOR);
    expect(corridor.roomId).toBe(-1);
    expect(at("p")).toEqual({ x: 5, y: 1 });
  });
});
