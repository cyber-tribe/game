import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Game, type RunSnapshot } from "../src/game";
import {
  clearRunSnapshot,
  loadRunSnapshot,
  saveRunSnapshot,
} from "../src/save";

function withMockedLocalStorage(run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

/** localStorage を経由して往復させる。JSON化できないフィールドが混ざれば壊れて検知できる */
function roundTripThroughStorage(snapshot: RunSnapshot): RunSnapshot {
  let restored: RunSnapshot | null = null;
  withMockedLocalStorage(() => {
    saveRunSnapshot(snapshot);
    restored = loadRunSnapshot();
  });
  expect(restored).not.toBeNull();
  return restored!;
}

describe("Rng の状態復元", () => {
  it("getState/fromStateで、続きの乱数列を再現する", () => {
    const rng = new Rng(42);
    rng.next();
    rng.next();
    const state = rng.getState();
    const expectedNext = [rng.next(), rng.next(), rng.next()];

    const restored = Rng.fromState(state);
    const actualNext = [restored.next(), restored.next(), restored.next()];
    expect(actualNext).toEqual(expectedNext);
  });
});

describe("Game.toSnapshot / 復帰", () => {
  it("スナップショットから復元すると、depth・player・statusが引き継がれる", () => {
    const original = new Game({ seed: 7, maxDepth: 10 });
    original.command({ type: "wait" });
    original.command({ type: "wait" });
    original.player.hp = 17;

    const snapshot = roundTripThroughStorage(original.toSnapshot());
    const resumed = new Game({ seed: 0, resume: snapshot });

    expect(resumed.depth).toBe(original.depth);
    expect(resumed.turnCount).toBe(original.turnCount);
    expect(resumed.status).toBe(original.status);
    expect(resumed.player.hp).toBe(17);
    expect(resumed.player.pos).toEqual(original.player.pos);
    expect(resumed.floor.depth).toBe(original.floor.depth);
    expect(resumed.allyList.length).toBe(original.allyList.length);
  });

  it("復帰後も、続きの乱数列を使ってまったく同じ結果になる", () => {
    const seed = 99;
    const reference = new Game({ seed, maxDepth: 10 });
    reference.command({ type: "wait" });
    reference.command({ type: "wait" });
    reference.command({ type: "wait" });

    const snapshot = roundTripThroughStorage(reference.toSnapshot());
    const resumed = new Game({ seed: 0, resume: snapshot });

    // 分岐点から、両者にまったく同じコマンド列をさらに与える
    for (let i = 0; i < 5; i++) {
      reference.command({ type: "wait" });
      resumed.command({ type: "wait" });
    }

    expect(JSON.stringify(resumed.floor)).toBe(JSON.stringify(reference.floor));
    expect(JSON.stringify(resumed.player)).toBe(JSON.stringify(reference.player));
    expect(resumed.turnCount).toBe(reference.turnCount);
    expect(resumed.status).toBe(reference.status);
  });

  it("復帰後に新しく発行するidは、保存時点までのカウンタの続きになる(衝突しない)", () => {
    const original = new Game({ seed: 13, maxDepth: 10 });
    const snapshot = roundTripThroughStorage(original.toSnapshot());
    const resumed = new Game({ seed: 0, resume: snapshot });

    const existingItemUids = new Set(resumed.floor.items.map((gi) => gi.item.uid));
    const existingBarrelIds = new Set(resumed.floor.barrels.map((b) => b.id));

    const item = resumed.giveItem("healLeaf");
    expect(item).not.toBeNull();
    expect(existingItemUids.has(item!.uid)).toBe(false);

    const barrel = resumed.giveBarrel("empty");
    expect(existingBarrelIds.has(barrel.id)).toBe(false);
  });

  it("復帰後、プレイヤー本体とfloor.actors内のプレイヤーが同一オブジェクトのまま動き続ける", () => {
    const original = new Game({ seed: 21, maxDepth: 10 });
    original.command({ type: "wait" });
    const snapshot = roundTripThroughStorage(original.toSnapshot());
    const resumed = new Game({ seed: 0, resume: snapshot });

    resumed.command({ type: "wait" });
    resumed.command({ type: "wait" });

    const inFloor = resumed.floor.actors.find((a) => a.kind === "player");
    expect(inFloor).toBe(resumed.player);
  });
});

describe("save.ts のダイブ中オートセーブ管理", () => {
  it("保存→読み込みで同じ内容が戻る", () => {
    withMockedLocalStorage(() => {
      const game = new Game({ seed: 1 });
      const snapshot = game.toSnapshot();
      saveRunSnapshot(snapshot);
      const loaded = loadRunSnapshot();
      expect(loaded).toEqual(snapshot);
    });
  });

  it("何も保存していなければnullを返す", () => {
    withMockedLocalStorage(() => {
      expect(loadRunSnapshot()).toBeNull();
    });
  });

  it("壊れたデータが入っていてもnullを返す(例外を投げない)", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/run-snapshot", "{not valid json");
      expect(loadRunSnapshot()).toBeNull();
    });
  });

  it("形が合わないデータが入っていてもnullを返す", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/run-snapshot",
        JSON.stringify({ depth: 3 /* 他のフィールドが欠けている */ }),
      );
      expect(loadRunSnapshot()).toBeNull();
    });
  });

  it("clearRunSnapshotで消える", () => {
    withMockedLocalStorage(() => {
      const game = new Game({ seed: 2 });
      saveRunSnapshot(game.toSnapshot());
      clearRunSnapshot();
      expect(loadRunSnapshot()).toBeNull();
    });
  });
});
