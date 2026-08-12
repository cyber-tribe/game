import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/dungeon/generate";
import { placeDecoyBarrels, placeDecoyStairs, type IdSource } from "../src/dungeon/populate";
import { roomContains } from "../src/core/types";

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

describe("dungeon/populate.ts: placeDecoyStairs", () => {
  it("店・モンスターハウス・本物の階段の部屋には付与されない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(new Rng(seed), {
        depth: 37,
        shopChanceMultiplier: 5,
        monsterHouseChanceMultiplier: 5,
      });
      placeDecoyStairs(new Rng(seed), floor);
      const stairsRoom = floor.rooms.find((r) => roomContains(r, floor.stairs));
      for (const pos of floor.decoyStairsPositions ?? []) {
        const room = floor.rooms.find((r) => roomContains(r, pos));
        expect(room).toBeDefined();
        expect(room!.kind).toBeUndefined();
        expect(room).not.toBe(stairsRoom);
      }
    }
  });

  it("1〜2箇所の偽の階段が生成されうる", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 37 });
      placeDecoyStairs(new Rng(seed), floor);
      const count = floor.decoyStairsPositions?.length ?? 0;
      found = count >= 1 && count <= 2;
    }
    expect(found).toBe(true);
  });
});

describe("dungeon/populate.ts: placeDecoyBarrels", () => {
  it("1〜2個の偽のタル(decoy: true)が追加される", () => {
    const floor = generateFloor(new Rng(1), { depth: 37 });
    const before = floor.barrels.length;
    placeDecoyBarrels(new Rng(1), floor, makeIds());
    const added = floor.barrels.slice(before);
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(added.length).toBeLessThanOrEqual(2);
    for (const barrel of added) expect(barrel.decoy).toBe(true);
  });
});

describe("game.ts: 表の寝穴の第七地方(37〜42階)にだけ偽の階段・偽のタルが生成される", () => {
  it("37〜42階では偽の階段・偽のタルが生成されうる", () => {
    let foundStairs = false;
    let foundBarrel = false;
    for (let seed = 1; seed <= 20 && !(foundStairs && foundBarrel); seed++) {
      const game = new Game({ seed, startDepth: 37 });
      if ((game.floor.decoyStairsPositions?.length ?? 0) > 0) foundStairs = true;
      if (game.floor.barrels.some((b) => b.decoy)) foundBarrel = true;
    }
    expect(foundStairs).toBe(true);
    expect(foundBarrel).toBe(true);
  });

  it("第六地方(31〜36階)には偽の階段・偽のタルが生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, startDepth: 31 });
      expect(game.floor.decoyStairsPositions ?? []).toHaveLength(0);
      expect(game.floor.barrels.some((b) => b.decoy)).toBe(false);
    }
  });
});

describe("game.ts: 偽の階段", () => {
  it("偽の階段の上で降りようとしても次の階へは進まず、幻だったと判明して消える", () => {
    const game = new Game({ seed: 1, startDepth: 37 });
    game.floor.decoyStairsPositions = [{ x: 3, y: 3 }];
    game.player.pos = { x: 3, y: 3 };
    const depthBefore = game.depth;

    const events = game.command({ type: "descend" });

    expect(game.depth).toBe(depthBefore);
    expect(events.some((e) => e.type === "message" && e.text === "――幻だったらしい。")).toBe(true);
    expect(game.floor.decoyStairsPositions).toHaveLength(0);
  });

  it("本物の階段は、偽の階段があっても通常どおり機能する", () => {
    const game = new Game({ seed: 1, startDepth: 37 });
    game.floor.decoyStairsPositions = [{ x: 3, y: 3 }];
    game.player.pos = { ...game.floor.stairs };
    const depthBefore = game.depth;

    const events = game.command({ type: "descend" });

    expect(game.depth).toBe(depthBefore + 1);
    expect(events.some((e) => e.type === "message" && e.text === "――幻だったらしい。")).toBe(false);
  });
});

describe("game.ts: 偽のタル", () => {
  it("偽のタルを持ち上げようとすると、持ち上げは成立せず幻だったと判明して消える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.barrels = [{ id: 999, kind: "empty", pos: { ...game.player.pos }, decoy: true }];

    const events = game.command({ type: "liftBarrel" });

    expect(game.player.carrying).toBeNull();
    expect(game.floor.barrels).toHaveLength(0);
    expect(events.some((e) => e.type === "message" && e.text === "――タルだと思ったが、幻だった。")).toBe(
      true,
    );
  });

  it("本物のタルは、偽のタルの実装後も通常どおり持ち上げられる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.barrels = [{ id: 1000, kind: "empty", pos: { ...game.player.pos } }];

    const events = game.command({ type: "liftBarrel" });

    expect(game.player.carrying?.id).toBe(1000);
    expect(events.some((e) => e.type === "message" && e.text.includes("幻"))).toBe(false);
  });
});
