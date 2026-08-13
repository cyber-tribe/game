import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { type Vec2, dirFromDelta } from "../src/core/grid";
import {
  TILE_ROOM,
  type AllyActor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import { Game } from "../src/game";
import { populateFloor, type IdSource } from "../src/dungeon/populate";
import { speciesById } from "../src/entities/species";

function makeIds(): IdSource {
  let actorId = 0;
  let itemUid = 0;
  let barrelId = 0;
  return {
    nextActorId: () => ++actorId,
    nextItemUid: () => ++itemUid,
    nextBarrelId: () => ++barrelId,
  };
}

/** 壁のない開けたフロア。中央にプレイヤーを置く想定 */
function makeOpenFloor(depth = 1, size = 12): FloorState {
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles.push({ kind: TILE_ROOM, roomId: 0, explored: true, visible: true });
    }
  }
  return {
    depth,
    width: size,
    height: size,
    tiles,
    rooms: [{ id: 0, x: 0, y: 0, w: size, h: size }],
    stairs: { x: size - 1, y: size - 1 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };
}

function ally(id: number, speciesId: string, pos: Vec2): AllyActor {
  const species = speciesById(speciesId);
  return {
    id,
    kind: "ally",
    name: species.name,
    speciesId,
    model: species.model,
    pos,
    facing: 4,
    hp: 20,
    maxHp: 20,
    atk: 5,
    def: 2,
    level: 1,
    statuses: [],
    alive: true,
  };
}

describe("entities/species.ts: fieldSkill", () => {
  it("ガジリねずみ=すばしっこい、ツブテガエル=跳べる、ホネガラミ=力持ち", () => {
    expect(speciesById("gajiri").fieldSkill).toBe("squeeze");
    expect(speciesById("tsubute").fieldSkill).toBe("leap");
    expect(speciesById("honegarami").fieldSkill).toBe("break");
  });

  it("戦闘に関わらない種族(ぷるん)にはfieldSkillが無い", () => {
    expect(speciesById("purun").fieldSkill).toBeUndefined();
  });
});

describe("dungeon/populate.ts: populateFieldObstacle", () => {
  it("フロアごとに0か1個だけ出現し、requiresは4種のいずれか", () => {
    let sawObstacle = false;
    for (let seed = 1; seed <= 60; seed++) {
      const floor = makeOpenFloor(5);
      populateFloor(new Rng(seed), floor, makeIds(), { x: 0, y: 0 });
      expect(floor.fieldObstacles.length).toBeLessThanOrEqual(1);
      if (floor.fieldObstacles.length === 1) {
        sawObstacle = true;
        expect(["break", "squeeze", "leap", "dig"]).toContain(floor.fieldObstacles[0]!.requires);
        expect(floor.fieldObstacles[0]!.opened).toBe(false);
      }
    }
    expect(sawObstacle).toBe(true);
  });
});

describe("game.ts: あうんの呼吸(障害物の通行)", () => {
  it("対応する仲間がいなければ通れない", () => {
    const game = new Game({ seed: 1 });
    const floor = makeOpenFloor(game.floor.depth);
    game.floor = floor;
    game.player.pos = { x: 6, y: 6 };
    floor.actors.push(game.player);
    const to = { x: 7, y: 6 };
    floor.fieldObstacles = [{ pos: to, requires: "break", opened: false }];

    const dir = dirFromDelta(to.x - game.player.pos.x, to.y - game.player.pos.y);
    game.command({ type: "move", dir });

    expect(game.player.pos).toEqual({ x: 6, y: 6 });
    expect(floor.fieldObstacles[0]!.opened).toBe(false);
  });

  it("対応する仲間を連れていれば自動的に道が開き、報酬が現れる", () => {
    const game = new Game({ seed: 1 });
    const floor = makeOpenFloor(game.floor.depth);
    game.floor = floor;
    game.player.pos = { x: 6, y: 6 };
    floor.actors.push(game.player);
    const to = { x: 7, y: 6 };
    floor.fieldObstacles = [{ pos: to, requires: "break", opened: false }];

    const helper = ally(500, "honegarami", { x: 0, y: 0 });
    game.allies.push(helper);
    floor.actors.push(helper);

    const dir = dirFromDelta(to.x - game.player.pos.x, to.y - game.player.pos.y);
    const events = game.command({ type: "move", dir });

    expect(game.player.pos).toEqual(to);
    expect(floor.fieldObstacles[0]!.opened).toBe(true);
    expect(floor.items.some((gi) => gi.pos.x === to.x && gi.pos.y === to.y)).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text.includes("道を切り開いた"))).toBe(true);
  });

  it("一度開いた障害物は、以後は素通りできる(再抽選しない)", () => {
    const game = new Game({ seed: 1 });
    const floor = makeOpenFloor(game.floor.depth);
    game.floor = floor;
    game.player.pos = { x: 6, y: 6 };
    floor.actors.push(game.player);
    const opened = { x: 7, y: 6 };
    floor.fieldObstacles = [{ pos: opened, requires: "break", opened: true }];

    const dir = dirFromDelta(opened.x - game.player.pos.x, opened.y - game.player.pos.y);
    game.command({ type: "move", dir });

    expect(game.player.pos).toEqual(opened);
    expect(floor.items).toHaveLength(0);
  });
});
