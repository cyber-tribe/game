import { describe, expect, it } from "vitest";
import type { AllyActor } from "../src/core/types";
import {
  VILLAGE_STAGE_REQUIREMENTS,
  canDevelopVillage,
  hutCapacity,
  nextVillageStageRequirement,
  villageStageRequirement,
} from "../src/entities/village";
import { developVillage, initialSave, recordRun } from "../src/save";

function ally(id: number): AllyActor {
  return {
    id,
    kind: "ally",
    name: "ぷるん",
    speciesId: "purun",
    model: "purun",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
  };
}

describe("entities/village.ts", () => {
  it("hutCapacityは段階ごとに広がる", () => {
    expect(hutCapacity(1)).toBe(8);
    expect(hutCapacity(2)).toBe(12);
    expect(hutCapacity(3)).toBe(20);
    expect(hutCapacity(4)).toBe(30);
  });

  it("nextVillageStageRequirementは最終段階でundefined", () => {
    expect(nextVillageStageRequirement(3)?.stage).toBe(4);
    expect(nextVillageStageRequirement(4)).toBeUndefined();
  });

  it("canDevelopVillageは最深到達記録・ゴールドの両方が条件を満たして初めてtrue", () => {
    const req = nextVillageStageRequirement(1)!;
    expect(canDevelopVillage(1, req.minDeepest - 1, req.cost)).toBe(false);
    expect(canDevelopVillage(1, req.minDeepest, req.cost - 1)).toBe(false);
    expect(canDevelopVillage(1, req.minDeepest, req.cost)).toBe(true);
  });

  it("段階が上がるほど必要な最深到達記録・ゴールドも増える", () => {
    for (let i = 1; i < VILLAGE_STAGE_REQUIREMENTS.length; i++) {
      expect(VILLAGE_STAGE_REQUIREMENTS[i]!.minDeepest).toBeGreaterThan(
        VILLAGE_STAGE_REQUIREMENTS[i - 1]!.minDeepest,
      );
      expect(VILLAGE_STAGE_REQUIREMENTS[i]!.cost).toBeGreaterThan(VILLAGE_STAGE_REQUIREMENTS[i - 1]!.cost);
    }
  });

  it("段階2〜4のminDeepestは地方境界(12/24/48)に沿っている(plan/village-stage-rebalance.md)", () => {
    expect(villageStageRequirement(2)?.minDeepest).toBe(12);
    expect(villageStageRequirement(3)?.minDeepest).toBe(24);
    expect(villageStageRequirement(4)?.minDeepest).toBe(48);
  });
});

describe("save.ts: developVillage", () => {
  it("条件を満たしていれば段階が進み、ゴールドが引かれる", () => {
    const req = nextVillageStageRequirement(1)!;
    let save = initialSave();
    save = { ...save, deepest: req.minDeepest, gold: req.cost + 100 };
    save = developVillage(save);
    expect(save.villageStage).toBe(2);
    expect(save.gold).toBe(100);
  });

  it("条件を満たしていなければ何も変わらない(同じ参照を返す)", () => {
    const save = initialSave();
    expect(developVillage(save)).toBe(save);
  });

  it("最終段階からはさらに発展できない", () => {
    let save = initialSave();
    save = { ...save, villageStage: 4, deepest: 999, gold: 999999 };
    expect(developVillage(save)).toBe(save);
  });
});

describe("save.ts: recordRunとねむり小屋の収容数上限", () => {
  it("段階1(上限8)を超える分は連れ帰れない", () => {
    let save = initialSave();
    expect(save.villageStage).toBe(1);
    const allies = Array.from({ length: 10 }, (_, i) => ally(i + 1));
    save = recordRun(save, {
      depth: 3,
      level: 2,
      cleared: true,
      broughtBack: [],
      broughtBackAllies: allies,
    });
    expect(save.hut).toHaveLength(8);
  });

  it("既に小屋にいる分も含めて上限を数える", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: Array.from({ length: 6 }, (_, i) => ({
        uid: i + 1,
        speciesId: "purun",
        level: 1,
        exp: 0,
        skills: [],
        bondSuccessCount: 0,
        recentFusionMaterials: [],
        dreamArts: [],
      })),
      nextHutUid: 7,
    };
    save = recordRun(save, {
      depth: 3,
      level: 2,
      cleared: true,
      broughtBack: [],
      broughtBackAllies: [ally(100), ally(101), ally(102)],
    });
    // 空き2枠ぶんだけ増える(6+2=8が上限)
    expect(save.hut).toHaveLength(8);
  });

  it("段階が上がれば上限も広がる", () => {
    let save = initialSave();
    save = { ...save, villageStage: 3 };
    const allies = Array.from({ length: 25 }, (_, i) => ally(i + 1));
    save = recordRun(save, {
      depth: 3,
      level: 2,
      cleared: true,
      broughtBack: [],
      broughtBackAllies: allies,
    });
    expect(save.hut).toHaveLength(20);
  });
});
