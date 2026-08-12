import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Game, type RunSnapshot } from "../src/game";
import {
  batchSaves,
  clearRunSnapshot,
  loadRunSnapshot,
  loadSave,
  saveData,
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
      localStorage.setItem("garudo-dungeon/v1/slot0/run-snapshot", "{not valid json");
      expect(loadRunSnapshot()).toBeNull();
    });
  });

  it("形が合わないデータが入っていてもnullを返す", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0/run-snapshot",
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

describe("タイル格子の畳み込み", () => {
  /** 深みタイル(7〜12階)と奔流タイル(25〜30階)も通るよう、複数の階で確かめる */
  function diveTo(depth: number): Game {
    const game = new Game({ seed: 777, maxDepth: 48, startingItems: [] });
    let guard = 0;
    while (game.depth < depth && guard++ < 200) {
      game.player.pos = { ...game.floor.stairs };
      game.command({ type: "descend" });
    }
    for (let i = 0; i < 12; i++) game.command({ type: "wait" });
    return game;
  }

  for (const depth of [1, 10, 28]) {
    it(`地下${depth}階のタイルが1マスも欠けずに往復する`, () => {
      const game = diveTo(depth);
      const before = game.toSnapshot();
      const after = roundTripThroughStorage(before);

      const a = before.floor.tiles;
      const b = after.floor.tiles;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i]!.kind, `tile[${i}].kind`).toBe(a[i]!.kind);
        // roomId は保存せず、部屋の矩形から引き直している
        expect(b[i]!.roomId, `tile[${i}].roomId`).toBe(a[i]!.roomId);
        expect(b[i]!.explored, `tile[${i}].explored`).toBe(a[i]!.explored);
        expect(b[i]!.quagmire ?? false, `tile[${i}].quagmire`).toBe(a[i]!.quagmire ?? false);
        expect(b[i]!.torrent, `tile[${i}].torrent`).toBe(a[i]!.torrent);
      }
    });
  }

  it("見えているマスも往復して変わらない", () => {
    const game = diveTo(10);
    const before = game.toSnapshot();
    const visibleBefore = before.floor.tiles.filter((t) => t.visible).length;
    expect(visibleBefore).toBeGreaterThan(0);

    const after = roundTripThroughStorage(before);
    expect(after.floor.tiles.filter((t) => t.visible).length).toBe(visibleBefore);

    const resumed = new Game({ seed: 0, resume: after });
    expect(resumed.floor.tiles.filter((t) => t.visible).length).toBe(visibleBefore);
  });

  it("書き出す量がタイルをそのまま並べた場合の3割未満に収まる", () => {
    // 毎ターン同期で localStorage に書くので、ここが膨らむと操作が引っかかる。
    // 畳む前は全体の94%がタイルで、1階でも97KBあった
    const game = diveTo(10);
    const snapshot = game.toSnapshot();
    const raw = JSON.stringify(snapshot).length;
    let written = 0;
    withMockedLocalStorage(() => {
      saveRunSnapshot(snapshot);
      written = (localStorage.getItem("garudo-dungeon/v1/slot0/run-snapshot") ?? "").length;
    });
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(raw * 0.3);
  });

  it("古い形式(タイルが配列のまま)のスナップショットは読み捨てる", () => {
    withMockedLocalStorage(() => {
      const game = new Game({ seed: 3 });
      // 畳む前の形をそのまま置く
      localStorage.setItem("garudo-dungeon/v1/slot0/run-snapshot", JSON.stringify(game.toSnapshot()));
      expect(loadRunSnapshot()).toBeNull();
    });
  });
});

describe("セーブのまとめ書き", () => {
  /** setItem が何回呼ばれたかを数える */
  function countingStorage(run: () => void): number {
    const original = globalThis.localStorage;
    let writes = 0;
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes++;
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
    return writes;
  }

  it("まとめている間は何度呼んでも書き込みは1回だけ", () => {
    const base = loadSave();
    const writes = countingStorage(() => {
      batchSaves(() => {
        saveData({ ...base, deepest: 1 });
        saveData({ ...base, deepest: 2 });
        saveData({ ...base, deepest: 3 });
      });
    });
    expect(writes).toBe(1);
  });

  it("まとめ終わったあとに書かれるのは最後の内容", () => {
    const base = loadSave();
    let stored = "";
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
      batchSaves(() => {
        saveData({ ...base, deepest: 1 });
        saveData({ ...base, deepest: 42 });
      });
      stored = store.get("garudo-dungeon/v1/slot0") ?? "";
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
    expect(JSON.parse(stored).deepest).toBe(42);
  });

  it("まとめていないときはこれまで通り毎回書く", () => {
    const base = loadSave();
    const writes = countingStorage(() => {
      saveData({ ...base, deepest: 1 });
      saveData({ ...base, deepest: 2 });
    });
    expect(writes).toBe(2);
  });

  it("途中で例外が出ても、それまでの変更は書き出される", () => {
    const base = loadSave();
    const writes = countingStorage(() => {
      expect(() =>
        batchSaves(() => {
          saveData({ ...base, deepest: 5 });
          throw new Error("途中で失敗");
        }),
      ).toThrow("途中で失敗");
    });
    expect(writes).toBe(1);
  });
});
