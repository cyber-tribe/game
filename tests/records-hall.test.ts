import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { initialSave, loadSave, recordRun } from "../src/save";

describe("save.ts: 記録の間(records)", () => {
  it("初期状態は0", () => {
    const save = initialSave();
    expect(save.records).toEqual({ totalDefeats: 0, totalCaptures: 0 });
  });

  it("recordRunを重ねるたびに、倒した・捕まえた数が積み上がる", () => {
    let save = initialSave();
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      defeats: 3,
      captures: 1,
    });
    expect(save.records).toEqual({ totalDefeats: 3, totalCaptures: 1 });

    save = recordRun(save, {
      depth: 2,
      level: 1,
      cleared: false,
      broughtBack: [],
      defeats: 2,
      captures: 0,
    });
    // 全滅した回でも、倒した・捕まえた数は失われずに積み上がる
    expect(save.records).toEqual({ totalDefeats: 5, totalCaptures: 1 });
  });

  it("defeats/capturesを省略しても0として扱う(既存の呼び出し元との互換)", () => {
    let save = initialSave();
    save = recordRun(save, { depth: 1, level: 1, cleared: true, broughtBack: [] });
    expect(save.records).toEqual({ totalDefeats: 0, totalCaptures: 0 });
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

describe("save.ts: 壊れたセーブデータのrecords", () => {
  it("recordsが無い・壊れていても0で初期化される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1", JSON.stringify({ records: { totalDefeats: "abc" } }));
      const loaded = loadSave();
      expect(loaded.records).toEqual({ totalDefeats: 0, totalCaptures: 0 });
    });
  });

  it("recordsフィールド自体が無くても初期化される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1", JSON.stringify({}));
      const loaded = loadSave();
      expect(loaded.records).toEqual({ totalDefeats: 0, totalCaptures: 0 });
    });
  });
});

describe("game.ts: dieイベントのkind", () => {
  it("モンスターを倒すと、die イベントに kind: \"monster\" が乗る", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed });
      const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive);
      if (!monster) continue;
      monster.hp = 1;
      monster.def = 0;
      // 攻撃経路(位置取り・命中判定)に依存させず、privateなdamageActorを直接使う
      const damageActor = (
        game as unknown as {
          damageActor: (target: unknown, damage: number, critical: boolean, events: unknown[]) => void;
        }
      ).damageActor.bind(game);
      const events: { type: string; kind?: string }[] = [];
      damageActor(monster, 999, false, events);
      const die = events.find((e) => e.type === "die");
      expect(die).toBeDefined();
      expect(die!.kind).toBe("monster");
      return;
    }
    throw new Error("モンスターが見つかるseedがなかった");
  });
});
