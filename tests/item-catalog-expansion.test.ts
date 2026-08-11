import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { type Dir, dirDelta } from "../src/core/grid";
import {
  STATUS_FEAR,
  STATUS_INVISIBLE,
  STATUS_SEAL,
  TILE_ROOM,
  hasStatus,
  isFree,
  type Actor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import { buildDistanceField, decideMonsterAction } from "../src/entities/ai";
import { Game } from "../src/game";

function newGame(seed = 1) {
  return new Game({ seed });
}

/** プレイヤーの正面が空くように向きを選ぶ */
function faceOpenDirection(game: Game): Dir | null {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as Dir[]) {
    const d = dirDelta(dir);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return dir;
    }
  }
  return null;
}

/** 正面に(裸の)モンスターを1体だけ置く */
function putMonsterInFront(game: Game): Actor | null {
  const dir = faceOpenDirection(game);
  if (dir === null) return null;
  game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
  const d = dirDelta(dir);
  const pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
  const monster: Actor = {
    id: 9001,
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
  };
  game.floor.actors.push(monster);
  return monster;
}

describe("がんじょうの葉", () => {
  it("defenseが永続的に1上がる", () => {
    const game = newGame(1);
    const before = game.player.def;
    const item = game.giveItem("toughLeaf")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.player.def).toBe(before + 1);
  });
});

describe("みちしるべの葉", () => {
  it("地図の巻物と違い、フロア全体は判明しない", () => {
    const game = newGame(2);
    const item = game.giveItem("waypointLeaf")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.floor.tiles.every((t) => t.explored)).toBe(false);
  });

  it("階段のマスは探索済みになる", () => {
    const game = newGame(3);
    const item = game.giveItem("waypointLeaf")!;
    game.command({ type: "use", uid: item.uid });
    const stairsTile = game.floor.tiles[game.floor.stairs.y * game.floor.width + game.floor.stairs.x]!;
    expect(stairsTile.explored).toBe(true);
  });
});

describe("とうめいの巻物", () => {
  it("使うと透明になる", () => {
    const game = newGame(4);
    const item = game.giveItem("invisibilityScroll")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(game.player, STATUS_INVISIBLE)).toBe(true);
  });
});

describe("おびえの巻物", () => {
  it("同じ部屋のモンスターにおびえを付与する", () => {
    const game = newGame(5);
    const monster = putMonsterInFront(game);
    if (!monster) return;
    const item = game.giveItem("fearScroll")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(monster, STATUS_FEAR)).toBe(true);
  });
});

describe("引き寄せの杖", () => {
  it("正面のモンスターを1マス引き寄せる", () => {
    const game = newGame(6);
    const monster = putMonsterInFront(game);
    if (!monster) return;
    // 引き寄せる余地を作るため、モンスターを2マス先へ離しておく
    const dir = game.player.facing;
    const delta = dirDelta(dir);
    const farPos = { x: monster.pos.x + delta.x, y: monster.pos.y + delta.y };
    if (!isFree(game.floor, farPos)) return;
    monster.pos = farPos;
    const distanceBefore = Math.max(
      Math.abs(monster.pos.x - game.player.pos.x),
      Math.abs(monster.pos.y - game.player.pos.y),
    );

    const item = game.giveItem("pullStaff")!;
    game.command({ type: "use", uid: item.uid });

    const distanceAfter = Math.max(
      Math.abs(monster.pos.x - game.player.pos.x),
      Math.abs(monster.pos.y - game.player.pos.y),
    );
    expect(distanceAfter).toBe(distanceBefore - 1);
  });
});

describe("かなしばりの杖", () => {
  it("正面のモンスターを封じる", () => {
    const game = newGame(7);
    const monster = putMonsterInFront(game);
    if (!monster) return;
    const item = game.giveItem("sealStaff")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(monster, STATUS_SEAL)).toBe(true);
  });
});

describe("食料の追加", () => {
  it("山の幸は満腹度を150回復する", () => {
    const game = newGame(8);
    game.player.satiety = 10;
    const item = game.giveItem("mountainBounty")!;
    game.command({ type: "use", uid: item.uid });
    // MAX_SATIETYで頭打ちになった直後、useコマンド自体のターン経過ぶん(0.2)減る
    expect(game.player.satiety).toBeCloseTo(100 - 0.2, 5);
  });

  it("ほしぼしは満腹度を15回復する", () => {
    const game = newGame(9);
    game.player.satiety = 10;
    const item = game.giveItem("driedBerries")!;
    game.command({ type: "use", uid: item.uid });
    // useコマンド自体もターンを消費するため、満腹度が1ターンぶん(0.2)減る
    expect(game.player.satiety).toBeCloseTo(25 - 0.2, 5);
  });
});

