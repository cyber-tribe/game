import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import type { MonsterActor } from "../src/core/types";
import { createPlayer, expForLevel, gainExp } from "../src/entities/player";
import {
  initialSave,
  loadSave,
  recordRun,
  setTrainingFocus,
} from "../src/save";

describe("鍛え方によるレベルアップの成長配分", () => {
  it("攻めを鍛えると、atk+3・def+0で、maxHpは共通の+6が乗る", () => {
    const player = createPlayer(1);
    const before = { atk: player.atk, def: player.def, maxHp: player.maxHp };
    gainExp(player, expForLevel(2), "offense");
    expect(player.atk).toBe(before.atk + 3);
    expect(player.def).toBe(before.def);
    expect(player.maxHp).toBe(before.maxHp + 6);
  });

  it("守りを鍛えると、atk+0・def+2になる", () => {
    const player = createPlayer(1);
    const before = { atk: player.atk, def: player.def };
    gainExp(player, expForLevel(2), "defense");
    expect(player.atk).toBe(before.atk);
    expect(player.def).toBe(before.def + 2);
  });

  it("バランスよく鍛えると、atk+1・def+1になる", () => {
    const player = createPlayer(1);
    const before = { atk: player.atk, def: player.def };
    gainExp(player, expForLevel(2), "balance");
    expect(player.atk).toBe(before.atk + 1);
    expect(player.def).toBe(before.def + 1);
  });

  it("focusを省略すると、バランスよく扱われる", () => {
    const player = createPlayer(1);
    const before = { atk: player.atk, def: player.def };
    gainExp(player, expForLevel(2));
    expect(player.atk).toBe(before.atk + 1);
    expect(player.def).toBe(before.def + 1);
  });

  it("複数レベル上がっても、方針は毎回一貫して適用される", () => {
    const player = createPlayer(1);
    const before = { atk: player.atk, def: player.def };
    const levels = gainExp(player, expForLevel(5), "offense");
    expect(levels).toBe(4);
    expect(player.atk).toBe(before.atk + 3 * levels);
    expect(player.def).toBe(before.def);
  });
});

describe("Gameとトレーニングフォーカスの連携", () => {
  it("RunOptions.trainingFocusを指定すると、レベルアップ時にその配分が使われる", () => {
    const game = new Game({ seed: 3, maxDepth: 10, trainingFocus: "offense" });
    const monster = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.alive,
    );
    expect(monster).toBeDefined();

    const beforeAtk = game.player.atk;
    const beforeDef = game.player.def;

    // 瀕死・弱い相手を隣接させ、確実に倒して大きな経験値でレベルを上げる
    monster!.hp = 1;
    monster!.def = 0;
    monster!.exp = 9999;
    const dir = adjacentOpenDir(game);
    expect(dir).not.toBeNull();
    const delta = deltaFor(dir!);
    monster!.pos = { x: game.player.pos.x + delta.x, y: game.player.pos.y + delta.y };

    game.command({ type: "face", dir: dir! });
    game.command({ type: "attack" });

    expect(game.player.level).toBeGreaterThan(1);
    expect(game.player.atk).toBeGreaterThan(beforeAtk);
    expect(game.player.def).toBe(beforeDef);
  });

  it("ダイブ中オートセーブから復帰しても、鍛え方が引き継がれる", () => {
    const game = new Game({ seed: 11, maxDepth: 10, trainingFocus: "offense" });
    const snapshot = JSON.parse(JSON.stringify(game.toSnapshot()));
    const resumed = new Game({ seed: 0, resume: snapshot });

    const monster = resumed.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.alive,
    );
    expect(monster).toBeDefined();
    const beforeAtk = resumed.player.atk;
    const beforeDef = resumed.player.def;

    monster!.hp = 1;
    monster!.def = 0;
    monster!.exp = 9999;
    const dir = adjacentOpenDir(resumed);
    expect(dir).not.toBeNull();
    const delta = deltaFor(dir!);
    monster!.pos = { x: resumed.player.pos.x + delta.x, y: resumed.player.pos.y + delta.y };

    resumed.command({ type: "face", dir: dir! });
    resumed.command({ type: "attack" });

    expect(resumed.player.level).toBeGreaterThan(1);
    expect(resumed.player.atk).toBeGreaterThan(beforeAtk);
    expect(resumed.player.def).toBe(beforeDef);
  });

  it("trainingFocusを省略すると既定でbalanceになる", () => {
    const game = new Game({ seed: 5, maxDepth: 10 });
    const monster = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.alive,
    );
    expect(monster).toBeDefined();

    const beforeAtk = game.player.atk;
    const beforeDef = game.player.def;

    monster!.hp = 1;
    monster!.def = 0;
    monster!.exp = 9999;
    const dir = adjacentOpenDir(game);
    expect(dir).not.toBeNull();
    const delta = deltaFor(dir!);
    monster!.pos = { x: game.player.pos.x + delta.x, y: game.player.pos.y + delta.y };

    game.command({ type: "face", dir: dir! });
    game.command({ type: "attack" });

    expect(game.player.level).toBeGreaterThan(1);
    expect(game.player.atk).toBeGreaterThan(beforeAtk);
    expect(game.player.def).toBeGreaterThan(beforeDef);
  });
});

describe("save.ts の鍛え方の保存", () => {
  it("初期状態はbalance", () => {
    expect(initialSave().trainingFocus).toBe("balance");
  });

  it("setTrainingFocusで変更され、同じ値なら参照が変わらない", () => {
    const save = initialSave();
    const changed = setTrainingFocus(save, "offense");
    expect(changed.trainingFocus).toBe("offense");
    const unchanged = setTrainingFocus(changed, "offense");
    expect(unchanged).toBe(changed);
  });

  it("recordRunを挟んでも維持される", () => {
    let save = initialSave();
    save = setTrainingFocus(save, "defense");
    save = recordRun(save, { depth: 3, level: 2, cleared: true, broughtBack: [] });
    expect(save.trainingFocus).toBe("defense");
  });

  it("壊れた・不正な値が入っていてもbalanceに戻す", () => {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    try {
      store.set("garudo-dungeon/v1/slot0", JSON.stringify({ trainingFocus: "げきから" }));
      const loaded = loadSave();
      expect(loaded.trainingFocus).toBe("balance");
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});

/** プレイヤーの正面が空くように向きを選ぶ */
function adjacentOpenDir(game: Game): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null {
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7] as const;
  for (const dir of dirs) {
    const d = deltaFor(dir);
    const to = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (
      to.x > 0 &&
      to.y > 0 &&
      to.x < game.floor.width - 1 &&
      to.y < game.floor.height - 1 &&
      game.floor.tiles[to.y * game.floor.width + to.x]!.kind !== 0
    ) {
      return dir;
    }
  }
  return null;
}

function deltaFor(dir: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): { x: number; y: number } {
  return [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
  ][dir]!;
}
