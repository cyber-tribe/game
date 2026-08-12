import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/dungeon/generate";
import { placeSporeRooms } from "../src/dungeon/populate";
import { roomCenter, roomContains } from "../src/core/types";

describe("dungeon/populate.ts: placeSporeRooms", () => {
  it("店・モンスターハウス・階段の部屋には付与されない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(new Rng(seed), {
        depth: 13,
        shopChanceMultiplier: 5,
        monsterHouseChanceMultiplier: 5,
      });
      placeSporeRooms(new Rng(seed), floor);
      for (const room of floor.rooms) {
        if (room.kind !== undefined || roomContains(room, floor.stairs)) {
          expect(room.spored).toBeFalsy();
        }
      }
    }
  });

  it("通常の部屋には胞子部屋が付与されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 13 });
      placeSporeRooms(new Rng(seed), floor);
      found = floor.rooms.some((r) => r.spored);
    }
    expect(found).toBe(true);
  });
});

describe("game.ts: 表の寝穴の第三地方(13〜18階)にだけ胞子部屋が生成される", () => {
  it("13〜18階では胞子部屋が生成されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const game = new Game({ seed, startDepth: 13 });
      found = game.floor.rooms.some((r) => r.spored);
    }
    expect(found).toBe(true);
  });

  it("第二地方(7〜12階)には胞子部屋が生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, startDepth: 7 });
      expect(game.floor.rooms.some((r) => r.spored)).toBe(false);
    }
  });

  it("第四地方(19階)には胞子部屋が生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, startDepth: 19 });
      expect(game.floor.rooms.some((r) => r.spored)).toBe(false);
    }
  });
});

describe("game.ts: 胞子部屋の睡眠パルス(tickSporeRooms)", () => {
  function setupSporedRoom(seed: number) {
    const game = new Game({ seed });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
    room.kind = undefined;
    room.spored = true;
    room.sporeTimer = 0;
    game.player.pos = { ...roomCenter(room) };
    return { game, room };
  }

  it("誰かが8ターン居続けると、部屋にパルスメッセージが出てタイマーが0に戻る", () => {
    const { game, room } = setupSporedRoom(1);
    let events: ReturnType<typeof game.command> = [];
    for (let i = 0; i < 8; i++) {
      events = game.command({ type: "wait" });
    }
    expect(room.sporeTimer).toBe(0);
    expect(events.some((e) => e.type === "message" && e.text === "むわっと、胞子が満ちた……")).toBe(true);
  });

  it("7ターンまではパルスが起きない", () => {
    const { game, room } = setupSporedRoom(1);
    for (let i = 0; i < 7; i++) {
      game.command({ type: "wait" });
    }
    expect(room.sporeTimer).toBe(7);
  });

  it("誰もいないターンはカウントされない", () => {
    const { game, room } = setupSporedRoom(1);
    game.command({ type: "wait" });
    game.command({ type: "wait" });
    expect(room.sporeTimer).toBe(2);
    // 部屋の外へ出す
    game.player.pos = { x: room.x - 2, y: room.y };
    game.command({ type: "wait" });
    expect(room.sporeTimer).toBe(2);
  });

  it("パルスで部屋の中の敵味方が眠らされることがある", () => {
    let slept = false;
    for (let seed = 1; seed <= 30 && !slept; seed++) {
      const { game, room } = setupSporedRoom(seed);
      for (let i = 0; i < 8; i++) {
        game.command({ type: "wait" });
      }
      slept = game.player.statuses.some((s) => s.kind === "sleep");
      void room;
    }
    expect(slept).toBe(true);
  });
});

describe("game.ts: ばくはつタルで胞子部屋を無効化する", () => {
  it("胞子部屋でタルを爆発させると、その部屋のsporedがfalseになる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
    room.kind = undefined;
    room.spored = true;
    const center = { ...roomCenter(room) };
    game.player.pos = center;

    const explode = (
      game as unknown as { explode: (pos: unknown, events: unknown[], throwerId?: number) => void }
    ).explode.bind(game);
    explode(center, []);

    expect(room.spored).toBe(false);
  });
});
