import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import type { GameEvent } from "../src/core/events";
import { TUTORIAL_TIPS, TUTORIAL_TIP_IDS, type TutorialTipId } from "../src/core/tutorial";
import { type Actor, isFree } from "../src/core/types";
import { type Dir, dirDelta } from "../src/core/grid";
import {
  initialSave,
  loadSave,
  markTutorialTipSeen,
  recordRun,
} from "../src/save";
import { ITEMS } from "../src/items/catalog";

function newGame(seed = 1) {
  return new Game({ seed });
}

function tipIds(events: GameEvent[]): TutorialTipId[] {
  return events
    .filter((e): e is Extract<GameEvent, { type: "tutorialTip" }> => e.type === "tutorialTip")
    .map((e) => e.id);
}

/** プレイヤーの正面が空くように向きを選び、そちらを向かせる。無理なら null */
function faceOpenDirection(game: Game): Dir | null {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as Dir[]) {
    const d = dirDelta(dir);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return dir;
    }
  }
  return null;
}

describe("チュートリアルヒント一覧", () => {
  it("全IDに空でないメッセージが定義されている", () => {
    for (const id of TUTORIAL_TIP_IDS) {
      expect(TUTORIAL_TIPS[id]).toBeTruthy();
    }
  });
});

describe("チュートリアルヒントのGameEvent", () => {
  it("アイテムを拾うと pickup ヒントが流れる", () => {
    const game = newGame(3);
    const defId = ITEMS[0]!.id;
    game.floor.items.push({ item: { uid: 999_001, defId }, pos: { ...game.player.pos } });
    const events = game.command({ type: "pickup" });
    expect(tipIds(events)).toContain("pickup");
  });

  it("タルを持ち上げると barrel ヒントが流れる", () => {
    const game = newGame(4);
    const barrel = game.floor.barrels.find((b) => b.kind === "empty") ?? game.floor.barrels[0];
    expect(barrel).toBeDefined();
    game.player.pos = { ...barrel!.pos };
    const events = game.command({ type: "liftBarrel" });
    expect(tipIds(events)).toContain("barrel");
  });

  it("モンスターを攻撃すると weakenThenThrow ヒントが流れる", () => {
    const game = newGame(5);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive) as Actor;
    expect(monster).toBeDefined();
    monster.pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    const events = game.command({ type: "move", dir: dir! });
    expect(tipIds(events)).toContain("weakenThenThrow");
  });

  it("モンスターを捕獲すると capture ヒントが、2体目で allyOrders ヒントも流れる", () => {
    const game = newGame(6);

    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    game.giveBarrel("caught", "purun");
    const firstEvents = game.command({ type: "throwBarrel" });
    expect(tipIds(firstEvents)).toContain("capture");
    expect(tipIds(firstEvents)).not.toContain("allyOrders");
    expect(game.allyList.length).toBe(1);

    faceOpenDirection(game);
    game.giveBarrel("caught", "gajiri");
    const secondEvents = game.command({ type: "throwBarrel" });
    expect(tipIds(secondEvents)).toContain("capture");
    expect(tipIds(secondEvents)).toContain("allyOrders");
    expect(game.allyList.length).toBe(2);
  });

  it("満腹度が50%を切ると hunger ヒントが流れる(実装は20%しきい値のhungerWarningに乗せている)", () => {
    const game = newGame(7);
    game.player.satiety = 20.1;
    const events = game.command({ type: "wait" });
    expect(tipIds(events)).toContain("hunger");
  });

  it("状態異常にかかると status ヒントが流れる", () => {
    const game = newGame(8);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    game.floor.traps = [{ pos: front, kind: "sleep", revealed: false }];
    const events = game.command({ type: "move", dir: dir! });
    expect(tipIds(events)).toContain("status");
  });

  it("レベルが上がると levelUp ヒントが流れる", () => {
    const game = newGame(9);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive) as Actor;
    expect(monster).toBeDefined();
    monster.pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    monster.hp = 1;
    monster.def = 0;
    monster.exp = 9999;
    const events = game.command({ type: "move", dir: dir! });
    expect(tipIds(events)).toContain("levelUp");
  });

  it("めざめの階段に到達すると checkpoint ヒントが流れる", () => {
    const game = newGame(10);
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
      if (!tile || tile.kind === 0) continue;
      game.player.pos = from;
      const events = game.command({ type: "move", dir });
      if (tipIds(events).includes("checkpoint")) return;
    }
    throw new Error("階段に隣接する歩けるマスが見つからなかった");
  });

  it("力尽きると death ヒントが流れる", () => {
    const game = newGame(11);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    game.player.hp = 1;
    game.floor.traps = [{ pos: front, kind: "damage", revealed: false }];
    const events = game.command({ type: "move", dir: dir! });
    expect(game.status).toBe("dead");
    expect(tipIds(events)).toContain("death");
  });
});

describe("save.ts のチュートリアル既読管理", () => {
  it("初期状態では何も既読でない", () => {
    expect(initialSave().seenTutorialTips).toEqual([]);
  });

  it("markTutorialTipSeenで既読が増える(重複しない)", () => {
    let save = initialSave();
    save = markTutorialTipSeen(save, "pickup");
    save = markTutorialTipSeen(save, "barrel");
    save = markTutorialTipSeen(save, "pickup");
    expect(save.seenTutorialTips.sort()).toEqual(["barrel", "pickup"]);
  });

  it("recordRunを挟んでもseenTutorialTipsは維持される", () => {
    let save = initialSave();
    save = markTutorialTipSeen(save, "checkpoint");
    save = recordRun(save, { depth: 3, level: 2, cleared: true, broughtBack: [] });
    expect(save.seenTutorialTips).toEqual(["checkpoint"]);
  });

  it("壊れた保存データを読んでも、未知のIDは捨てられる", () => {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    try {
      store.set(
        "garudo-dungeon/v1",
        JSON.stringify({ seenTutorialTips: ["pickup", "not-a-real-id", 42, "pickup"] }),
      );
      const loaded = loadSave();
      expect(loaded.seenTutorialTips).toEqual(["pickup"]);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});
