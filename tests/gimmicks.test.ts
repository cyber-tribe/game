import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { roomCenter, type FloorGimmickKind } from "../src/core/types";
import { GIMMICK_MESSAGES, GIMMICK_NAMES, pickFloorGimmick } from "../src/domain/dungeon/gimmicks";
import { generateFloor } from "../src/domain/dungeon/generate";
import { type IdSource, populateFloor } from "../src/domain/dungeon/populate";
import { updateVisibility } from "../src/domain/dungeon/visibility";
import { Game } from "../src/application/dungeonRun/game";

const ALL_GIMMICKS: readonly FloorGimmickKind[] = [
  "darkness",
  "alert",
  "pitfall",
  "feast",
  "windfall",
  "silence",
];

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

describe("フロアギミックの抽選", () => {
  it("1階には乗らない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(pickFloorGimmick(new Rng(seed), 1)).toBeUndefined();
    }
  });

  it("連続する階で同じギミックは選ばれない", () => {
    const rng = new Rng(7);
    let previous: FloorGimmickKind | undefined;
    for (let depth = 2; depth <= 2000; depth++) {
      const gimmick = pickFloorGimmick(rng, depth, previous);
      if (gimmick !== undefined && previous !== undefined) {
        expect(gimmick).not.toBe(previous);
      }
      previous = gimmick;
    }
  });

  it("だいたい3割の階に乗る", () => {
    const rng = new Rng(123);
    let count = 0;
    const trials = 5000;
    let previous: FloorGimmickKind | undefined;
    for (let i = 0; i < trials; i++) {
      const gimmick = pickFloorGimmick(rng, 2, previous);
      if (gimmick !== undefined) count++;
      previous = gimmick;
    }
    const rate = count / trials;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.35);
  });

  it("全種類に名前とメッセージが定義されている", () => {
    for (const kind of ALL_GIMMICKS) {
      expect(GIMMICK_NAMES[kind]).toBeTruthy();
      expect(GIMMICK_MESSAGES[kind]).toBeTruthy();
    }
  });
});

describe("フロア生成とギミック", () => {
  it("指定したギミックがFloorStateに反映される", () => {
    for (const kind of ALL_GIMMICKS) {
      const floor = generateFloor(new Rng(1), { depth: 5, gimmick: kind });
      expect(floor.gimmick).toBe(kind);
    }
  });

  it("ギミックを指定しなければ乗らない", () => {
    const floor = generateFloor(new Rng(1), { depth: 5 });
    expect(floor.gimmick).toBeUndefined();
  });
});

