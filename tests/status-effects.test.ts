import { describe, expect, it } from "vitest";
import {
  STATUS_CONFUSE,
  STATUS_POISON,
  STATUS_SLEEP,
  hasStatus,
} from "../src/core/types";
import { addStatus, type EffectContext } from "../src/domain/item/effects";
import { Game } from "../src/application/dungeonRun/game";

function newGame(seed = 1) {
  return new Game({ seed });
}

describe("毒の状態異常", () => {
  it("行動そのものは妨げない(移動できる)", () => {
    const game = newGame(1);
    game.player.statuses.push({ kind: STATUS_POISON, turns: 5 });

    // 歩ける方向を探して動けることを確かめる
    let moved = false;
    for (const dir of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const before = { ...game.player.pos };
      const events = game.command({ type: "move", dir });
      if (events.some((e) => e.type === "move")) {
        expect(game.player.pos).not.toEqual(before);
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  it("ターン経過でじわじわHPが減る", () => {
    const game = newGame(2);
    game.player.statuses.push({ kind: STATUS_POISON, turns: 5 });
    const before = game.player.hp;
    game.command({ type: "wait" });
    expect(game.player.hp).toBeLessThan(before);
  });

  it("持続ターンを使い切ると解除され、メッセージが流れる", () => {
    const game = newGame(3);
    game.player.statuses.push({ kind: STATUS_POISON, turns: 1 });
    const events = game.command({ type: "wait" });
    expect(hasStatus(game.player, STATUS_POISON)).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === "毒が抜けた。")).toBe(true);
  });

  it("重ね掛けしても残りターン数は短くならない(長い方が残る)", () => {
    const game = newGame(4);
    const ctx: EffectContext = {
      rng: game.rng,
      floor: game.floor,
      player: game.player,
      events: [],
    };
    addStatus(ctx, game.player, STATUS_POISON, 10, "毒を受けた");
    addStatus(ctx, game.player, STATUS_POISON, 3, "毒を受けた");
    const existing = game.player.statuses.find((s) => s.kind === STATUS_POISON)!;
    expect(existing.turns).toBe(10);
  });

  it("毒で力尽きると通常どおりゲームオーバーになり、その後の満腹度処理で二重に処理されない", () => {
    const game = newGame(5);
    game.player.hp = 1;
    game.player.statuses.push({ kind: STATUS_POISON, turns: 5 });
    const events = game.command({ type: "wait" });
    expect(game.status).toBe("dead");
    const gameOvers = events.filter((e) => e.type === "gameOver");
    expect(gameOvers).toHaveLength(1);
  });
});

describe("毒罠", () => {
  it("踏むと毒を受ける", () => {
    const game = newGame(6);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.traps = [];

    // プレイヤーの隣に毒罠を置く
    let placed = false;
    for (const dir of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const deltas = [
        { x: 0, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
        { x: -1, y: 0 },
        { x: -1, y: -1 },
      ][dir]!;
      const pos = { x: game.player.pos.x + deltas.x, y: game.player.pos.y + deltas.y };
      if (!game.floor.tiles[pos.y * game.floor.width + pos.x]) continue;
      game.floor.traps.push({ pos, kind: "poison", revealed: false });
      const events = game.command({ type: "move", dir });
      if (events.some((e) => e.type === "trap")) {
        expect(hasStatus(game.player, STATUS_POISON)).toBe(true);
        placed = true;
        break;
      }
      game.floor.traps = [];
    }
    expect(placed).toBe(true);
  });
});

describe("治療アイテム", () => {
  it("めざめ草は眠り・混乱を治す", () => {
    const game = newGame(7);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 5 });
    game.player.statuses.push({ kind: STATUS_CONFUSE, turns: 5 });
    const item = game.giveItem("wakeGrass")!;
    const events = game.command({ type: "use", uid: item.uid });
    expect(hasStatus(game.player, STATUS_SLEEP)).toBe(false);
    expect(hasStatus(game.player, STATUS_CONFUSE)).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === "すっきりした!")).toBe(true);
  });

  it("眠っている間、めざめ草以外の道具は使えない", () => {
    const game = newGame(12);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 5 });
    const item = game.giveItem("healLeaf")!;
    const hpBefore = game.player.hp;
    game.player.hp = Math.max(1, game.player.hp - 5);
    const events = game.command({ type: "use", uid: item.uid });
    expect(events.some((e) => e.type === "message" && e.text === "ガルドは眠っている……")).toBe(
      true,
    );
    // 回復していない(HPが眠り前の値まで戻っていない)ことを確認
    expect(game.player.hp).toBeLessThan(hpBefore);
  });

  it("眠っている間、移動などその他の操作は引き続きブロックされる", () => {
    const game = newGame(13);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 5 });
    const posBefore = { ...game.player.pos };
    const events = game.command({ type: "move", dir: 0 });
    expect(events.some((e) => e.type === "message" && e.text === "ガルドは眠っている……")).toBe(
      true,
    );
    expect(game.player.pos).toEqual(posBefore);
  });

  it("毒消しの実は毒を治す", () => {
    const game = newGame(8);
    game.player.statuses.push({ kind: STATUS_POISON, turns: 5 });
    const item = game.giveItem("antidoteBerry")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(game.player, STATUS_POISON)).toBe(false);
  });

  it("毒消しの実は睡眠を治さない(役割を分ける)", () => {
    const game = newGame(9);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 5 });
    const item = game.giveItem("antidoteBerry")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(game.player, STATUS_SLEEP)).toBe(true);
  });

  it("かかっていない状態で使っても失敗せず、専用メッセージが流れる", () => {
    const game = newGame(10);
    const item = game.giveItem("antidoteBerry")!;
    const events = game.command({ type: "use", uid: item.uid });
    expect(events.some((e) => e.type === "message" && e.text === "しかし何ともなかった。")).toBe(
      true,
    );
  });

  it("封じは治療アイテムの対象外(草を使う手段そのものは残しておく設計)", () => {
    const game = newGame(11);
    game.player.statuses.push({ kind: "seal", turns: 5 });
    const item = game.giveItem("wakeGrass")!;
    game.command({ type: "use", uid: item.uid });
    expect(hasStatus(game.player, "seal")).toBe(true);
  });
});
