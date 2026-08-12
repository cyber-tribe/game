import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import {
  TILE_ROOM,
  isFree,
  type Actor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import { buildDistanceField, decideAllyAction } from "../src/entities/ai";
import { Game } from "../src/game";
import { type Dir, dirDelta } from "../src/core/grid";

/** 壁のない、全マス歩ける正方形のフロア。AIの分岐を狙って検証するための最小構成 */
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
    goldPiles: [],
  };
}

let nextId = 1;
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

describe("構えとAI(decideAllyAction)", () => {
  it("そばにいろ: 敵が見えていても自分から追わず、主のそばへ戻る", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 2 } });
    const ally = makeActor({ kind: "ally", pos: { x: 5, y: 5 }, stance: "guard" });
    const foe = makeActor({ kind: "monster", pos: { x: 5, y: 8 } });
    floor.actors.push(leader, ally, foe);

    const foeField = buildDistanceField(floor, foe.pos);
    const leaderField = buildDistanceField(floor, leader.pos);
    const action = decideAllyAction(new Rng(1), floor, ally, leader, foeField, leaderField);

    expect(action.type).toBe("move");
    if (action.type === "move") expect(action.dir).toBe(0); // 北(主の方向)へ
  });

  it("そばにいろ: 主の隣接圏内(距離1以内)なら足を止める", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 5, y: 5 } });
    const ally = makeActor({ kind: "ally", pos: { x: 5, y: 6 }, stance: "guard" });
    const foe = makeActor({ kind: "monster", pos: { x: 0, y: 0 } });
    floor.actors.push(leader, ally, foe);

    const foeField = buildDistanceField(floor, foe.pos);
    const leaderField = buildDistanceField(floor, leader.pos);
    const action = decideAllyAction(new Rng(1), floor, ally, leader, foeField, leaderField);
    expect(action.type).toBe("wait");
  });

  it("そこで待て: holdPosへ向かって戻る", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 0, y: 0 } });
    const holdPos = { x: 5, y: 5 };
    const ally = makeActor({
      kind: "ally",
      pos: { x: 8, y: 5 },
      stance: "hold",
      holdPos,
    });
    floor.actors.push(leader, ally);

    const foeField = buildDistanceField(floor, leader.pos);
    const leaderField = buildDistanceField(floor, leader.pos);
    const action = decideAllyAction(new Rng(1), floor, ally, leader, foeField, leaderField);
    expect(action.type).toBe("move");
    if (action.type === "move") {
      const delta = dirDelta(action.dir as Dir);
      const next = { x: ally.pos.x + delta.x, y: ally.pos.y + delta.y };
      expect(Math.abs(next.x - holdPos.x)).toBeLessThan(Math.abs(ally.pos.x - holdPos.x));
    }
  });

  it("そこで待て: すでにholdPosにいれば足を止める", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 0, y: 0 } });
    const holdPos = { x: 5, y: 5 };
    const ally = makeActor({ kind: "ally", pos: { ...holdPos }, stance: "hold", holdPos });
    floor.actors.push(leader, ally);

    const field = buildDistanceField(floor, leader.pos);
    const action = decideAllyAction(new Rng(1), floor, ally, leader, field, field);
    expect(action.type).toBe("wait");
  });

  it("先陣を切れ: 敵がいなければ未探索タイルへ向かう", () => {
    const floor = makeOpenFloor();
    // 右下の一角だけ未探索のままにしておく
    for (let y = 9; y < 12; y++) {
      for (let x = 9; x < 12; x++) {
        floor.tiles[y * floor.width + x]!.explored = false;
      }
    }
    const leader = makeActor({ kind: "player", pos: { x: 0, y: 0 } });
    const ally = makeActor({ kind: "ally", pos: { x: 5, y: 5 }, stance: "vanguard" });
    floor.actors.push(leader, ally);

    const field = buildDistanceField(floor, leader.pos);
    const action = decideAllyAction(new Rng(1), floor, ally, leader, field, field);
    expect(action.type).toBe("move");
    if (action.type === "move") {
      const delta = dirDelta(action.dir as Dir);
      // 未探索の一角(右下)へ向かうので x, y とも増える方向のはず
      expect(delta.x).toBeGreaterThanOrEqual(0);
      expect(delta.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("隣接する敵には、構えによらず反撃する", () => {
    const floor = makeOpenFloor();
    const leader = makeActor({ kind: "player", pos: { x: 0, y: 0 } });
    for (const stance of ["free", "guard", "hold", "vanguard"] as const) {
      const ally = makeActor({ kind: "ally", pos: { x: 5, y: 5 }, stance, holdPos: { x: 5, y: 5 } });
      const foe = makeActor({ kind: "monster", pos: { x: 5, y: 6 } });
      const localFloor = { ...floor, actors: [leader, ally, foe] };
      const field = buildDistanceField(localFloor, leader.pos);
      const action = decideAllyAction(new Rng(1), localFloor, ally, leader, field, field);
      expect(action, `stance=${stance}`).toEqual({ type: "attack", targetId: foe.id });
    }
  });
});

describe("構えの指示(Game)", () => {
  function withAlly(seed: number): { game: Game; allyId: number } {
    const game = new Game({ seed });
    // 開いている方向を向く(barrel.test.ts の faceOpenDirection と同じ考え方)
    for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
      const delta = dirDelta(dir);
      const front = { x: game.player.pos.x + delta.x, y: game.player.pos.y + delta.y };
      if (isFree(game.floor, front)) {
        game.command({ type: "face", dir });
        break;
      }
    }
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.giveBarrel("caught", "gajiri");
    game.command({ type: "throwBarrel" });
    return { game, allyId: game.allies[0]!.id };
  }

  it("捕まえた直後は構えが未設定(おまかせ)になっている", () => {
    const { game } = withAlly(1);
    expect(game.allies[0]!.stance).toBeUndefined();
  });

  it("個別に指示すると、その仲間だけ構えが変わる", () => {
    const { game, allyId } = withAlly(2);
    game.command({ type: "setStance", allyId, stance: "guard" });
    expect(game.allies.find((a) => a.id === allyId)!.stance).toBe("guard");
  });

  it("全員に指示すると、連れている全員の構えが変わる", () => {
    const { game } = withAlly(3);
    game.command({ type: "setStance", allyId: "all", stance: "vanguard" });
    for (const ally of game.allies) expect(ally.stance).toBe("vanguard");
  });

  it("そこで待てを指示すると、その瞬間の座標がholdPosになる", () => {
    const { game, allyId } = withAlly(5);
    const ally = game.allies.find((a) => a.id === allyId)!;
    const posAtOrder = { ...ally.pos };
    game.command({ type: "setStance", allyId, stance: "hold" });
    expect(ally.holdPos).toEqual(posAtOrder);
  });

  it("指示はターンを消費しない", () => {
    const { game, allyId } = withAlly(7);
    const turnBefore = game.turnCount;
    game.command({ type: "setStance", allyId, stance: "guard" });
    expect(game.turnCount).toBe(turnBefore);
  });

  it("指示するとメッセージが流れる", () => {
    const { game, allyId } = withAlly(9);
    const events = game.command({ type: "setStance", allyId, stance: "hold" });
    expect(events.some((e) => e.type === "message" && e.text.includes("そこで待て"))).toBe(true);
  });
});