// ------------------------------------------------------------ AIへの影響

/** 壁のない開けたフロア */
function makeOpenFloor(size = 12): FloorState {
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles.push({ kind: TILE_ROOM, roomId: 0, explored: true, visible: true });
    }
  }
  return {
    depth: 1,
    width: size,
    height: size,
    tiles,
    rooms: [{ id: 0, x: 0, y: 0, w: size, h: size }],
    stairs: { x: size - 1, y: size - 1 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
  };
}

let nextId = 5000;
function makeActor(overrides: Partial<Actor> & Pick<Actor, "kind" | "pos">): Actor {
  return {
    id: nextId++,
    name: "テスト",
    model: "x",
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 5,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

describe("おびえの効果(AI)", () => {
  it("おびえたモンスターは、隣に敵がいても攻撃せず逃げる", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 5 } });
    const monster = makeActor({
      kind: "monster",
      pos: { x: 5, y: 4 },
      aware: true,
      statuses: [{ kind: STATUS_FEAR, turns: 3 }],
    });
    floor.actors.push(leader, monster);
    const field = buildDistanceField(floor, leader.pos);
    const action = decideMonsterAction(new Rng(1), floor, monster, leader, field);
    expect(action.type).toBe("move");
  });
});

describe("透明の効果(AI)", () => {
  it("透明な相手には新たに気づかない", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({
      kind: "player",
      pos: { x: 5, y: 5 },
      statuses: [{ kind: STATUS_INVISIBLE, turns: 3 }],
    });
    const monster = makeActor({ kind: "monster", pos: { x: 5, y: 2 }, aware: false });
    floor.actors.push(leader, monster);
    const field = buildDistanceField(floor, leader.pos);
    decideMonsterAction(new Rng(1), floor, monster, leader, field);
    expect(monster.aware).toBe(false);
  });

  it("透明が解ければ通常どおり気づく", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 5 } });
    const monster = makeActor({ kind: "monster", pos: { x: 5, y: 2 }, aware: false });
    floor.actors.push(leader, monster);
    const field = buildDistanceField(floor, leader.pos);
    decideMonsterAction(new Rng(1), floor, monster, leader, field);
    expect(monster.aware).toBe(true);
  });
});

describe("封じの効果(AI)", () => {
  it("封じられている間は遠隔攻撃(特技)が使えない", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 5 } });
    const monster = makeActor({
      kind: "monster",
      pos: { x: 5, y: 2 },
      aware: true,
      rangedRange: 5,
      statuses: [{ kind: STATUS_SEAL, turns: 3 }],
    });
    floor.actors.push(leader, monster);
    const field = buildDistanceField(floor, leader.pos);
    const action = decideMonsterAction(new Rng(1), floor, monster, leader, field);
    expect(action.type).not.toBe("ranged");
  });

  it("封じられていなければ遠隔攻撃を使う", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 5 } });
    const monster = makeActor({
      kind: "monster",
      pos: { x: 5, y: 2 },
      aware: true,
      rangedRange: 5,
    });
    floor.actors.push(leader, monster);
    const field = buildDistanceField(floor, leader.pos);
    const action = decideMonsterAction(new Rng(1), floor, monster, leader, field);
    expect(action.type).toBe("ranged");
  });
});

describe("封じの効果(特技の追加付与を止める)", () => {
  it("封じられている攻撃者は、通常攻撃に乗る特技(状態異常付与)が出ない", () => {
    const game = newGame(10);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster: Actor = {
      id: 9101,
      kind: "monster",
      name: "封じテスト",
      model: "gajiri",
      pos: { x: game.player.pos.x, y: game.player.pos.y - 1 },
      facing: 4,
      hp: 999,
      maxHp: 999,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [{ kind: STATUS_SEAL, turns: 5 }],
      alive: true,
      aiKind: "melee",
      aware: true,
      inflicts: { kind: "sleep", chance: 1, turns: 5 },
    };
    if (!isFree(game.floor, monster.pos)) return;
    game.floor.actors.push(monster);
    game.command({ type: "wait" });
    expect(hasStatus(game.player, "sleep")).toBe(false);
  });

  it("封じられていなければ、特技(状態異常付与)が確率どおり出る", () => {
    const game = newGame(11);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster: Actor = {
      id: 9102,
      kind: "monster",
      name: "封じ無しテスト",
      model: "gajiri",
      pos: { x: game.player.pos.x, y: game.player.pos.y - 1 },
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
      inflicts: { kind: "sleep", chance: 1, turns: 5 },
    };
    if (!isFree(game.floor, monster.pos)) return;
    game.floor.actors.push(monster);
    game.command({ type: "wait" });
    expect(hasStatus(game.player, "sleep")).toBe(true);
  });
});
