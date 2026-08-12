import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import type { Actor } from "../src/core/types";

function makeMonster(id: number, pos: { x: number; y: number }, overrides: Partial<Actor> = {}): Actor {
  return {
    id,
    kind: "monster",
    name: "テスト用モンスター",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aware: false,
    ...overrides,
  };
}

describe("game.ts: 第六地方(31〜36階)は攻撃で周囲のモンスターに気づかれる", () => {
  it("攻撃すると、範囲6以内の(視界に関係なく)モンスターがawareになる", () => {
    const game = new Game({ seed: 1, startDepth: 31 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // 部屋ベースの既存の視認判定(roomOf)による巻き添えを避け、本ギミック単体を検証する
    game.floor.rooms = [];
    game.player.pos = { x: 5, y: 5 };
    const adjacentFoe = makeMonster(101, { x: 6, y: 5 });
    const nearFoe = makeMonster(102, { x: 5, y: 11 }); // チェビシェフ距離6
    const farFoe = makeMonster(103, { x: 5, y: 12 }); // チェビシェフ距離7
    game.floor.actors.push(adjacentFoe, nearFoe, farFoe);

    game.command({ type: "move", dir: 2 });

    expect(nearFoe.aware).toBe(true);
    expect(farFoe.aware).toBe(false);
  });

  it("攻撃が空振りしても(不可視の相手など)、周囲のモンスターは気づく", () => {
    const game = new Game({ seed: 1, startDepth: 31 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // 部屋ベースの既存の視認判定(roomOf)による巻き添えを避け、本ギミック単体を検証する
    game.floor.rooms = [];
    game.player.pos = { x: 5, y: 5 };
    const invisibleFoe = makeMonster(101, { x: 6, y: 5 }, { statuses: [{ kind: "invisible", turns: 5 }] });
    const nearFoe = makeMonster(102, { x: 5, y: 10 }); // チェビシェフ距離5
    game.floor.actors.push(invisibleFoe, nearFoe);

    game.command({ type: "move", dir: 2 });

    expect(nearFoe.aware).toBe(true);
  });

  it("罠を踏んでも、範囲6以内のモンスターがawareになる", () => {
    const game = new Game({ seed: 1, startDepth: 31 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // 部屋ベースの既存の視認判定(roomOf)による巻き添えを避け、本ギミック単体を検証する
    game.floor.rooms = [];
    game.player.pos = { x: 5, y: 5 };
    const nearFoe = makeMonster(101, { x: 5, y: 10 }); // チェビシェフ距離5
    game.floor.actors.push(nearFoe);
    game.floor.traps = [{ pos: { x: 6, y: 5 }, kind: "damage", revealed: false }];

    game.command({ type: "move", dir: 2 });

    expect(nearFoe.aware).toBe(true);
  });

  it("第五地方(25〜30階)など、対象外の地方では範囲の巻き添えは起きない", () => {
    const game = new Game({ seed: 1, startDepth: 25 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // 部屋ベースの既存の視認判定(roomOf)による巻き添えを避け、本ギミック単体を検証する
    game.floor.rooms = [];
    game.player.pos = { x: 5, y: 5 };
    const adjacentFoe = makeMonster(101, { x: 6, y: 5 });
    const nearFoe = makeMonster(102, { x: 5, y: 8 }); // チェビシェフ距離3(範囲内相当)
    game.floor.actors.push(adjacentFoe, nearFoe);

    game.command({ type: "move", dir: 2 });

    expect(adjacentFoe.aware).toBe(true); // 直接攻撃された相手は既存仕様どおりawareになる
    expect(nearFoe.aware).toBe(false); // 巻き添えの範囲効果は起きない
  });
});
