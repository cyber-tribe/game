import { describe, expect, it } from "vitest";
import { isFree, type Actor, type MonsterActor } from "../src/core/types";
import { REGION_CHECKPOINT_FLOOR, REGION_DUNGEON_IDS } from "../src/entities/dungeons";
import { Game } from "../src/application/dungeonRun/game";

/**
 * DDD Phase 6(plan/game/ddd-phase6-dungeon-progression.md)の事前ゴールデン
 * テスト。game.tsに残っている階層遷移・フロア入場・地域ギミック・ボス階・
 * 横穴・罠をdomain/dungeon/へ移す前に、実際に1回動かして取得した正確な
 * 値・イベント列を固定する(推測では書かない)。
 */

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
    if (isFree(game.floor, front)) return { dir, front };
  }
  return null;
}

/** 階段の隣接マスから1歩踏み出し、階段の上に立つコマンドのイベント列を返す */
function stepOntoStairs(game: Game): ReturnType<Game["command"]> {
  const candidates: Array<{ from: { x: number; y: number }; dir: 0 | 2 | 4 | 6 }> = [
    { from: { x: game.floor.stairs.x, y: game.floor.stairs.y - 1 }, dir: 4 },
    { from: { x: game.floor.stairs.x - 1, y: game.floor.stairs.y }, dir: 2 },
    { from: { x: game.floor.stairs.x, y: game.floor.stairs.y + 1 }, dir: 0 },
    { from: { x: game.floor.stairs.x + 1, y: game.floor.stairs.y }, dir: 6 },
  ];
  for (const c of candidates) {
    if (c.from.x < 0 || c.from.y < 0 || c.from.x >= game.floor.width || c.from.y >= game.floor.height) continue;
    game.player.pos = { ...c.from };
    return game.command({ type: "move", dir: c.dir });
  }
  return [];
}

describe("game.ts: 階段で降りる→enterFloor→フロア到着までのイベント列", () => {
  it("イベント列と到着後の深度が固定どおりになる", () => {
    const game = new Game({ seed: 1, maxDepth: 30 });
    game.player.pos = { ...game.floor.stairs };

    const events = game.command({ type: "descend" });

    expect(game.depth).toBe(2);
    expect(game.floor.gimmick).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual([
      "descend",
      "message",
      "move",
      "move",
      "move",
      "move",
      "move",
      "move",
      "move",
      "move",
      "move",
    ]);
  });
});

describe("game.ts: チェックポイント階への到達", () => {
  it("めざめの階段の階では、階段に足を踏み入れた瞬間checkpointイベントが出る", () => {
    const region1 = REGION_DUNGEON_IDS[0]!;
    const game = new Game({ seed: 1, dungeonId: region1, startDepth: REGION_CHECKPOINT_FLOOR, maxDepth: 30 });

    const events = stepOntoStairs(game);

    expect(game.onCheckpointFloor).toBe(true);
    expect(events.map((e) => e.type)).toEqual([
      "move",
      "message",
      "checkpoint",
      "tutorialTip",
      "move",
      "move",
      "move",
      "move",
      "move",
      "move",
      "monsterSighted",
    ]);
    expect(events.some((e) => e.type === "checkpoint" && (e as { depth: number }).depth === REGION_CHECKPOINT_FLOOR)).toBe(
      true,
    );
  });
});

describe("game.ts: ボス階入場(専用レイアウト・ボス配置)", () => {
  it("地方最終階では、通常モンスターの代わりに地方ボス1体だけが配置され、階段が塞がれる", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });

    expect(game.floor.stairsBlocked).toBe(true);
    expect(game.floor.door).toEqual({ pos: { x: 10, y: 5 }, open: false, bossSpeciesId: "oonebosuke" });
    expect(game.floor.actors.map((a) => a.kind)).toEqual(["player", "monster"]);
    const boss = game.floor.actors.find((a): a is MonsterActor => a.kind === "monster")!;
    expect(boss.speciesId).toBe("oonebosuke");
  });
});

