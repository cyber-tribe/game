import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Game } from "../src/game";
import { generateFloor } from "../src/domain/dungeon/generate";
import { type IdSource, populateFloor } from "../src/domain/dungeon/populate";
import { pickFloorGimmick } from "../src/domain/dungeon/gimmicks";
import {
  GIMMICK_CHANCE_MULTIPLIER,
  GOLD_REWARD_MULTIPLIER,
  MONSTER_ATK_MULTIPLIER,
  MONSTER_HOUSE_CHANCE_MULTIPLIER,
  SATIETY_RATE_MULTIPLIER,
} from "../src/entities/difficulty";
import { initialSave, loadSave, recordRun, setDifficulty, type SaveData } from "../src/save";
import { withMockedLocalStorage } from "./helpers/localStorage";

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

describe("entities/difficulty.ts", () => {
  it("ふつうはすべての倍率が1", () => {
    expect(SATIETY_RATE_MULTIPLIER.normal).toBe(1);
    expect(MONSTER_ATK_MULTIPLIER.normal).toBe(1);
    expect(MONSTER_HOUSE_CHANCE_MULTIPLIER.normal).toBe(1);
    expect(GIMMICK_CHANCE_MULTIPLIER.normal).toBe(1);
    expect(GOLD_REWARD_MULTIPLIER.normal).toBe(1);
  });

  it("やさしいは負担側の倍率が1未満、きびしいは1より大きい", () => {
    expect(SATIETY_RATE_MULTIPLIER.easy).toBeLessThan(1);
    expect(SATIETY_RATE_MULTIPLIER.hard).toBeGreaterThan(1);
    expect(MONSTER_HOUSE_CHANCE_MULTIPLIER.easy).toBeLessThan(1);
    expect(MONSTER_HOUSE_CHANCE_MULTIPLIER.hard).toBeGreaterThan(1);
    expect(GIMMICK_CHANCE_MULTIPLIER.easy).toBeLessThan(1);
    expect(GIMMICK_CHANCE_MULTIPLIER.hard).toBeGreaterThan(1);
  });

  it("やさしいの報酬はふつうと同じに保つ(減らさない)", () => {
    expect(GOLD_REWARD_MULTIPLIER.easy).toBe(1);
    expect(MONSTER_ATK_MULTIPLIER.easy).toBe(1);
  });

  it("きびしいは所持金の見返りが増える", () => {
    expect(GOLD_REWARD_MULTIPLIER.hard).toBeGreaterThan(1);
  });
});

describe("save.ts: 難易度モード", () => {
  it("setDifficultyは変更が無ければ同じ参照を返す", () => {
    withMockedLocalStorage(() => {
      const save = initialSave();
      expect(save.difficulty).toBe("normal");
      expect(setDifficulty(save, "normal")).toBe(save);
      const next = setDifficulty(save, "hard");
      expect(next.difficulty).toBe("hard");
    });
  });

  it("壊れたセーブデータの難易度は未知の値なら「ふつう」に戻す", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({ difficulty: "こわれた難易度" }));
      const loaded = loadSave();
      expect(loaded.difficulty).toBe("normal");
    });
  });

  it("「きびしい」で踏破すると専用の実績が付く", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = setDifficulty(initialSave(), "hard");
      save = recordRun(save, { depth: 10, level: 5, cleared: true, broughtBack: [] });
      expect(save.achievements["hardModeClear"]).toBeDefined();
    });
  });

  it("「ふつう」で踏破しても「きびしい」専用の実績は付かない", () => {
    withMockedLocalStorage(() => {
      let save = recordRun(initialSave(), { depth: 10, level: 5, cleared: true, broughtBack: [] });
      expect(save.achievements["hardModeClear"]).toBeUndefined();
    });
  });

  it("「きびしい」でも全滅すれば専用の実績は付かない", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = setDifficulty(initialSave(), "hard");
      save = recordRun(save, { depth: 3, level: 2, cleared: false, broughtBack: [] });
      expect(save.achievements["hardModeClear"]).toBeUndefined();
    });
  });
});

