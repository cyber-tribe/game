import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/dungeon/generate";
import { placeTorrentTiles } from "../src/dungeon/populate";
import { TILE_ROOM, TILE_WALL, roomContains, type Actor } from "../src/core/types";
import { REGION_DUNGEON_IDS } from "../src/entities/dungeons";
import { moveActor as moveActorVia } from "./helpers/access";

const region4 = REGION_DUNGEON_IDS[3]!;
const region5 = REGION_DUNGEON_IDS[4]!;
const region6 = REGION_DUNGEON_IDS[5]!;

describe("dungeon/populate.ts: placeTorrentTiles", () => {
  it("店・モンスターハウス・階段の部屋には付与されない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(new Rng(seed), {
        depth: 25,
        shopChanceMultiplier: 5,
        monsterHouseChanceMultiplier: 5,
      });
      placeTorrentTiles(new Rng(seed), floor);
      for (const room of floor.rooms) {
        if (room.kind !== undefined || roomContains(room, floor.stairs)) {
          for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
              expect(floor.tiles[y * floor.width + x]?.torrent).toBeUndefined();
            }
          }
        }
      }
    }
  });

  it("通常の部屋には奔流タイルが付与されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 25 });
      placeTorrentTiles(new Rng(seed), floor);
      found = floor.tiles.some((t) => t.torrent !== undefined);
    }
    expect(found).toBe(true);
  });

  it("付与されるのは部屋タイルだけ(壁・通路には付与されない)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 25 });
      placeTorrentTiles(new Rng(seed), floor);
      for (const tile of floor.tiles) {
        if (tile.torrent !== undefined) expect(tile.kind).toBe(TILE_ROOM);
      }
    }
  });
});

describe("game.ts: 第五地方(なみだの滝つぼ)ダンジョンにだけ奔流タイルが生成される", () => {
  it("第五地方では奔流タイルが生成されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const game = new Game({ seed, dungeonId: region5, startDepth: 1 });
      found = game.floor.tiles.some((t) => t.torrent !== undefined);
    }
    expect(found).toBe(true);
  });

  it("第四地方には奔流タイルが生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, dungeonId: region4, startDepth: 1 });
      expect(game.floor.tiles.some((t) => t.torrent !== undefined)).toBe(false);
    }
  });

  it("第六地方には奔流タイルが生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, dungeonId: region6, startDepth: 1 });
      expect(game.floor.tiles.some((t) => t.torrent !== undefined)).toBe(false);
    }
  });
});

describe("game.ts: 奔流タイルへ移動すると押し流される(applyTorrentPush)", () => {
  function setupLine(game: Game, opts: { torrentEnd: number; wallAt?: number }) {
    // y=5の横一列を部屋タイルにし、x=2〜opts.torrentEndを東向きの奔流にする
    const y = 5;
    for (let x = 0; x <= 12; x++) {
      const tile = game.floor.tiles[y * game.floor.width + x]!;
      tile.kind = x === opts.wallAt ? TILE_WALL : TILE_ROOM;
    }
    for (let x = 2; x <= opts.torrentEnd; x++) {
      game.floor.tiles[y * game.floor.width + x]!.torrent = 2; // 東
    }
    return y;
  }

  it("奔流タイルに乗ると、その向きへ押し流される", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = setupLine(game, { torrentEnd: 4 });
    game.player.pos = { x: 1, y };

    const events = game.command({ type: "move", dir: 2 });

    expect(game.player.pos).toEqual({ x: 5, y }); // 通常移動でx2→奔流でx3,4,5へ連鎖
    expect(events.some((e) => e.type === "message" && e.text === "奔流に押し流された!")).toBe(true);
  });

  it("連鎖は最大4マスまで(それ以上長い奔流でも4マスで止まる)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = setupLine(game, { torrentEnd: 9 }); // x2〜x9まで奔流(8マスぶん)
    game.player.pos = { x: 1, y };

    game.command({ type: "move", dir: 2 });

    // 通常移動でx2、そこから最大4マス(x3,4,5,6)ぶん押し流されてx6で止まる
    expect(game.player.pos).toEqual({ x: 6, y });
  });

  it("壁があれば、その手前で止まる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = setupLine(game, { torrentEnd: 9, wallAt: 6 });
    game.player.pos = { x: 1, y };

    game.command({ type: "move", dir: 2 });

    expect(game.player.pos).toEqual({ x: 5, y });
  });

  it("他のアクターがいれば、その手前で止まる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = setupLine(game, { torrentEnd: 9 });
    const blocker: Actor = {
      id: 9999,
      kind: "monster",
      name: "せきとめねずみ",
      model: "gajiri",
      pos: { x: 5, y },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      aware: false,
    };
    game.floor.actors.push(blocker);
    game.player.pos = { x: 1, y };

    game.command({ type: "move", dir: 2 });

    expect(game.player.pos).toEqual({ x: 4, y });
  });

  it("奔流タイルでなければ、通常どおり1マスしか移動しない", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = 5;
    for (let x = 0; x <= 6; x++) {
      game.floor.tiles[y * game.floor.width + x]!.kind = TILE_ROOM;
    }
    game.player.pos = { x: 1, y };

    game.command({ type: "move", dir: 2 });

    expect(game.player.pos).toEqual({ x: 2, y });
  });

  it("モンスターの移動でも同じように押し流される(moveActor)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const y = setupLine(game, { torrentEnd: 4 });
    const monster: Actor = {
      id: 9998,
      kind: "monster",
      name: "テスト用モンスター",
      model: "gajiri",
      pos: { x: 1, y },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      aware: false,
    };
    game.floor.actors.push(monster);

    const events: { type: string; text?: string }[] = [];
    moveActorVia(game, monster, 2, events);

    expect(monster.pos).toEqual({ x: 5, y });
    // モンスターが流されたことについての専用メッセージは出さない(プレイヤーのみ)
    expect(events.some((e) => e.type === "message" && e.text === "奔流に押し流された!")).toBe(false);
  });
});
