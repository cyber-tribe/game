import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { ALL_DIRS, dirDelta, dirFromDelta } from "../src/core/grid";
import { isFree, isWalkable, roomContains, walkableAt } from "../src/core/types";
import { generateFloor, reachableFrom, validate } from "../src/dungeon/generate";
import {
  type IdSource,
  choosePlayerStart,
  populateFloor,
} from "../src/dungeon/populate";
import { Game } from "../src/game";

function makeIds(): IdSource {
  let actorId = 0;
  let itemUid = 0;
  let barrelId = 0;
  return {
    nextActorId: () => ++actorId,
    nextItemUid: () => ++itemUid,
    nextBarrelId: () => ++barrelId,
  };
}

function monsterHouseRoomOf(floor: ReturnType<typeof generateFloor>) {
  return floor.rooms.find((r) => r.kind === "monsterHouse");
}

describe("モンスターハウスの生成", () => {
  it("2階以下には出現しない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      expect(monsterHouseRoomOf(floor)).toBeUndefined();
      const floor2 = generateFloor(new Rng(seed), { depth: 2 });
      expect(monsterHouseRoomOf(floor2)).toBeUndefined();
    }
  });

  it("深いフロアでは出現することがある", () => {
    let found = false;
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      if (monsterHouseRoomOf(floor)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("1フロアに複数は出ない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      const count = floor.rooms.filter((r) => r.kind === "monsterHouse").length;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("階段の部屋はモンスターハウスにならない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      const room = monsterHouseRoomOf(floor);
      if (!room) continue;
      expect(roomContains(room, floor.stairs)).toBe(false);
    }
  });

  it("モンスターハウスがあっても、全床タイルが階段から到達可能(退路を塞がない)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      if (!monsterHouseRoomOf(floor)) continue;
      const seen = reachableFrom(floor, floor.stairs);
      const unreachable = floor.tiles.filter((t, i) => isWalkable(t.kind) && !seen[i]).length;
      expect(unreachable, `seed=${seed}`).toBe(0);
      expect(validate(floor), `seed=${seed}`).toBe(true);
    }
  });

  it("プレイヤーの開始地点はモンスターハウスの部屋にならない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 20 });
      const room = monsterHouseRoomOf(floor);
      if (!room) continue;
      const start = choosePlayerStart(rng, floor);
      expect(roomContains(room, start)).toBe(false);
    }
  });
});

describe("モンスターハウスの中身", () => {
  it("部屋の中に5〜8体、全員aware:falseでまとめて湧く(通常予算とは別枠)", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300 && checked < 15; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 20 });
      const room = monsterHouseRoomOf(floor);
      if (!room) continue;
      populateFloor(rng, floor, makeIds(), floor.stairs);

      const inRoom = floor.actors.filter(
        (a) => a.kind === "monster" && roomContains(room, a.pos),
      );
      expect(inRoom.length, `seed=${seed}`).toBeGreaterThanOrEqual(5);
      expect(inRoom.length, `seed=${seed}`).toBeLessThanOrEqual(8);
      expect(inRoom.every((m) => m.aware === false), `seed=${seed}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("ご褒美アイテムが部屋の中に置かれる", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300 && checked < 10; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 20 });
      const room = monsterHouseRoomOf(floor);
      if (!room) continue;
      populateFloor(rng, floor, makeIds(), floor.stairs);

      const rewards = floor.items.filter((gi) => roomContains(room, gi.pos));
      expect(rewards.length, `seed=${seed}`).toBeGreaterThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("しじまの階では、モンスターハウスの中身も湧かない", () => {
    let checked = 0;
    for (let seed = 1; seed <= 400 && checked < 10; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 20, gimmick: "silence" });
      const room = monsterHouseRoomOf(floor);
      if (!room) continue;
      populateFloor(rng, floor, makeIds(), floor.stairs);
      expect(floor.actors.filter((a) => a.kind === "monster")).toHaveLength(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("モンスターハウスの警告(Game)", () => {
  it("部屋に隣接した瞬間に1回だけ気配メッセージが流れ、以後は繰り返さない", () => {
    let found = false;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const game = new Game({ seed, maxDepth: 20 });
      // モンスターハウスのある階まで一息に潜る
      while (game.depth < 20 && game.status === "playing") {
        game.player.pos = { ...game.floor.stairs };
        game.command({ type: "descend" });
        if (game.floor.rooms.some((r) => r.kind === "monsterHouse")) break;
      }
      const room = game.floor.rooms.find((r) => r.kind === "monsterHouse");
      if (!room) continue;

      // 部屋に隣接する、部屋の外の歩行可能マスを探す
      let target: { x: number; y: number } | null = null;
      for (let y = room.y - 1; y <= room.y + room.h && !target; y++) {
        for (let x = room.x - 1; x <= room.x + room.w && !target; x++) {
          const p = { x, y };
          if (roomContains(room, p)) continue;
          if (walkableAt(game.floor, p) && isFree(game.floor, p)) target = p;
        }
      }
      if (!target) continue;

      // target のさらに1マス外側(部屋に隣接しない側)を出発点にする
      let from: { x: number; y: number } | null = null;
      for (const dir of ALL_DIRS) {
        const delta = dirDelta(dir);
        const p = { x: target.x + delta.x, y: target.y + delta.y };
        if (roomContains(room, p)) continue;
        if (chebyshevAdjacent(room, p)) continue;
        if (walkableAt(game.floor, p) && isFree(game.floor, p)) {
          from = p;
          break;
        }
      }
      if (!from) continue;

      game.player.pos = from;
      const dir = dirFromDelta(target.x - from.x, target.y - from.y);
      const events = game.command({ type: "move", dir });
      // 斜め移動が角抜け禁止で弾かれることがある。実際に target まで
      // 動けた場合だけを検証対象にする
      if (game.player.pos.x !== target.x || game.player.pos.y !== target.y) continue;

      const warned = events.filter(
        (e) => e.type === "message" && e.text.includes("ひしめいている気配"),
      );
      expect(warned, `seed=${seed}`).toHaveLength(1);

      // もう一度隣接マス内で動いても、二度目の警告は出ない
      const again = game.command({ type: "wait" });
      expect(again.some((e) => e.type === "message" && e.text.includes("ひしめいている気配"))).toBe(
        false,
      );
      found = true;
    }
    expect(found).toBe(true);
  });
});

function chebyshevAdjacent(room: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }): boolean {
  return (
    p.x >= room.x - 1 &&
    p.x <= room.x + room.w &&
    p.y >= room.y - 1 &&
    p.y <= room.y + room.h
  );
}
