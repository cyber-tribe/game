import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import {
  TILE_ROOM,
  TILE_WALL,
  type AllyActor,
  type FloorState,
  type MonsterActor,
  type Tile,
} from "../src/core/types";

/**
 * 壁のない、全マス歩ける正方形のフロアに差し替える。押し出し・攻撃の
 * 当たり判定を、部屋の生成に左右されずピンポイントで狙って検証するため
 * (tests/weapons.test.ts の setupOpenFloor と同じ手法)
 */
function setupOpenFloor(game: Game, size = 12): void {
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
    secretPassages: [],
  };
  game.floor = floor;
  game.player.pos = { x: size >> 1, y: size >> 1 };
  game.floor.actors.push(game.player);
}

let nextId = 9000;

function putMonster(
  game: Game,
  pos: { x: number; y: number },
  overrides: Partial<MonsterActor> = {},
): MonsterActor {
  const monster: MonsterActor = {
    id: nextId++,
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 20,
    maxHp: 20,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: true,
    ...overrides,
  };
  game.floor.actors.push(monster);
  return monster;
}

function putAlly(
  game: Game,
  pos: { x: number; y: number },
  overrides: Partial<AllyActor> = {},
): AllyActor {
  const ally: AllyActor = {
    id: nextId++,
    kind: "ally",
    name: "テスト用仲間",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 20,
    maxHp: 20,
    atk: 5,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aware: true,
    ...overrides,
  };
  game.floor.actors.push(ally);
  game.allies.push(ally);
  return ally;
}

function newGame(seed = 1) {
  return new Game({ seed });
}

describe("plan/attack-button.md: 押し出しと攻撃専用キー", () => {
  it("移動キーで敵の方向へ進むと、攻撃ではなく1マス押し出す(プレイヤーはその場に留まる)", () => {
    const game = newGame();
    setupOpenFloor(game);
    const { x, y } = game.player.pos;
    const monster = putMonster(game, { x, y: y - 1 });
    const playerPosBefore = { ...game.player.pos };
    const turnBefore = game.turnCount;

    const events = game.command({ type: "move", dir: 0 });

    expect(game.player.pos).toEqual(playerPosBefore); // プレイヤーは押し出した側。その場から動かない
    // 押し出し(1マス先)そのものはmoveイベントとして記録される。押し出したあと
    // 同じcommand内でモンスターAIの1手ぶんも進む(plan/attack-button.mdの方針
    // どおり「押し出された敵も次のターンには通常通りプレイヤーへ向かってくる」)
    // ため、押し出し直後の位置はその最初のmoveイベントで確認する
    const monsterMoves = events.filter(
      (e): e is Extract<(typeof events)[number], { type: "move" }> =>
        e.type === "move" && e.actorId === monster.id,
    );
    expect(monsterMoves[0]).toMatchObject({ from: { x, y: y - 1 }, to: { x, y: y - 2 } });
    expect(monster.hp).toBe(monster.maxHp); // 押し出しはダメージを伴わない
    expect(events.some((e) => e.type === "damage")).toBe(false);
    // 押し出し・空振りも通常の移動・攻撃と同じくターンを消費する
    expect(game.turnCount).toBe(turnBefore + 1);
  });

  it("押し出し先が壁でふさがっていれば、壁への体当たりと同じく何も起きずターンも消費しない", () => {
    const game = newGame();
    setupOpenFloor(game);
    const { x, y } = game.player.pos;
    const monster = putMonster(game, { x, y: y - 1 });
    // 敵のさらに向こう側(押し出し先)を壁にする
    const wallIdx = (y - 2) * game.floor.width + x;
    game.floor.tiles[wallIdx]!.kind = TILE_WALL;
    const playerPosBefore = { ...game.player.pos };
    const monsterPosBefore = { ...monster.pos };
    const turnBefore = game.turnCount;

    const events = game.command({ type: "move", dir: 0 });

    expect(game.player.pos).toEqual(playerPosBefore);
    expect(monster.pos).toEqual(monsterPosBefore); // 押し出せなかった
    expect(events.some((e) => e.type === "bump")).toBe(true);
    expect(events.some((e) => e.type === "damage")).toBe(false);
    // 壁への体当たりと同じ扱い: ターンを消費しない
    expect(game.turnCount).toBe(turnBefore);
  });

  it("押し出し先に別のアクターがいる場合も同様に何も起きない(ターン消費なし)", () => {
    const game = newGame();
    setupOpenFloor(game);
    const { x, y } = game.player.pos;
    const monster = putMonster(game, { x, y: y - 1 });
    putMonster(game, { x, y: y - 2 }); // 押し出し先をふさぐ
    const monsterPosBefore = { ...monster.pos };
    const turnBefore = game.turnCount;

    const events = game.command({ type: "move", dir: 0 });

    expect(monster.pos).toEqual(monsterPosBefore);
    expect(events.some((e) => e.type === "bump")).toBe(true);
    expect(game.turnCount).toBe(turnBefore);
  });

  it("攻撃専用キーは、向いている方向の敵にダメージを与える。プレイヤー・敵とも位置は動かない", () => {
    const game = newGame();
    setupOpenFloor(game);
    const { x, y } = game.player.pos;
    const monster = putMonster(game, { x, y: y - 1 }, { hp: 10_000, maxHp: 10_000, def: 0 });
    game.command({ type: "face", dir: 0 });
    const playerPosBefore = { ...game.player.pos };
    const turnBefore = game.turnCount;

    const events = game.command({ type: "attack" });

    expect(game.player.pos).toEqual(playerPosBefore); // 攻撃は移動を伴わない
    expect(monster.pos).toEqual({ x, y: y - 1 }); // 攻撃であって押し出しではない
    expect(monster.hp).toBeLessThan(monster.maxHp);
    expect(events.some((e) => e.type === "damage" && e.actorId === monster.id)).toBe(true);
    expect(game.turnCount).toBe(turnBefore + 1);
  });

  it("空振り(向いている方向に敵がいない)は何も起きないが、ターンは消費する", () => {
    const game = newGame();
    setupOpenFloor(game);
    game.command({ type: "face", dir: 0 }); // 正面は何もない開けたマス
    const playerPosBefore = { ...game.player.pos };
    const hpBefore = game.player.hp;
    const turnBefore = game.turnCount;

    const events = game.command({ type: "attack" });

    expect(game.player.pos).toEqual(playerPosBefore);
    expect(game.player.hp).toBe(hpBefore);
    expect(events.some((e) => e.type === "damage")).toBe(false);
    expect(events.some((e) => e.type === "attack")).toBe(false);
    // わざと空振りして敵を押し出す戦略を成立させるため、空振りでもターンは消費する
    expect(game.turnCount).toBe(turnBefore + 1);
  });

  it("仲間のAI・追跡ロジックは変更の影響を受けない(隣接していれば従来どおり攻撃する)", () => {
    const game = newGame();
    setupOpenFloor(game);
    const { x, y } = game.player.pos;
    const ally = putAlly(game, { x: x + 3, y });
    const foe = putMonster(game, { x: x + 4, y }, { hp: 50, maxHp: 50, def: 0, aware: true });
    const hpBefore = foe.hp;

    // プレイヤー側は無関係な操作(足踏み)をするだけ。仲間の行動は既存のAIまかせ
    game.command({ type: "wait" });

    expect(foe.hp).toBeLessThan(hpBefore); // 仲間が隣接した敵へ通常どおり攻撃した
    expect(ally.alive).toBe(true); // 仲間自身の行動・生存には影響がない
  });
});
