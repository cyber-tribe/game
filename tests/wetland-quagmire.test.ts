import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/domain/dungeon/generate";
import { placeQuagmireTiles } from "../src/domain/dungeon/populate";
import { dirFromDelta } from "../src/core/grid";
import { TILE_ROOM } from "../src/core/types";
import { REGION_DUNGEON_IDS } from "../src/entities/dungeons";

const region1 = REGION_DUNGEON_IDS[0];
const region2 = REGION_DUNGEON_IDS[1]!;
const region3 = REGION_DUNGEON_IDS[2]!;

describe("dungeon/populate.ts: placeQuagmireTiles", () => {
  it("店・モンスターハウスの部屋には付与されない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(new Rng(seed), {
        depth: 7,
        shopChanceMultiplier: 5,
        monsterHouseChanceMultiplier: 5,
      });
      placeQuagmireTiles(new Rng(seed), floor);
      for (const room of floor.rooms) {
        if (room.kind === undefined) continue;
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            const tile = floor.tiles[y * floor.width + x];
            expect(tile?.quagmire).toBeFalsy();
          }
        }
      }
    }
  });

  it("通常の部屋には深みタイルが付与されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 7 });
      placeQuagmireTiles(new Rng(seed), floor);
      found = floor.tiles.some((t) => t.quagmire);
    }
    expect(found).toBe(true);
  });

  it("付与されるのは部屋タイルだけ(壁・通路には付与されない)", () => {
    const floor = generateFloor(new Rng(3), { depth: 7 });
    placeQuagmireTiles(new Rng(3), floor);
    for (const tile of floor.tiles) {
      if (tile.quagmire) expect(tile.kind).toBe(TILE_ROOM);
    }
  });
});

describe("game.ts: 第二地方(忘れ潮の湿地)ダンジョンにだけ深みタイルが生成される", () => {
  it("第二地方では深みタイルが生成されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const game = new Game({ seed, dungeonId: region2, startDepth: 1 });
      found = game.floor.tiles.some((t) => t.quagmire);
    }
    expect(found).toBe(true);
  });

  it("第一地方には深みタイルが生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, dungeonId: region1, startDepth: 1 });
      expect(game.floor.tiles.some((t) => t.quagmire)).toBe(false);
    }
  });

  it("第三地方には深みタイルが生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, dungeonId: region3, startDepth: 1 });
      expect(game.floor.tiles.some((t) => t.quagmire)).toBe(false);
    }
  });
});

describe("game.ts: 深みタイルへの移動でモンスター行動がもう1手ぶん進む", () => {
  it("深みタイルへ移動すると、隣接するモンスターが同じ入力の中で2回行動する", () => {
    let game: Game | undefined;
    let target: { x: number; y: number } | undefined;
    let from: { x: number; y: number } | undefined;
    let monsterPos: { x: number; y: number } | undefined;

    for (let seed = 1; seed <= 30 && !game; seed++) {
      const candidate = new Game({ seed, dungeonId: region2, startDepth: 1 });
      const quagmireTiles = candidate.floor.tiles
        .map((t, i) => ({ t, x: i % candidate.floor.width, y: Math.floor(i / candidate.floor.width) }))
        .filter((q) => q.t.quagmire);
      for (const q of quagmireTiles) {
        const neighbors = [
          { x: q.x - 1, y: q.y },
          { x: q.x + 1, y: q.y },
          { x: q.x, y: q.y - 1 },
          { x: q.x, y: q.y + 1 },
        ];
        const walkableNeighbors = neighbors.filter((n) => {
          const t = candidate.floor.tiles[n.y * candidate.floor.width + n.x];
          return t && t.kind !== 0;
        });
        if (walkableNeighbors.length >= 2) {
          game = candidate;
          target = { x: q.x, y: q.y };
          from = walkableNeighbors[0];
          monsterPos = walkableNeighbors[1];
          break;
        }
      }
    }

    expect(game).toBeDefined();
    expect(target).toBeDefined();
    expect(from).toBeDefined();
    expect(monsterPos).toBeDefined();
    if (!game || !target || !from || !monsterPos) return;

    // 野生モンスターを取り除き、狙った1体だけを隣接させる
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster = {
      id: 9999,
      kind: "monster" as const,
      name: "ガジリねずみ",
      speciesId: "gajiri",
      model: "gajiri",
      pos: monsterPos,
      facing: 4 as const,
      hp: 30,
      maxHp: 30,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aware: true,
    };
    game.floor.actors.push(monster);

    game.player.pos = from;
    const dir = dirFromDelta(target.x - from.x, target.y - from.y);
    const events = game.command({ type: "move", dir });

    const attackCount = events.filter((e) => e.type === "attack" && e.attackerId === 9999).length;
    expect(attackCount).toBe(2);
  });

  it("深みタイルでない場所へ移動した場合は、モンスターは1回しか行動しない(対照)", () => {
    let game: Game | undefined;
    let target: { x: number; y: number } | undefined;
    let from: { x: number; y: number } | undefined;
    let monsterPos: { x: number; y: number } | undefined;

    for (let seed = 1; seed <= 30 && !game; seed++) {
      const candidate = new Game({ seed, dungeonId: region1, startDepth: 1 }); // 第一地方は深みタイルが無い
      const roomTiles = candidate.floor.tiles
        .map((t, i) => ({ t, x: i % candidate.floor.width, y: Math.floor(i / candidate.floor.width) }))
        .filter((q) => q.t.kind === TILE_ROOM);
      for (const q of roomTiles) {
        const neighbors = [
          { x: q.x - 1, y: q.y },
          { x: q.x + 1, y: q.y },
          { x: q.x, y: q.y - 1 },
          { x: q.x, y: q.y + 1 },
        ];
        const walkableNeighbors = neighbors.filter((n) => {
          const t = candidate.floor.tiles[n.y * candidate.floor.width + n.x];
          return t && t.kind !== 0;
        });
        if (walkableNeighbors.length >= 2) {
          game = candidate;
          target = { x: q.x, y: q.y };
          from = walkableNeighbors[0];
          monsterPos = walkableNeighbors[1];
          break;
        }
      }
    }

    expect(game).toBeDefined();
    if (!game || !target || !from || !monsterPos) return;

    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster = {
      id: 9999,
      kind: "monster" as const,
      name: "ガジリねずみ",
      speciesId: "gajiri",
      model: "gajiri",
      pos: monsterPos,
      facing: 4 as const,
      hp: 30,
      maxHp: 30,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aware: true,
    };
    game.floor.actors.push(monster);

    game.player.pos = from;
    const dir = dirFromDelta(target.x - from.x, target.y - from.y);
    const events = game.command({ type: "move", dir });

    const attackCount = events.filter((e) => e.type === "attack" && e.attackerId === 9999).length;
    expect(attackCount).toBe(1);
  });
});
