import { describe, expect, it } from "vitest";
import type { AllyActor, MonsterActor } from "../src/core/types";
import { isFree } from "../src/core/types";
import { Game } from "../src/game";

/**
 * DDD Phase 2(plan/game/ddd-phase2-combat-rules.md)のゴールデンテスト。
 * 固定シードのGameを作り、command()が返すGameEvent[]のtypeと主要フィールドの
 * 列を手書きの期待配列として固定する。Phase 2の全コミットでこのテストが
 * 無変更のままpassし続けることが、戦闘計算ルールをdomain/combatへ移す間
 * 挙動を一切変えていないことの証明になる。
 */

function newGame(seed = 1) {
  return new Game({ seed });
}

function faceOpenDirection(game: Game) {
  const deltas = [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
  ];
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
    const d = deltas[dir]!;
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return { dir, front };
    }
  }
  return null;
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

/** イベント列から、比較に使うtypeと主要フィールドだけを抜き出す */
function summarize(events: ReturnType<Game["command"]>) {
  return events.map((e) => {
    switch (e.type) {
      case "attack":
        return { type: e.type, attackerId: e.attackerId, targetId: e.targetId };
      case "damage":
        return { type: e.type, actorId: e.actorId, amount: e.amount, critical: e.critical };
      case "message":
        return { type: e.type, text: e.text };
      case "die":
        return { type: e.type, actorId: e.actorId };
      default:
        return { type: e.type };
    }
  });
}

describe("combat golden: 素の攻撃(命中・ダメージ・会心なし)", () => {
  it("固定シードでの単発攻撃のイベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const setup = faceOpenDirection(game)!;
    putMonster(game, setup.front, { hp: 9999, maxHp: 9999, def: 0, aware: true });

    const events = game.command({ type: "attack" });

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: game.player.id, targetId: 8001 },
      { type: "message", text: "ガルドのこうげき!" },
      { type: "tutorialTip" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: false },
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "ガルドに1のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 1, critical: false },
      { type: "monsterSighted" },
    ]);
  });
});

describe("combat golden: 不意打ち(未発見のモンスターへの攻撃は必ず会心)", () => {
  it("aware:falseのモンスターへの攻撃イベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const setup = faceOpenDirection(game)!;
    putMonster(game, setup.front, { hp: 9999, maxHp: 9999, def: 0, aware: false });

    const events = game.command({ type: "attack" });

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: game.player.id, targetId: 8001 },
      { type: "message", text: "ガルドのこうげき!" },
      { type: "tutorialTip" },
      { type: "message", text: "不意打ち!" },
      { type: "message", text: "会心の一撃!" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: true },
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "ガルドに1のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 1, critical: false },
      { type: "monsterSighted" },
    ]);
  });
});

describe("combat golden: がまんのかまえ(足踏み直後の1撃だけ与ダメージ2倍)", () => {
  it("braced状態での攻撃イベント列(直前の足踏みによる身構えも同時に効く)", () => {
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.rooms = [room];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) game.floor.tiles[y * game.floor.width + x]!.kind = 1;
    }
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    game.runSkills.push("braced");
    game.command({ type: "face", dir: 4 });
    game.command({ type: "wait" });
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 9999, maxHp: 9999, def: 0 });

    const events = game.command({ type: "attack" });

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: game.player.id, targetId: 8001 },
      { type: "message", text: "ガルドのこうげき!" },
      { type: "tutorialTip" },
      { type: "message", text: "テスト用モンスターに16のダメージ!" },
      { type: "damage", actorId: 8001, amount: 16, critical: false },
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "身構えていたので、ダメージをおさえた!" },
      { type: "message", text: "ガルドに1のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 1, critical: false },
      { type: "monsterSighted" },
    ]);
  });
});

describe("combat golden: すてみ(与+50% / 被+25%)", () => {
  it("allInスキルでの攻撃・被弾イベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.hp = 100000;
    game.player.maxHp = 100000;
    game.runSkills.push("allIn");
    const setup = faceOpenDirection(game)!;
    putMonster(game, setup.front, { hp: 9999, maxHp: 9999, def: 0, atk: 10, aware: true });

    const events = game.command({ type: "attack" });

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: game.player.id, targetId: 8001 },
      { type: "message", text: "ガルドのこうげき!" },
      { type: "tutorialTip" },
      { type: "message", text: "テスト用モンスターに12のダメージ!" },
      { type: "damage", actorId: 8001, amount: 12, critical: false },
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "ガルドに9のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 9, critical: false },
      { type: "monsterSighted" },
    ]);
  });
});

