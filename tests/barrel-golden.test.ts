import { describe, expect, it } from "vitest";
import type { AllyActor, Barrel, MonsterActor } from "../src/core/types";
import { TILE_ROOM, TILE_WALL } from "../src/core/types";
import { Game } from "../src/application/dungeonRun/game";

/**
 * DDD Phase 3(plan/game/ddd-phase3-barrel-domain.md)のゴールデンテスト。
 * 固定シードのGameを作り、command()が返すGameEvent[]のtypeと主要フィールドの
 * 列を手書きの期待配列として固定する。Phase 3の全コミットでこのテストが
 * 無変更のままpassし続けることが、タルのルールをdomain/barrelへ移す間
 * 挙動を一切変えていないことの証明になる。
 */

function newGame(seed = 1) {
  return new Game({ seed });
}

/** プレイヤーの周囲を8x8の開けた部屋にし、床のない場所へ移す(壁バンプを避ける) */
function openRoom(game: Game) {
  const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
  game.floor.rooms = [room];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      game.floor.tiles[y * game.floor.width + x]!.kind = TILE_ROOM;
    }
  }
  game.player.pos = { x: room.x + 4, y: room.y + 4 };
  game.command({ type: "face", dir: 4 }); // 南向き
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
    atk: 0,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: false,
    ...overrides,
  };
  game.floor.actors.push(monster);
  return monster;
}

function putBarrel(game: Game, pos: { x: number; y: number }, overrides: Partial<Barrel> = {}): Barrel {
  const barrel: Barrel = { id: 7001, kind: "empty", pos, ...overrides };
  game.floor.barrels.push(barrel);
  return barrel;
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

/** イベント列から、比較に使うtypeと主要フィールドだけを抜き出す */
function summarize(events: ReturnType<Game["command"]>) {
  return events.map((e) => {
    switch (e.type) {
      case "liftBarrel":
        return { type: e.type, actorId: e.actorId, barrelId: e.barrelId, kind: e.kind };
      case "putBarrel":
        return { type: e.type, actorId: e.actorId, barrelId: e.barrelId, pos: e.pos };
      case "throwBarrel":
        return { type: e.type, actorId: e.actorId, barrelId: e.barrelId, from: e.from, to: e.to };
      case "barrelBreak":
        return { type: e.type, barrelId: e.barrelId, pos: e.pos };
      case "barrelOpen":
        return { type: e.type, barrelId: e.barrelId, kind: e.kind, pos: e.pos };
      case "capture":
        return { type: e.type, actorId: e.actorId, barrelId: e.barrelId, name: e.name };
      case "captureFailed":
        return { type: e.type, actorId: e.actorId, name: e.name };
      case "explosion":
        return { type: e.type, pos: e.pos, radius: e.radius };
      case "recruit":
        return { type: e.type, actorId: e.actorId, name: e.name };
      case "spawn":
        return { type: e.type, actorId: e.actorId };
      case "message":
        return { type: e.type, text: e.text };
      case "damage":
        return { type: e.type, actorId: e.actorId, amount: e.amount, critical: e.critical };
      case "die":
        return { type: e.type, actorId: e.actorId };
      default:
        return { type: e.type };
    }
  });
}

describe("barrel golden: 持ち上げ→置く(正面が空いている)", () => {
  it("正面に置くイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    putBarrel(game, { x: game.player.pos.x, y: game.player.pos.y + 1 });

    const lifted = game.command({ type: "liftBarrel" });
    const placed = game.command({ type: "liftBarrel" });

    expect(summarize(lifted)).toEqual([
      { type: "liftBarrel", actorId: game.player.id, barrelId: 7001, kind: "empty" },
      { type: "message", text: "からのタルを持ち上げた。" },
      { type: "tutorialTip" },
    ]);
    expect(summarize(placed)).toEqual([
      { type: "putBarrel", actorId: game.player.id, barrelId: 7001, pos: { x: game.player.pos.x, y: game.player.pos.y + 1 } },
      { type: "message", text: "からのタルを置いた。" },
    ]);
  });
});

