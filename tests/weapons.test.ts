import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Dir } from "../src/core/grid";
import type { GameEvent } from "../src/core/events";
import {
  STATUS_RECOVER,
  TILE_ROOM,
  hasStatus,
  isHostile,
  type Actor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import { attackOffsets, computeDamage } from "../src/systems/combat";
import { equip } from "../src/items/inventory";
import { Game } from "../src/game";

function findDamage(events: GameEvent[], actorId: number) {
  return events.find(
    (e): e is Extract<GameEvent, { type: "damage" }> => e.type === "damage" && e.actorId === actorId,
  );
}

describe("attackOffsets", () => {
  it("single は正面1マスだけ", () => {
    expect(attackOffsets("single", 0)).toEqual([{ x: 0, y: -1 }]);
  });

  it("line2 は正面2マス先まで直線に届く", () => {
    expect(attackOffsets("line2", 0)).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: -2 },
    ]);
  });

  it("arc3 は正面と斜め前2方向の計3マス", () => {
    // dir=0(北)なら、左右は7(北西)と1(北東)
    expect(attackOffsets("arc3", 0)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
    ]);
  });

  it("quickSingle・heavySingle は single と同じ形", () => {
    for (const dir of [0, 2, 4, 6] as const) {
      expect(attackOffsets("quickSingle", dir)).toEqual(attackOffsets("single", dir));
      expect(attackOffsets("heavySingle", dir)).toEqual(attackOffsets("single", dir));
    }
  });
});

describe("computeDamage の会心オプション", () => {
  it("forceCrit を渡すと必ず会心になる", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) {
      expect(computeDamage(rng, 10, 100, { forceCrit: true }).critical).toBe(true);
    }
  });

  it("critBonus を渡すと会心の頻度が上がる", () => {
    const rate = (critBonus: number) => {
      const rng = new Rng(9);
      let crits = 0;
      const trials = 20000;
      for (let i = 0; i < trials; i++) {
        if (computeDamage(rng, 10, 5, { critBonus }).critical) crits++;
      }
      return crits / trials;
    };
    expect(rate(0.15)).toBeGreaterThan(rate(0));
  });
});

/** 壁のない開けたフロアに差し替える。武器の当たり判定を狙って検証するため */
function setupOpenFloor(game: Game, size = 16): void {
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles.push({ kind: TILE_ROOM, roomId: 0, explored: true, visible: true });
    }
  }
  const floor: FloorState = {
    depth: game.floor.depth,
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
  };
  game.floor = floor;
  game.player.pos = { x: size >> 1, y: size >> 1 };
  game.floor.actors.push(game.player);
}

let nextId = 1000;
function putMonster(game: Game, pos: { x: number; y: number }, hp = 999): Actor {
  const monster: Actor = {
    id: nextId++,
    kind: "monster",
    name: `敵${nextId}`,
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp,
    maxHp: hp,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: true,
  };
  game.floor.actors.push(monster);
  return monster;
}

function equipWeapon(game: Game, defId: string): void {
  const item = game.giveItem(defId);
  if (!item) throw new Error(`持ち物に入らなかった: ${defId}`);
  equip(game.player.inventory, item.uid);
}

describe("武器種ごとの当たり判定(Game)", () => {
  it("穂突き(line2)は正面2マス先の敵も同時に巻き込む", () => {
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    equipWeapon(game, "spearedge");

    const near = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    const far = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 2 });
    expect(isHostile(game.player, near)).toBe(true);

    const events = game.command({ type: "move", dir: 0 });
    const damaged = events.filter((e) => e.type === "damage").map((e) => e.actorId);
    expect(damaged).toContain(near.id);
    expect(damaged).toContain(far.id);
  });

  it("大鉈(arc3)は正面と斜め前2方向、計3マスに当たる。背後は当たらない", () => {
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    equipWeapon(game, "broadaxe");

    const front = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    const frontLeft = putMonster(game, { x: game.player.pos.x - 1, y: game.player.pos.y - 1 });
    const frontRight = putMonster(game, { x: game.player.pos.x + 1, y: game.player.pos.y - 1 });
    const behind = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 });

    const events = game.command({ type: "move", dir: 0 });
    const damaged = events.filter((e) => e.type === "damage").map((e) => e.actorId);
    expect(damaged).toContain(front.id);
    expect(damaged).toContain(frontLeft.id);
    expect(damaged).toContain(frontRight.id);
    expect(damaged).not.toContain(behind.id);
  });

  it("双樽鉤(quickSingle)は、そのラン最初の1手が必ず会心になる", () => {
    const game = new Game({ seed: 2 });
    setupOpenFloor(game);
    equipWeapon(game, "barrelHook");

    const target = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    const events = game.command({ type: "move", dir: 0 });
    expect(findDamage(events, target.id)?.critical).toBe(true);
  });

  it("双樽鉤は2手目以降、毎回は会心にならない", () => {
    const game = new Game({ seed: 3 });
    setupOpenFloor(game);
    equipWeapon(game, "barrelHook");

    // 1手目(強制会心)を消費する
    const first = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    game.command({ type: "move", dir: 0 });
    game.floor.actors = game.floor.actors.filter((a) => a.id !== first.id);

    let sawNonCritical = false;
    for (let i = 0; i < 200; i++) {
      const target = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
      const events = game.command({ type: "move", dir: 0 });
      if (findDamage(events, target.id)?.critical === false) sawNonCritical = true;
      game.floor.actors = game.floor.actors.filter((a) => a.id !== target.id);
      if (sawNonCritical) break;
    }
    expect(sawNonCritical).toBe(true);
  });

  it("主の大槌(heavySingle)は、振るった次の1手ぶん行動が遅れる", () => {
    const game = new Game({ seed: 4 });
    setupOpenFloor(game);
    equipWeapon(game, "lordsMaul");

    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    game.command({ type: "move", dir: 0 });
    expect(hasStatus(game.player, STATUS_RECOVER)).toBe(true);

    // 反動中は動けない
    const posBefore = { ...game.player.pos };
    const dir: Dir = 2; // 東(敵はいない方向)
    const events = game.command({ type: "move", dir });
    expect(events.some((e) => e.type === "message" && e.text.includes("体勢を立て直している"))).toBe(
      true,
    );
    expect(game.player.pos).toEqual(posBefore);

    // 反動が明ければ通常どおり動ける
    const events2 = game.command({ type: "move", dir });
    expect(hasStatus(game.player, STATUS_RECOVER)).toBe(false);
    expect(events2.some((e) => e.type === "move" && e.actorId === game.player.id)).toBe(true);
  });

  it("なた(single)は正面1マスだけに当たる", () => {
    const game = new Game({ seed: 5 });
    setupOpenFloor(game);
    equipWeapon(game, "hatchet");

    const near = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 1 });
    const far = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y - 2 });
    const events = game.command({ type: "move", dir: 0 });
    const damaged = events.filter((e) => e.type === "damage").map((e) => e.actorId);
    expect(damaged).toContain(near.id);
    expect(damaged).not.toContain(far.id);
  });
});
