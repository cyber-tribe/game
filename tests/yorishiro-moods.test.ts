import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { DEFAULT_MOOD_ID, MOODS, moodDef, moodForDate } from "../src/entities/moods";
import { speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { makeEmptyFloor } from "./helpers/floor";

describe("entities/moods.ts", () => {
  it("同じ日付キーからは常に同じ気分が決まる", () => {
    expect(moodForDate("2026-08-12").id).toBe(moodForDate("2026-08-12").id);
  });

  it("すべての気分がMOODSに登録されている", () => {
    expect(MOODS.map((m) => m.id)).toContain(DEFAULT_MOOD_ID);
    expect(MOODS).toHaveLength(6);
  });

  it("moodDefは未知のidでエラーになる", () => {
    // @ts-expect-error 未知のidをわざと渡す
    expect(() => moodDef("unknownMood")).toThrow();
  });
});

describe("game.ts: Game.moodOverride(plan/yorishiro-moods.md)", () => {
  it("省略時は補正なしの既定の気分になる(現実の日付には依存しない)", () => {
    const game = new Game({ seed: 1 });
    expect(game.moodId).toBe(DEFAULT_MOOD_ID);
  });

  it("moodOverrideで特定の気分を固定できる", () => {
    const game = new Game({ seed: 1, moodOverride: "restless" });
    expect(game.moodId).toBe("restless");
  });
});

function emptyFloor(): FloorState {
  return makeEmptyFloor({
    depth: 1,
    width: 10,
    height: 10,
    rooms: [{ id: 0, x: 0, y: 0, w: 10, h: 10 }],
    tileKind: 1,
    roomId: 0,
  });
}

function monsterActor(pos: { x: number; y: number }): Actor {
  const species = speciesById("gajiri");
  return {
    id: 100,
    kind: "monster",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos,
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: species.ai,
    aware: false,
  };
}

function playerActor(pos: { x: number; y: number }): Actor {
  return {
    id: 2,
    kind: "player",
    name: "プレイヤー",
    model: "player",
    pos,
    facing: 0,
    hp: 25,
    maxHp: 25,
    atk: 5,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
  };
}

describe("entities/ai.ts: awareDistanceMul(plan/yorishiro-moods.md)", () => {
  it("隣接していない相手は、awareDistanceMul=0だと決して気づかない", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const monster = monsterActor({ x: 0, y: 0 });
    const target = playerActor({ x: 3, y: 0 });
    floor.actors = [monster, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    for (let i = 0; i < 20; i++) {
      decideMonsterAction(rng, floor, monster, target, field, 0);
    }
    expect(monster.aware).toBe(false);
  });

  it("awareDistanceMul=1(既定)なら、これまでどおり同室内の相手に必ず気づく", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const monster = monsterActor({ x: 0, y: 0 });
    const target = playerActor({ x: 3, y: 0 });
    floor.actors = [monster, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    decideMonsterAction(rng, floor, monster, target, field, 1);
    expect(monster.aware).toBe(true);
  });

  it("隣接していれば、awareDistanceMulの値によらず必ず気づく(奇襲を許さない)", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const monster = monsterActor({ x: 0, y: 0 });
    const target = playerActor({ x: 1, y: 0 });
    floor.actors = [monster, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    decideMonsterAction(rng, floor, monster, target, field, 0);
    expect(monster.aware).toBe(true);
  });
});