describe("barrel golden: 持ち上げ→置く(正面が塞がっている)", () => {
  it("近くの空きマスへ置くイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    putBarrel(game, { x: game.player.pos.x, y: game.player.pos.y + 1 });
    game.command({ type: "liftBarrel" });
    // 正面(南)を壁でふさぐ
    const front = { x: game.player.pos.x, y: game.player.pos.y + 1 };
    game.floor.tiles[front.y * game.floor.width + front.x]!.kind = TILE_WALL;

    const placed = game.command({ type: "liftBarrel" });

    expect(summarize(placed)).toEqual([
      { type: "putBarrel", actorId: game.player.id, barrelId: 7001, pos: { x: 5, y: 6 } },
      { type: "message", text: "からのタルを置いた。" },
    ]);
  });
});

describe("barrel golden: 空タル投げ→命中→捕獲成功", () => {
  it("captureイベントが入るイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    const monster = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 2 }, {
      hp: 9999,
      maxHp: 9999,
    });
    game.player.carrying = { id: 7001, kind: "empty", pos: game.player.pos };
    game.player.critBarrelReady = true; // 捕獲判定を必中にする(乱数依存を避ける)

    const events = game.command({ type: "throwBarrel" });

    expect(summarize(events)).toEqual([
      { type: "throwBarrel", actorId: game.player.id, barrelId: 7001, from: { x: 6, y: 6 }, to: { x: 6, y: 8 } },
      { type: "message", text: "からのタルを投げた!" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: true },
      { type: "capture", actorId: 8001, barrelId: 7001, name: "テスト用モンスター" },
      { type: "message", text: "テスト用モンスターをタルに吸い込んだ!" },
    ]);
    expect(monster).toBeDefined();
  });
});

describe("barrel golden: 空タル投げ→捕獲失敗", () => {
  it("captureFailed→ドロップのイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 2 }, {
      hp: 9999,
      maxHp: 9999,
    });
    game.player.carrying = { id: 7001, kind: "empty", pos: game.player.pos };

    const events = game.command({ type: "throwBarrel" });

    expect(summarize(events)).toEqual([
      { type: "throwBarrel", actorId: game.player.id, barrelId: 7001, from: { x: 6, y: 6 }, to: { x: 6, y: 8 } },
      { type: "message", text: "からのタルを投げた!" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: false },
      { type: "captureFailed", actorId: 8001, name: "テスト用モンスター" },
      { type: "message", text: "テスト用モンスターはタルから逃れた! タルはその場に落ちた。" },
      { type: "move" },
    ]);
  });
});

describe("barrel golden: 空タル投げ→満員(MAX_ALLIES)は判定に進まない", () => {
  it("捕獲判定をスキップしてドロップするイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    addAlly(game, { id: 9001, pos: { x: game.player.pos.x - 3, y: game.player.pos.y - 3 } });
    addAlly(game, { id: 9002, pos: { x: game.player.pos.x - 3, y: game.player.pos.y - 4 } });
    const monster = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 2 }, {
      hp: 9999,
      maxHp: 9999,
    });
    game.player.carrying = { id: 7001, kind: "empty", pos: game.player.pos };

    const events = game.command({ type: "throwBarrel" });

    expect(summarize(events)).toEqual([
      { type: "throwBarrel", actorId: game.player.id, barrelId: 7001, from: { x: 6, y: 6 }, to: { x: 6, y: 8 } },
      { type: "message", text: "からのタルを投げた!" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: false },
      { type: "message", text: "これ以上は連れて歩けない。" },
      { type: "move" },
      { type: "move" },
      { type: "move" },
      { type: "monsterSighted" },
    ]);
    expect(monster).toBeDefined();
  });
});

describe("barrel golden: ボムタルの爆発(範囲・巻き添え)", () => {
  it("爆発のイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    const target = { x: game.player.pos.x, y: game.player.pos.y + 2 };
    putMonster(game, target, { hp: 9999, maxHp: 9999, def: 0 });
    putMonster(game, { x: target.x + 1, y: target.y }, { id: 8002, hp: 9999, maxHp: 9999, def: 0 });
    putBarrel(game, { x: target.x, y: target.y + 1 }, { id: 7002 });
    game.player.carrying = { id: 7001, kind: "bomb", pos: game.player.pos };

    const events = game.command({ type: "throwBarrel" });

    expect(summarize(events)).toEqual([
      { type: "throwBarrel", actorId: game.player.id, barrelId: 7001, from: { x: 6, y: 6 }, to: { x: 6, y: 8 } },
      { type: "message", text: "ばくはつタルを投げた!" },
      { type: "explosion", pos: { x: 6, y: 8 }, radius: 1 },
      { type: "message", text: "タルが爆発した!" },
      { type: "message", text: "テスト用モンスターに22のダメージ!" },
      { type: "damage", actorId: 8001, amount: 22, critical: false },
      { type: "message", text: "テスト用モンスターに20のダメージ!" },
      { type: "damage", actorId: 8002, amount: 20, critical: false },
      { type: "barrelBreak", barrelId: 7002, pos: { x: 6, y: 9 } },
      { type: "barrelBreak", barrelId: 7001, pos: { x: 6, y: 8 } },
      { type: "move" },
      { type: "move" },
    ]);
  });
});