describe("game.ts: 横穴(branch)へ入る→戻る", () => {
  function findGameWithBranchEntrance(dungeonId: string, startDepth: number): Game | undefined {
    for (let seed = 1; seed <= 200; seed++) {
      const game = new Game({ seed, dungeonId, startDepth });
      if (game.floor.branchEntrance) return game;
    }
    return undefined;
  }

  it("入り口からenterBranchすると横穴1階へ移り、踏破するとdescendで元の階・位置へ戻る", () => {
    const hostRegion2Id = REGION_DUNGEON_IDS[1]!;
    const game = findGameWithBranchEntrance(hostRegion2Id, 2);
    expect(game).toBeDefined();
    if (!game) return;
    const entrance = game.floor.branchEntrance!;
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { ...entrance.pos };
    const hostFloorBefore = game.floor;

    const enterEvents = game.command({ type: "enterBranch" });
    expect(enterEvents.map((e) => e.type)).toEqual(["message", "move", "move"]);
    expect(game.dungeonId).toBe("muddyDepths");
    expect(game.depth).toBe(1);

    const branchMaxDepth = game.maxDepth;
    while (game.depth < branchMaxDepth) {
      game.player.pos = { ...game.floor.stairs };
      game.command({ type: "descend" });
    }
    game.player.pos = { ...game.floor.stairs };
    const returnEvents = game.command({ type: "descend" });

    expect(returnEvents.map((e) => e.type)).toEqual(["message"]);
    expect(game.dungeonId).toBe(hostRegion2Id);
    expect(game.depth).toBe(2);
    expect(game.floor).toBe(hostFloorBefore);
    expect(game.player.pos).toEqual(entrance.pos);
  });
});

describe("game.ts: 罠(代表2種)を踏んだときのイベント列", () => {
  it("矢の罠: ダメージを受け、depth+4のダメージが入る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const { dir, front } = faceOpenDirection(game)!;
    game.floor.traps.push({ pos: front, kind: "damage", revealed: false });
    const hpBefore = game.player.hp;

    const events = game.command({ type: "move", dir });

    expect(events.map((e) => e.type)).toEqual(["move", "trap", "message", "damage"]);
    expect(hpBefore - game.player.hp).toBe(4);
  });

  it("警報の罠: フロア中のモンスターが一斉にawareになる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const { dir, front } = faceOpenDirection(game)!;
    game.floor.traps.push({ pos: front, kind: "alarm", revealed: false });
    const monster: Actor = {
      id: 9001,
      kind: "monster",
      name: "テスト用モンスター",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: false,
    };
    game.floor.actors.push(monster);

    const events = game.command({ type: "move", dir });

    expect(events.map((e) => e.type)).toEqual(["move", "trap", "message"]);
    expect(monster.aware).toBe(true);
  });
});

describe("game.ts: 地域ギミックのtick1周(代表2つ)", () => {
  it("胞子部屋: 在室ターンがSPORE_PULSE_INTERVALに達すると、部屋全体へ睡眠を判定してタイマーが0に戻る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = game.floor.rooms[0]!;
    room.spored = true;
    room.sporeTimer = 7;
    game.player.pos = { x: room.x + 1, y: room.y + 1 };

    const events = game.command({ type: "wait" });

    expect(events.map((e) => e.type)).toEqual(["message", "status", "message", "tutorialTip"]);
    expect(room.sporeTimer).toBe(0);
  });

  it("地方ボスの一時的な奔流タイル: expiresInが尽きると元のタイルに戻り、記録も消える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const pos = { x: 5, y: 5 };
    game.floor.tiles[pos.y * game.floor.width + pos.x]!.kind = 1;
    game.floor.tiles[pos.y * game.floor.width + pos.x]!.torrent = 2;
    const monster: MonsterActor = {
      id: 9002,
      kind: "monster",
      name: "テスト用モンスター",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: false,
      summonedTorrentTiles: [{ pos, expiresIn: 1 }],
    };
    game.floor.actors.push(monster);

    const events = game.command({ type: "wait" });

    expect(events).toEqual([]);
    expect(game.floor.tiles[pos.y * game.floor.width + pos.x]!.torrent).toBeUndefined();
    expect(monster.summonedTorrentTiles).toEqual([]);
  });
});
