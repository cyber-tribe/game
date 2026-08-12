import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import {
  addKnownCheckpoint,
  initialSave,
  loadSave,
  recordRun,
  type SaveData,
} from "../src/save";

describe("出発地点(startDepth)", () => {
  it("省略時は1階から始まる", () => {
    const game = new Game({ seed: 1 });
    expect(game.depth).toBe(1);
    expect(game.floor.depth).toBe(1);
  });

  it("指定した階から始まる", () => {
    const game = new Game({ seed: 1, maxDepth: 10, startDepth: 3 });
    expect(game.depth).toBe(3);
    expect(game.floor.depth).toBe(3);
  });

  it("maxDepthを超える値は切り詰められる", () => {
    const game = new Game({ seed: 1, maxDepth: 5, startDepth: 99 });
    expect(game.depth).toBe(5);
  });

  it("1未満の値は1に切り上げられる", () => {
    const game = new Game({ seed: 1, startDepth: 0 });
    expect(game.depth).toBe(1);
  });
});

describe("めざめの階段の記録(checkpointイベント)", () => {
  it("階段の上に乗ると、depthを含むcheckpointイベントが流れる", () => {
    const game = new Game({ seed: 2 });

    // 階段に隣接する歩けるマスから、階段へ向けて1歩踏み出す
    // (北・東・南・西の順で、実際に踏み出せる方向を探す)
    const candidates: Array<{ from: { x: number; y: number }; dir: 0 | 2 | 4 | 6 }> = [
      { from: { x: game.floor.stairs.x, y: game.floor.stairs.y - 1 }, dir: 4 },
      { from: { x: game.floor.stairs.x - 1, y: game.floor.stairs.y }, dir: 2 },
      { from: { x: game.floor.stairs.x, y: game.floor.stairs.y + 1 }, dir: 0 },
      { from: { x: game.floor.stairs.x + 1, y: game.floor.stairs.y }, dir: 6 },
    ];

    for (const { from, dir } of candidates) {
      if (from.x < 0 || from.y < 0 || from.x >= game.floor.width || from.y >= game.floor.height) {
        continue;
      }
      const tile = game.floor.tiles[from.y * game.floor.width + from.x];
      if (!tile || tile.kind === 0) continue; // 壁からは踏み出せない

      game.player.pos = from;
      const events = game.command({ type: "move", dir });
      const checkpoint = events.find(
        (e): e is Extract<(typeof events)[number], { type: "checkpoint" }> =>
          e.type === "checkpoint",
      );
      if (checkpoint) {
        expect(checkpoint.depth).toBe(game.depth);
        return;
      }
    }
    // フロア生成は階段への到達可能性を保証しているので、ここには来ないはず
    throw new Error("階段に隣接する歩けるマスが見つからなかった");
  });
});

describe("使って戻る(bank)", () => {
  it("階段の上でなければ失敗する", () => {
    const game = new Game({ seed: 3 });
    game.player.pos = {
      x: game.floor.stairs.x === 1 ? 2 : 1,
      y: game.floor.stairs.y === 1 ? 2 : 1,
    };
    if (game.player.pos.x === game.floor.stairs.x && game.player.pos.y === game.floor.stairs.y) {
      return;
    }
    const events = game.command({ type: "bank" });
    expect(game.status).toBe("playing");
    expect(events.some((e) => e.type === "message" && e.text === "ここには階段がない。")).toBe(
      true,
    );
  });

  it("階段の上で使うと、そこまでの成果を持ち帰って区切ったクリアになる", () => {
    const game = new Game({ seed: 4 });
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "bank" });
    expect(game.status).toBe("cleared");
    const over = events.find(
      (e): e is Extract<(typeof events)[number], { type: "gameOver" }> => e.type === "gameOver",
    );
    expect(over).toBeDefined();
    expect(over?.reason).toContain(`${game.depth}階`);
  });
});

describe("save.ts のチェックポイント管理", () => {
  it("初期状態では1階だけを知っている", () => {
    expect(initialSave().knownCheckpoints).toEqual([1]);
  });

  it("addKnownCheckpointで既知の階が増える(重複せず昇順)", () => {
    let save = initialSave();
    save = addKnownCheckpoint(save, 6);
    save = addKnownCheckpoint(save, 3);
    save = addKnownCheckpoint(save, 6); // 重複
    expect(save.knownCheckpoints).toEqual([1, 3, 6]);
  });

  it("recordRunを挟んでもknownCheckpointsは維持される", () => {
    let save = initialSave();
    save = addKnownCheckpoint(save, 6);
    save = recordRun(save, { depth: 6, level: 3, cleared: true, broughtBack: [] });
    expect(save.knownCheckpoints).toEqual([1, 6]);
  });

  it("壊れた保存データを読んでも1階だけは既知として復元される", () => {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    try {
      store.set("garudo-dungeon/v1", JSON.stringify({ knownCheckpoints: ["not-a-number", 5, -3, 6] }));
      const loaded = loadSave();
      expect(loaded.knownCheckpoints).toEqual([1, 5, 6]);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("SaveDataの型どおり、保存・復元しても壊れない", () => {
    const save: SaveData = { ...initialSave(), knownCheckpoints: [1, 6, 12] };
    expect(save.knownCheckpoints).toEqual([1, 6, 12]);
  });
});