describe("barrel golden: 水タルをあける", () => {
  it("周囲が水びたしになるイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    game.player.carrying = { id: 7001, kind: "water", pos: game.player.pos };

    const events = game.command({ type: "openBarrel" });

    expect(summarize(events)).toEqual([
      { type: "message", text: "水タルをあけた!" },
      { type: "barrelOpen", barrelId: 7001, kind: "water", pos: { x: 6, y: 7 } },
      { type: "message", text: "周囲が水びたしになった。" },
      { type: "message", text: "からのタルに戻った。" },
    ]);
  });
});

describe("barrel golden: 風タルをあける", () => {
  it("隣接する敵を押し出すイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 9999, maxHp: 9999 });
    game.player.carrying = { id: 7001, kind: "wind", pos: game.player.pos };

    const events = game.command({ type: "openBarrel" });

    expect(summarize(events)).toEqual([
      { type: "message", text: "風タルをあけた!" },
      { type: "barrelOpen", barrelId: 7001, kind: "wind", pos: { x: 6, y: 6 } },
      { type: "move" },
      { type: "message", text: "からのタルに戻った。" },
      { type: "move" },
    ]);
  });
});

describe("barrel golden: 石タルをあける", () => {
  it("正面に壁ができるイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    game.player.carrying = { id: 7001, kind: "stone", pos: game.player.pos };

    const events = game.command({ type: "openBarrel" });

    expect(summarize(events)).toEqual([
      { type: "message", text: "石タルをあけた!" },
      { type: "barrelOpen", barrelId: 7001, kind: "stone", pos: { x: 6, y: 7 } },
      { type: "message", text: "岩の壁ができた!" },
      { type: "message", text: "からのタルに戻った。" },
    ]);
  });
});

describe("barrel golden: ねむタルをあける", () => {
  it("周囲の敵に眠りをばらまくイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 9999, maxHp: 9999 });
    game.player.carrying = { id: 7001, kind: "sleep", pos: game.player.pos };

    const events = game.command({ type: "openBarrel" });

    expect(summarize(events)).toEqual([
      { type: "message", text: "ねむタルをあけた!" },
      { type: "barrelOpen", barrelId: 7001, kind: "sleep", pos: { x: 6, y: 6 } },
      { type: "status" },
      { type: "message", text: "テスト用モンスターは眠ってしまった!" },
      { type: "message", text: "からのタルに戻った。" },
      { type: "monsterSighted" },
    ]);
  });
});

describe("barrel golden: いたわり投げ(HP1ちょうどまで削る)", () => {
  it("gentleThrowスキルでのダメージ・HP", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    openRoom(game);
    game.runSkills.push("gentleThrow");
    const monster = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 2 }, {
      hp: 30,
      maxHp: 9999,
    });
    game.player.carrying = { id: 7001, kind: "empty", pos: game.player.pos };

    const events = game.command({ type: "throwBarrel" });

    expect(summarize(events)).toEqual([
      { type: "throwBarrel", actorId: game.player.id, barrelId: 7001, from: { x: 6, y: 6 }, to: { x: 6, y: 8 } },
      { type: "message", text: "からのタルを投げた!" },
      { type: "message", text: "テスト用モンスターに29のダメージ!" },
      { type: "damage", actorId: 8001, amount: 29, critical: false },
      { type: "capture", actorId: 8001, barrelId: 7001, name: "テスト用モンスター" },
      { type: "message", text: "テスト用モンスターをタルに吸い込んだ!" },
    ]);
    expect(monster.hp).toBe(1);
  });
});
