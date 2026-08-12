import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import { bondBonus, bondStage, bondStageLabel } from "../src/entities/companionBond";
import { createAllyFromStored } from "../src/dungeon/populate";
import { actorToStoredMonster, fuseMonsters, initialSave, loadSave, type StoredMonster } from "../src/save";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 1,
    kind: "ally",
    name: "ぷるん",
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
    ...overrides,
  };
}

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    ...overrides,
  };
}

describe("entities/companionBond.ts: bondBonus/bondStage", () => {
  it("5回未満はボーナス無し", () => {
    expect(bondBonus(0)).toBe(0);
    expect(bondBonus(4)).toBe(0);
    expect(bondStage(4)).toBe("none");
    expect(bondStageLabel("none")).toBe("");
  });

  it("5回でなじんできた(+3%)", () => {
    expect(bondBonus(5)).toBe(0.03);
    expect(bondBonus(14)).toBe(0.03);
    expect(bondStage(5)).toBe("familiar");
    expect(bondStageLabel(bondStage(5))).toBe("なじんできた");
  });

  it("15回ですっかりなじんだ(+7%)", () => {
    expect(bondBonus(15)).toBe(0.07);
    expect(bondBonus(29)).toBe(0.07);
    expect(bondStage(15)).toBe("close");
  });

  it("30回でかけがえのない仲間(+12%、上限)", () => {
    expect(bondBonus(30)).toBe(0.12);
    expect(bondBonus(1000)).toBe(0.12);
    expect(bondStage(30)).toBe("irreplaceable");
  });
});

describe("save.ts: actorToStoredMonsterはbondSuccessCountを+1する", () => {
  it("新規捕獲(actor.bondSuccessCountが未設定)は1になる", () => {
    const s = actorToStoredMonster(1, actor());
    expect(s.bondSuccessCount).toBe(1);
  });

  it("既に持っていた回数から+1される", () => {
    const s = actorToStoredMonster(1, actor({ bondSuccessCount: 5 }));
    expect(s.bondSuccessCount).toBe(6);
  });
});

describe("dungeon/populate.ts: createAllyFromStoredはなじみボーナスを最後の一段として掛ける", () => {
  it("bondSuccessCountが0ならボーナス無し", () => {
    const a = createAllyFromStored(1, stored({ bondSuccessCount: 0 }), { x: 0, y: 0 });
    const base = createAllyFromStored(2, stored({ bondSuccessCount: 4 }), { x: 0, y: 0 });
    expect(a.maxHp).toBe(base.maxHp);
    expect(a.atk).toBe(base.atk);
    expect(a.def).toBe(base.def);
  });

  it("5回以上でmaxHp/atk/defが底上げされる", () => {
    // 基礎値が小さい種族だと丸めで差が消えることがあるため、基礎値の大きい種族で確認する
    const unbonded = createAllyFromStored(
      1,
      stored({ speciesId: "kazaridaruma", bondSuccessCount: 0 }),
      { x: 0, y: 0 },
    );
    const bonded = createAllyFromStored(
      2,
      stored({ speciesId: "kazaridaruma", bondSuccessCount: 5 }),
      { x: 0, y: 0 },
    );
    expect(bonded.maxHp).toBeGreaterThan(unbonded.maxHp);
    expect(bonded.atk).toBeGreaterThan(unbonded.atk);
    expect(bonded.def).toBeGreaterThan(unbonded.def);
  });

  it("Actor.bondSuccessCountにそのまま引き継がれる(次のactorToStoredMonsterで+1される元になる)", () => {
    const a = createAllyFromStored(1, stored({ bondSuccessCount: 7 }), { x: 0, y: 0 });
    expect(a.bondSuccessCount).toBe(7);
  });
});

describe("save.ts: 夢あわせ(fuseMonsters)とbondSuccessCount", () => {
  it("軸のbondSuccessCountは引き継がれる", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", level: 3, bondSuccessCount: 10 }),
        stored({ uid: 2, speciesId: "purun", level: 3, bondSuccessCount: 0 }),
      ],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused).not.toBeNull();
    expect(fused!.result.bondSuccessCount).toBe(10);
    expect(fused!.save.hut.find((m) => m.uid === 1)?.bondSuccessCount).toBe(10);
  });

  it("糧にした個体のbondSuccessCountは消える(hutから消えるため)", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", level: 3, bondSuccessCount: 0 }),
        stored({ uid: 2, speciesId: "purun", level: 3, bondSuccessCount: 20 }),
      ],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused!.save.hut).toHaveLength(1);
    expect(fused!.save.hut.find((m) => m.uid === 2)).toBeUndefined();
  });
});

function withMockedLocalStorage(run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

describe("save.ts: 壊れたセーブデータのbondSuccessCount", () => {
  it("欠けていても0で初期化される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({ hut: [{ uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [] }] }),
      );
      const loaded = loadSave();
      expect(loaded.hut[0]?.bondSuccessCount).toBe(0);
    });
  });

  it("負値・不正値は0に丸められる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({
          hut: [{ uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [], bondSuccessCount: -5 }],
        }),
      );
      expect(loadSave().hut[0]?.bondSuccessCount).toBe(0);
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({
          hut: [{ uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [], bondSuccessCount: "abc" }],
        }),
      );
      expect(loadSave().hut[0]?.bondSuccessCount).toBe(0);
    });
  });
});
