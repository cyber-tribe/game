import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { generateFloor, reachableFrom, validate } from "../src/dungeon/generate";
import { updateVisibility } from "../src/dungeon/visibility";
import { TILE_WALL, isWalkable, roomCenter, tileAt } from "../src/core/types";

describe("フロア生成", () => {
  it("1000シードすべてで、歩けるタイルが階段から到達可能", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: (seed % 20) + 1 });
      const seen = reachableFrom(floor, floor.stairs);
      const unreachable = floor.tiles.filter((t, i) => isWalkable(t.kind) && !seen[i]).length;
      expect(unreachable, `seed=${seed} で到達できない床が ${unreachable} マスある`).toBe(0);
    }
  });

  it("1000シードすべてで、全部屋の中心に到達できる", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      expect(validate(floor), `seed=${seed}`).toBe(true);
    }
  });

  it("部屋が4つ以上あり、互いに重ならない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      expect(floor.rooms.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < floor.rooms.length; i++) {
        for (let j = i + 1; j < floor.rooms.length; j++) {
          const a = floor.rooms[i]!;
          const b = floor.rooms[j]!;
          const overlap =
            a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          expect(overlap, `seed=${seed} で部屋 ${i} と ${j} が重なっている`).toBe(false);
        }
      }
    }
  });

  it("外周はすべて壁である", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      for (let x = 0; x < floor.width; x++) {
        expect(tileAt(floor, { x, y: 0 })!.kind).toBe(TILE_WALL);
        expect(tileAt(floor, { x, y: floor.height - 1 })!.kind).toBe(TILE_WALL);
      }
      for (let y = 0; y < floor.height; y++) {
        expect(tileAt(floor, { x: 0, y })!.kind).toBe(TILE_WALL);
        expect(tileAt(floor, { x: floor.width - 1, y })!.kind).toBe(TILE_WALL);
      }
    }
  });

  it("階段は歩けるマスに置かれる", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 1 });
      expect(isWalkable(tileAt(floor, floor.stairs)!.kind)).toBe(true);
    }
  });

  it("同じシードなら同じフロアになる", () => {
    const a = generateFloor(new Rng(12345), { depth: 3 });
    const b = generateFloor(new Rng(12345), { depth: 3 });
    expect(a.tiles.map((t) => t.kind)).toEqual(b.tiles.map((t) => t.kind));
    expect(a.stairs).toEqual(b.stairs);
  });
});

describe("視界", () => {
  it("部屋にいると部屋全体が見える", () => {
    const floor = generateFloor(new Rng(7), { depth: 1 });
    const room = floor.rooms[0]!;
    updateVisibility(floor, roomCenter(room));
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        expect(tileAt(floor, { x, y })!.visible, `(${x},${y}) が見えていない`).toBe(true);
      }
    }
  });

  it("通路にいると周囲8マスだけが見える", () => {
    const floor = generateFloor(new Rng(7), { depth: 1 });
    const corridorIdx = floor.tiles.findIndex((t) => t.kind === 2);
    expect(corridorIdx).toBeGreaterThanOrEqual(0);
    const p = { x: corridorIdx % floor.width, y: Math.floor(corridorIdx / floor.width) };
    updateVisibility(floor, p);
    const visibleCount = floor.tiles.filter((t) => t.visible).length;
    expect(visibleCount).toBeLessThanOrEqual(9);
  });

  it("一度見たタイルは記憶される", () => {
    const floor = generateFloor(new Rng(11), { depth: 1 });
    const first = roomCenter(floor.rooms[0]!);
    updateVisibility(floor, first);
    const remembered = floor.tiles.filter((t) => t.explored).length;
    expect(remembered).toBeGreaterThan(0);

    updateVisibility(floor, roomCenter(floor.rooms[1]!));
    // 別の部屋に移っても、さっき見たぶんは explored のまま残る
    expect(floor.tiles.filter((t) => t.explored).length).toBeGreaterThanOrEqual(remembered);
  });
});
