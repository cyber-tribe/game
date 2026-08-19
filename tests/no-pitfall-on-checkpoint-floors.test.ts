import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/dungeon/generate";
import { pickFloorGimmick } from "../src/dungeon/gimmicks";
import { type IdSource, populateFloor } from "../src/dungeon/populate";
import { isCheckpointFloor } from "../src/entities/dungeons";

/**
 * めざめの階段の階では落とし穴を出さない
 * (plan/game/no-pitfall-on-checkpoint-floors.md)。罠の抽選と
 * 「おちあなの階」ギミックの割り当ての両方から除外する。
 */

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

describe("entities/dungeons.ts: isCheckpointFloor", () => {
  it("表の寝穴では6の倍数階だけが該当する", () => {
    expect(isCheckpointFloor("mainCave", 5)).toBe(false);
    expect(isCheckpointFloor("mainCave", 6)).toBe(true);
    expect(isCheckpointFloor("mainCave", 7)).toBe(false);
    expect(isCheckpointFloor("mainCave", 48)).toBe(true);
  });

  it("地方の概念を持たないダンジョンは全階が該当する", () => {
    expect(isCheckpointFloor("shortcutBackHole", 3)).toBe(true);
    expect(isCheckpointFloor("nightlyDream", 1)).toBe(true);
  });
});

describe("dungeon/populate.ts: チェックポイント階の落とし穴除外", () => {
  it("checkpointFloor=trueでは、多数のシードで落とし穴が1つも生成されない", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 6 });
      populateFloor(new Rng(seed), floor, makeIds(), floor.stairs, { checkpointFloor: true });
      expect(floor.traps.every((t) => t.kind !== "pitfall")).toBe(true);
    }
  });

  it("checkpointFloor=false(既定)では従来どおり落とし穴が出うる", () => {
    let sawPitfall = false;
    for (let seed = 1; seed <= 60 && !sawPitfall; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 6 });
      populateFloor(new Rng(seed), floor, makeIds(), floor.stairs, {});
      sawPitfall = floor.traps.some((t) => t.kind === "pitfall");
    }
    expect(sawPitfall).toBe(true);
  });
});

describe("dungeon/gimmicks.ts: チェックポイント階の「おちあなの階」除外", () => {
  it("checkpointFloor=trueでは、多数の抽選でpitfallギミックが選ばれない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = pickFloorGimmick(new Rng(seed), 6, undefined, 10, true, true);
      expect(g).not.toBe("pitfall");
    }
  });

  it("checkpointFloor=falseでは従来どおりpitfallが選ばれうる", () => {
    let saw = false;
    for (let seed = 1; seed <= 300 && !saw; seed++) {
      saw = pickFloorGimmick(new Rng(seed), 7, undefined, 10, true, false) === "pitfall";
    }
    expect(saw).toBe(true);
  });
});
