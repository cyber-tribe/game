import { describe, expect, it } from "vitest";
import { chebyshev, eq } from "../src/core/grid";
import { STATUS_SLEEP, TILE_ROOM, TILE_WALL, type Actor, type TileKind } from "../src/core/types";
import { Game } from "../src/game";

function monster(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 100,
    kind: "monster",
    name: "テスト用モンスター",
    model: "slime",
    pos: { x: 5, y: 5 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [{ kind: STATUS_SLEEP, turns: 99 }],
    alive: true,
    aiKind: "melee",
    aware: true,
    ...overrides,
  };
}

function ally(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 101,
    kind: "ally",
    name: "テスト用の仲間",
    model: "purun",
    pos: { x: 5, y: 5 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [{ kind: STATUS_SLEEP, turns: 99 }],
    alive: true,
    ...overrides,
  };
}

function forceRoomTiles(game: Game, positions: { x: number; y: number }[], kind: TileKind = TILE_ROOM): void {
  for (const p of positions) {
    game.floor.tiles[p.y * game.floor.width + p.x]!.kind = kind;
  }
}

describe("game.ts: プレイヤーと敵モンスターの重なりフェイルセーフ(plan/actor-overlap-failsafe.md)", () => {
  it("重なりを検知すると、敵モンスターを隣接する空きマスへ退避させる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { x: 5, y: 5 };
    forceRoomTiles(game, [
      { x: 5, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 5 },
      { x: 6, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ]);
    const foe = monster({ pos: { x: 5, y: 5 } });
    game.floor.actors.push(foe);

    game.command({ type: "wait" });

    expect(eq(foe.pos, game.player.pos)).toBe(false);
    expect(chebyshev(foe.pos, game.player.pos)).toBe(1);
    // 上下左右→斜めの順で最初に見つかったマス。全方位空いているので北({x:5,y:4})が選ばれる
    expect(foe.pos).toEqual({ x: 5, y: 4 });
  });

  it("北が塞がっていれば、次点(東)の空きマスへ退避させる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { x: 5, y: 5 };
    forceRoomTiles(game, [
      { x: 5, y: 5 },
      { x: 5, y: 4 }, // 北
      { x: 6, y: 5 }, // 東
      { x: 5, y: 6 }, // 南
      { x: 4, y: 5 }, // 西
    ]);
    forceRoomTiles(game, [{ x: 5, y: 4 }], TILE_WALL); // 北だけ壁で塞ぐ
    const foe = monster({ pos: { x: 5, y: 5 } });
    game.floor.actors.push(foe);

    game.command({ type: "wait" });

    expect(foe.pos).toEqual({ x: 6, y: 5 });
  });

  it("退避先が一切なければ、プレイヤーを直前のマスへ押し戻す", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { x: 5, y: 5 };
    // 周囲8マスをすべて壁にして退避先を封じる
    forceRoomTiles(game, [{ x: 5, y: 5 }]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        forceRoomTiles(game, [{ x: 5 + dx, y: 5 + dy }], TILE_WALL);
      }
    }
    const foe = monster({ pos: { x: 5, y: 5 } });
    game.floor.actors.push(foe);

    const resolve = (
      game as unknown as {
        resolveActorOverlaps: (events: unknown[], playerPosBeforeCommand: { x: number; y: number }) => void;
      }
    ).resolveActorOverlaps.bind(game);
    const events: { type: string }[] = [];
    resolve(events, { x: 4, y: 4 });

    expect(game.player.pos).toEqual({ x: 4, y: 4 });
    expect(foe.pos).toEqual({ x: 5, y: 5 }); // モンスター自体は動かせなかったのでそのまま
  });

  it("味方(仲間)との重なりには適用されない(既存の入れ替え仕様のまま)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { x: 5, y: 5 };
    forceRoomTiles(game, [
      { x: 5, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 5 },
      { x: 6, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ]);
    const buddy = ally({ pos: { x: 5, y: 5 } });
    game.floor.actors.push(buddy);

    game.command({ type: "wait" });

    expect(buddy.pos).toEqual({ x: 5, y: 5 });
  });
});
