import { describe, expect, it } from "vitest";
import type { AllyActor, MonsterActor } from "../src/core/types";
import { STATUS_CONFUSE, STATUS_POISON } from "../src/core/types";
import { Game } from "../src/game";

/**
 * DDD Phase 4(plan/game/ddd-phase4-turn-resolution.md)のゴールデンテスト。
 * 固定シードのGameで、10ターン程度のコマンド列(移動・攻撃・足踏み・
 * アイテム使用の混在)を流し、全ターンぶんのGameEvent[]のtype列を
 * 手書きの期待配列として固定する。Phase 4の全コミットでこのテストが
 * 無変更のままpassし続けることが、ターン解決をdomain/turnへ移す間
 * 挙動を一切変えていないことの証明になる。
 */

function newGame(seed = 1) {
  return new Game({ seed });
}

function openRoom(game: Game) {
  const room = { id: 1, x: 2, y: 2, w: 10, h: 10 };
  game.floor.rooms = [room];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      game.floor.tiles[y * game.floor.width + x]!.kind = 1;
    }
  }
  game.player.pos = { x: room.x + 5, y: room.y + 5 };
  return room;
}

function putMonster(
  game: Game,
  pos: { x: number; y: number },
  overrides: Partial<MonsterActor> = {},
): MonsterActor {
  const monster: MonsterActor = {
    id: 8001,
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 999,
    maxHp: 999,
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

function addAlly(game: Game, overrides: Partial<AllyActor> = {}): AllyActor {
  const ally: AllyActor = {
    id: 9001,
    kind: "ally",
    name: "ガジリねずみ",
    speciesId: "gajiri",
    model: "gajiri",
    pos: { x: game.player.pos.x, y: game.player.pos.y },
    facing: 4,
    hp: 9999,
    maxHp: 9999,
    atk: 5,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
  game.floor.actors.push(ally);
  game.allies.push(ally);
  return ally;
}

/** イベント列を、比較に使うtypeだけの列に落とす(1ターンごとに区切って持つ) */
function types(events: ReturnType<Game["command"]>): string[] {
  return events.map((e) => e.type);
}

describe("turn golden: 敵2体+仲間1体のターン進行(移動・攻撃・足踏みの混在)", () => {
  it("10手ぶんのコマンド列の各ターンのイベントtype列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    addAlly(game, { pos: { x: game.player.pos.x - 1, y: game.player.pos.y } });
    putMonster(game, { x: game.player.pos.x + 3, y: game.player.pos.y }, { id: 8001 });
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 3 }, { id: 8002, aware: false });
    game.command({ type: "face", dir: 2 }); // 東向き

    const commands: Array<Parameters<Game["command"]>[0]> = [
      { type: "wait" },
      { type: "move", dir: 2 },
      { type: "wait" },
      { type: "move", dir: 2 },
      { type: "attack" },
      { type: "wait" },
      { type: "attack" },
      { type: "wait" },
      { type: "wait" },
      { type: "attack" },
    ];

    const perTurn = commands.map((cmd) => types(game.command(cmd)));

    expect(perTurn).toEqual([
      ["move", "move", "monsterSighted"],
      ["move", "move", "attack", "message", "message", "message", "damage", "move"],
      ["move", "attack", "message", "message", "message", "damage", "attack", "message", "message", "damage"],
      [
        "move",
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "damage",
      ],
      [
        "attack",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "message",
        "damage",
        "attack",
        "message",
        "message",
        "message",
        "damage",
      ],
    ]);
  });
});

describe("turn golden: 深みタイル進入でもう1手ぶんアクターが動く", () => {
  it("quagmireタイルへ移動した直後だけrunActorsが2回走る", () => {
    const game = newGame(2);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = openRoom(game);
    const monster = putMonster(game, { x: room.x + 1, y: room.y + 1 }, { id: 8001, aware: true });
    game.command({ type: "face", dir: 6 }); // 西向き
    const front = { x: game.player.pos.x - 1, y: game.player.pos.y };
    game.floor.tiles[front.y * game.floor.width + front.x]!.quagmire = true;

    const events = game.command({ type: "move", dir: 6 });

    // quagmireへの進入自体はmoveイベント1つ、その後のrunActorsが2回ぶん
    // (敵の行動)続く。敵は1体だけなので、通常の1回ぶんの倍の行動回数になる
    const moveCount = events.filter((e) => e.type === "move").length;
    expect(moveCount).toBe(3); // プレイヤーの移動1回 + 敵の移動2回(runActors 2周ぶん)
    expect(monster.alive).toBe(true);
  });
});

describe("turn golden: 状態異常のtickと満腹度の減少", () => {
  it("毒・混乱を負った状態で6手ぶん進めたときのイベントtype列と満腹度", () => {
    const game = newGame(3);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    game.player.statuses.push({ kind: STATUS_POISON, turns: 3 });
    game.player.statuses.push({ kind: STATUS_CONFUSE, turns: 2 });
    const satietyBefore = game.player.satiety;

    const perTurn: string[][] = [];
    for (let i = 0; i < 6; i++) {
      perTurn.push(types(game.command({ type: "wait" })));
    }

    expect(perTurn).toEqual([
      ["damage"],
      ["damage", "statusEnd", "message"],
      ["damage", "statusEnd", "message"],
      [],
      [],
      [],
    ]);
    expect(game.player.satiety).toBeLessThan(satietyBefore);
  });
});