describe("populateFloorとギミック", () => {
  it("しじまの階では野生モンスターが出現しない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 5, gimmick: "silence" });
      populateFloor(rng, floor, makeIds(), floor.stairs);
      expect(floor.actors.filter((a) => a.kind === "monster")).toHaveLength(0);
    }
  });

  it("ざわめきの階ではモンスターが最初からawareで配置される", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      const floor = generateFloor(rng, { depth: 5, gimmick: "alert" });
      populateFloor(rng, floor, makeIds(), floor.stairs);
      const monsters = floor.actors.filter((a) => a.kind === "monster");
      expect(monsters.length).toBeGreaterThan(0);
      expect(monsters.every((m) => m.aware === true)).toBe(true);
    }
  });

  it("山分けの階ではモンスター・アイテム・タルが通常より多い", () => {
    // 個々のシードでは基準となる乱数の出目次第で同数になることもあるので、
    // 多シードの合計で比べる(倍率をかけた側が期待値として上回ることを見る)
    let normalMonsters = 0;
    let windfallMonsters = 0;
    let normalItems = 0;
    let windfallItems = 0;
    let normalBarrels = 0;
    let windfallBarrels = 0;

    for (let seed = 1; seed <= 50; seed++) {
      const normalRng = new Rng(seed);
      const normalFloor = generateFloor(normalRng, { depth: 5 });
      populateFloor(normalRng, normalFloor, makeIds(), normalFloor.stairs);
      normalMonsters += normalFloor.actors.filter((a) => a.kind === "monster").length;
      normalItems += normalFloor.items.length;
      normalBarrels += normalFloor.barrels.length;

      const windfallRng = new Rng(seed);
      const windfallFloor = generateFloor(windfallRng, { depth: 5, gimmick: "windfall" });
      populateFloor(windfallRng, windfallFloor, makeIds(), windfallFloor.stairs);
      windfallMonsters += windfallFloor.actors.filter((a) => a.kind === "monster").length;
      windfallItems += windfallFloor.items.length;
      windfallBarrels += windfallFloor.barrels.length;
    }

    expect(windfallMonsters).toBeGreaterThan(normalMonsters);
    expect(windfallItems).toBeGreaterThan(normalItems);
    expect(windfallBarrels).toBeGreaterThan(normalBarrels);
  });

  it("おちあなの階では落とし穴トラップの出現比率が上がる", () => {
    let normalPitfalls = 0;
    let normalTotal = 0;
    let gimmickPitfalls = 0;
    let gimmickTotal = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const normalRng = new Rng(seed);
      const normalFloor = generateFloor(normalRng, { depth: 10 });
      populateFloor(normalRng, normalFloor, makeIds(), normalFloor.stairs);
      normalTotal += normalFloor.traps.length;
      normalPitfalls += normalFloor.traps.filter((t) => t.kind === "pitfall").length;

      const gimmickRng = new Rng(seed);
      const gimmickFloor = generateFloor(gimmickRng, { depth: 10, gimmick: "pitfall" });
      populateFloor(gimmickRng, gimmickFloor, makeIds(), gimmickFloor.stairs);
      gimmickTotal += gimmickFloor.traps.length;
      gimmickPitfalls += gimmickFloor.traps.filter((t) => t.kind === "pitfall").length;
    }
    expect(gimmickPitfalls / gimmickTotal).toBeGreaterThan(normalPitfalls / normalTotal);
  });
});

describe("視界とくらやみの階", () => {
  it("くらやみの階では、部屋にいても見えるタイル数が減る", () => {
    const normalFloor = generateFloor(new Rng(9), { depth: 5 });
    const darkFloor = generateFloor(new Rng(9), { depth: 5, gimmick: "darkness" });
    // 同じ乱数消費量なので地形そのものは同一になるはず
    expect(darkFloor.rooms).toEqual(normalFloor.rooms);

    const viewer = roomCenter(normalFloor.rooms[0]!);
    updateVisibility(normalFloor, viewer);
    updateVisibility(darkFloor, viewer);

    const countVisible = (floor: typeof normalFloor) =>
      floor.tiles.filter((t) => t.visible).length;

    expect(countVisible(darkFloor)).toBeLessThan(countVisible(normalFloor));
  });
});

describe("Gameとギミックの連携", () => {
  it("ほうふくの階では満腹度の減りが半分になる", () => {
    const game = new Game({ seed: 1 });
    game.floor.gimmick = "feast";
    const before = game.player.satiety;
    game.command({ type: "wait" });
    expect(before - game.player.satiety).toBeCloseTo(0.1, 5);
  });

  it("通常の階では満腹度が通常どおり減る", () => {
    const game = new Game({ seed: 1 });
    const before = game.player.satiety;
    game.command({ type: "wait" });
    expect(before - game.player.satiety).toBeCloseTo(0.2, 5);
  });

  it("ギミックが乗った階に降りると専用メッセージが流れる", () => {
    let found = false;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const game = new Game({ seed, maxDepth: 10 });
      game.player.pos = { ...game.floor.stairs };
      const events = game.command({ type: "descend" });
      if (!game.floor.gimmick) continue;
      found = true;
      const text = GIMMICK_MESSAGES[game.floor.gimmick];
      expect(events.some((e) => e.type === "message" && e.text === text)).toBe(true);
    }
    expect(found).toBe(true);
  });
});