describe("game.ts: 満腹度の減り", () => {
  it("きびしいはふつうより満腹度の減りが早い", () => {
    const normal = new Game({ seed: 1, difficulty: "normal" });
    const hard = new Game({ seed: 1, difficulty: "hard" });
    for (let i = 0; i < 20; i++) {
      normal.command({ type: "wait" });
      hard.command({ type: "wait" });
    }
    expect(hard.player.satiety).toBeLessThan(normal.player.satiety);
  });

  it("やさしいはふつうより満腹度の減りがゆるやか", () => {
    const normal = new Game({ seed: 1, difficulty: "normal" });
    const easy = new Game({ seed: 1, difficulty: "easy" });
    for (let i = 0; i < 20; i++) {
      normal.command({ type: "wait" });
      easy.command({ type: "wait" });
    }
    expect(easy.player.satiety).toBeGreaterThan(normal.player.satiety);
  });
});

describe("dungeon/populate.ts: 難易度による調整", () => {
  it("きびしいはモンスターの攻撃力が上がる(同シードで比較)", () => {
    const floorNormal = generateFloor(new Rng(1), { depth: 5 });
    populateFloor(new Rng(1), floorNormal, makeIds(), floorNormal.stairs, {
      shopWary: false,
      shiningChanceMultiplier: 1,
      monsterAtkMultiplier: 1,
    });
    const floorHard = generateFloor(new Rng(1), { depth: 5 });
    populateFloor(new Rng(1), floorHard, makeIds(), floorHard.stairs, {
      shopWary: false,
      shiningChanceMultiplier: 1,
      monsterAtkMultiplier: MONSTER_ATK_MULTIPLIER.hard,
    });
    // 端数処理の影響を避けるため、フロア全体のモンスターの合計攻撃力で比較する
    const normalTotalAtk = floorNormal.actors
      .filter((a) => a.kind === "monster")
      .reduce((sum, a) => sum + a.atk, 0);
    const hardTotalAtk = floorHard.actors
      .filter((a) => a.kind === "monster")
      .reduce((sum, a) => sum + a.atk, 0);
    expect(hardTotalAtk).toBeGreaterThan(normalTotalAtk);
  });

  it("きびしいは金貨の山の量が増える(同シードで比較)", () => {
    const floorNormal = generateFloor(new Rng(2), { depth: 5 });
    populateFloor(new Rng(2), floorNormal, makeIds(), floorNormal.stairs);
    const floorHard = generateFloor(new Rng(2), { depth: 5 });
    populateFloor(new Rng(2), floorHard, makeIds(), floorHard.stairs, {
      shopWary: false,
      shiningChanceMultiplier: 1,
      monsterAtkMultiplier: 1,
      goldRewardMultiplier: GOLD_REWARD_MULTIPLIER.hard,
    });
    const normalTotal = floorNormal.goldPiles.reduce((sum, g) => sum + g.amount, 0);
    const hardTotal = floorHard.goldPiles.reduce((sum, g) => sum + g.amount, 0);
    expect(hardTotal).toBeGreaterThan(normalTotal);
  });
});

describe("dungeon/generate.ts: モンスターハウス出現率の倍率", () => {
  it("倍率0なら、深い階でもモンスターハウスは絶対に生成されない", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20, monsterHouseChanceMultiplier: 0 });
      expect(floor.rooms.some((r) => r.kind === "monsterHouse")).toBe(false);
    }
  });
});

describe("dungeon/gimmicks.ts: 階ギミック出現率の倍率", () => {
  it("倍率0なら、ギミックは絶対に乗らない", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const gimmick = pickFloorGimmick(new Rng(seed), 10, undefined, 0);
      expect(gimmick).toBeUndefined();
    }
  });

  it("倍率を大きくすると出現しやすくなる", () => {
    let found = false;
    for (let seed = 1; seed <= 20; seed++) {
      const gimmick = pickFloorGimmick(new Rng(seed), 10, undefined, 10);
      if (gimmick !== undefined) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
