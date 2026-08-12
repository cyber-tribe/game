import { describe, expect, it } from "vitest";
import {
  MAIN_CAVE_MAX_DEPTH,
  NIGHTLY_DREAM_ID,
  NIGHTLY_DREAM_LAP_MULTIPLIER,
  NIGHTLY_DREAM_OVERFLOW_LAP,
  nightlyDreamStatMultiplier,
} from "../src/entities/dungeons";
import { speciesById } from "../src/entities/species";
import { Game } from "../src/game";

describe("entities/dungeons.ts: 夜ごとの夢のモンスター強化カーブ(plan/nightly-dream-scaling.md)", () => {
  it("48階以下は倍率1(頭打ちにならない範囲)", () => {
    expect(nightlyDreamStatMultiplier(1)).toBe(1);
    expect(nightlyDreamStatMultiplier(MAIN_CAVE_MAX_DEPTH)).toBe(1);
  });

  it("49〜60階(1周目)はまだ倍率1", () => {
    expect(nightlyDreamStatMultiplier(MAIN_CAVE_MAX_DEPTH + 1)).toBe(1);
    expect(nightlyDreamStatMultiplier(MAIN_CAVE_MAX_DEPTH + NIGHTLY_DREAM_OVERFLOW_LAP)).toBe(1);
  });

  it("1周(12階)超えるごとに+15%ずつ増える", () => {
    const oneLap = MAIN_CAVE_MAX_DEPTH + NIGHTLY_DREAM_OVERFLOW_LAP + 1;
    expect(nightlyDreamStatMultiplier(oneLap)).toBeCloseTo(1 + NIGHTLY_DREAM_LAP_MULTIPLIER, 5);
    const twoLaps = MAIN_CAVE_MAX_DEPTH + NIGHTLY_DREAM_OVERFLOW_LAP * 2 + 1;
    expect(nightlyDreamStatMultiplier(twoLaps)).toBeCloseTo(1 + NIGHTLY_DREAM_LAP_MULTIPLIER * 2, 5);
  });

  it("上限を設けない(深く潜るほど際限なく増え続ける)", () => {
    const veryDeep = MAIN_CAVE_MAX_DEPTH + NIGHTLY_DREAM_OVERFLOW_LAP * 100 + 1;
    expect(nightlyDreamStatMultiplier(veryDeep)).toBeCloseTo(1 + NIGHTLY_DREAM_LAP_MULTIPLIER * 100, 5);
  });
});

describe("game.ts: 夜ごとの夢で48階を超えると、湧くモンスターのステータスが強化される", () => {
  it("1周超えた深さでは、種族基準よりmaxHp/atk/defが強くなる", () => {
    const depth = MAIN_CAVE_MAX_DEPTH + NIGHTLY_DREAM_OVERFLOW_LAP + 1; // 倍率1.15
    const game = new Game({ seed: 3, dungeonId: NIGHTLY_DREAM_ID, startDepth: depth });
    // 近道屋の行商人(kind: "monster"のNPC)はspeciesIdを持たないので除く
    const monsters = game.floor.actors.filter((a) => a.kind === "monster" && a.speciesId);
    expect(monsters.length).toBeGreaterThan(0);
    for (const monster of monsters) {
      const species = speciesById(monster.speciesId!);
      const expected = nightlyDreamStatMultiplier(depth);
      expect(monster.maxHp).toBe(Math.round(species.maxHp * expected));
      expect(monster.hp).toBe(monster.maxHp);
      expect(monster.def).toBe(Math.round(species.def * expected));
      // expには掛けない
      expect(monster.exp).toBe(species.exp);
    }
  });

  it("48階以下(頭打ちにならない範囲)では、種族基準どおりのステータスのまま", () => {
    const game = new Game({ seed: 5, dungeonId: NIGHTLY_DREAM_ID, startDepth: MAIN_CAVE_MAX_DEPTH });
    // 近道屋の行商人(kind: "monster"のNPC)はspeciesIdを持たないので除く
    const monsters = game.floor.actors.filter((a) => a.kind === "monster" && a.speciesId);
    expect(monsters.length).toBeGreaterThan(0);
    for (const monster of monsters) {
      const species = speciesById(monster.speciesId!);
      expect(monster.maxHp).toBe(species.maxHp);
      expect(monster.def).toBe(species.def);
    }
  });
});