describe("combat golden: とどめのさき(HP1/4以下の敵への攻撃は必ず会心)", () => {
  it("finisherスキルでの攻撃イベント列", () => {
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.rooms = [room];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) game.floor.tiles[y * game.floor.width + x]!.kind = 1;
    }
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    game.runSkills.push("finisher");
    game.command({ type: "face", dir: 4 });
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 10, maxHp: 100, def: 0 });

    const events = game.command({ type: "attack" });

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: game.player.id, targetId: 8001 },
      { type: "message", text: "ガルドのこうげき!" },
      { type: "tutorialTip" },
      { type: "message", text: "会心の一撃!" },
      { type: "message", text: "テスト用モンスターに8のダメージ!" },
      { type: "damage", actorId: 8001, amount: 8, critical: true },
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "ガルドに1のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 1, critical: false },
      { type: "monsterSighted" },
    ]);
  });
});

describe("combat golden: 身構え(2割軽減)", () => {
  it("guarding状態での被弾イベント列", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.hp = 100000;
    game.player.maxHp = 100000;
    game.player.guarding = true;
    const setup = faceOpenDirection(game)!;
    const monster = putMonster(game, setup.front, { hp: 100000, maxHp: 100000, def: 0, atk: 20, aware: true });

    const attack = (
      game as unknown as { attack: (attacker: unknown, target: unknown, power: number, events: unknown[]) => void }
    ).attack.bind(game);
    const events: ReturnType<Game["command"]> = [];
    attack(monster, game.player, monster.atk, events);

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "身構えていたので、ダメージをおさえた!" },
      { type: "message", text: "ガルドに14のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 14, critical: false },
    ]);
  });
});

describe("combat golden: 樽受け身(全無効)", () => {
  it("ukemiReady状態での被弾イベント列(ダメージ0)", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.hp = 100000;
    game.player.maxHp = 100000;
    game.player.ukemiReady = true;
    const setup = faceOpenDirection(game)!;
    const monster = putMonster(game, setup.front, { hp: 100000, maxHp: 100000, def: 0, atk: 20, aware: true });

    const attack = (
      game as unknown as { attack: (attacker: unknown, target: unknown, power: number, events: unknown[]) => void }
    ).attack.bind(game);
    const events: ReturnType<Game["command"]> = [];
    attack(monster, game.player, monster.atk, events);

    expect(summarize(events)).toEqual([
      { type: "attack", attackerId: 8001, targetId: game.player.id },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "樽受け身で衝撃を受け流した!" },
      { type: "message", text: "ガルドに0のダメージ!" },
      { type: "damage", actorId: game.player.id, amount: 0, critical: false },
    ]);
    expect(game.player.ukemiReady).toBe(false);
  });
});

describe("combat golden: かばいあい(隣接する仲間が身代わり)", () => {
  it("対象差し替えが起きたときのイベント列", () => {
    let captured: ReturnType<Game["command"]> | null = null;
    for (let seed = 1; seed <= 40 && !captured; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      game.runSkills.push("mutualGuard");
      const ally = addAlly(game, {
        id: 9001,
        hp: 9999,
        maxHp: 9999,
        def: 0,
        pos: { x: game.player.pos.x + 1, y: game.player.pos.y },
      });
      const monster = putMonster(game, { x: game.player.pos.x - 1, y: game.player.pos.y }, {
        id: 8001,
        atk: 5,
        def: 0,
      });

      const attack = (
        game as unknown as { attack: (attacker: unknown, target: unknown, power: number, events: unknown[]) => void }
      ).attack.bind(game);
      const playerHpBefore = game.player.hp;
      const events: ReturnType<Game["command"]> = [];
      attack(monster, game.player, monster.atk, events);
      if (game.player.hp === playerHpBefore && ally.hp < ally.maxHp) {
        captured = events;
      }
    }
    expect(captured).not.toBeNull();
    expect(summarize(captured!)).toEqual([
      { type: "message", text: "ガジリねずみが身代わりになった!" },
      { type: "attack", attackerId: 8001, targetId: 9001 },
      { type: "message", text: "テスト用モンスターのこうげき!" },
      { type: "message", text: "ガジリねずみに5のダメージ!" },
      { type: "damage", actorId: 9001, amount: 5, critical: false },
    ]);
  });
});
