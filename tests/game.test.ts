import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { Rng } from "../src/core/rng";
import { computeDamage } from "../src/domain/combat/damageCalculation";
import { MAX_LEVEL, createPlayer, expForLevel, gainExp, totalAttack } from "../src/entities/player";
import { addItem, createInventory, equip, weaponBonus } from "../src/domain/item/inventory";
import { createItem } from "../src/domain/dungeon/populate";
import { type Dir, dirDelta } from "../src/core/grid";
import { STATUS_SLEEP, hasStatus, walkableAt } from "../src/core/types";

function newGame(seed = 42) {
  return new Game({ seed });
}

/** プレイヤーが実際に歩ける方向を1つ探す */
function walkableDir(game: Game): Dir | null {
  for (const dir of [0, 1, 2, 3, 4, 5, 6, 7] as Dir[]) {
    const d = dirDelta(dir);
    const to = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (walkableAt(game.floor, to) && !game.floor.actors.some((a) => a.alive && a.pos.x === to.x && a.pos.y === to.y)) {
      return dir;
    }
  }
  return null;
}

describe("ダメージ計算", () => {
  it("守備力が高くても最低1は通る", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 500; i++) {
      expect(computeDamage(rng, 5, 999).damage).toBeGreaterThanOrEqual(1);
    }
  });

  it("攻撃力が高いほど期待ダメージが大きい", () => {
    const avg = (atk: number) => {
      const rng = new Rng(7);
      let total = 0;
      for (let i = 0; i < 2000; i++) total += computeDamage(rng, atk, 4).damage;
      return total / 2000;
    };
    expect(avg(20)).toBeGreaterThan(avg(10));
  });

  it("会心の一撃はおおむね1/32の頻度で出る", () => {
    const rng = new Rng(3);
    let crits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (computeDamage(rng, 10, 5).critical) crits++;
    const rate = crits / trials;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.045);
  });
});

describe("レベルアップ", () => {
  it("必要経験値に達するとレベルが上がり能力が伸びる", () => {
    const player = createPlayer(1);
    const beforeAtk = player.atk;
    const beforeHp = player.maxHp;
    const levels = gainExp(player, expForLevel(2));
    expect(levels).toBe(1);
    expect(player.level).toBe(2);
    expect(player.atk).toBeGreaterThan(beforeAtk);
    expect(player.maxHp).toBeGreaterThan(beforeHp);
  });

  it("大量の経験値で一度に複数レベル上がる", () => {
    const player = createPlayer(1);
    const levels = gainExp(player, expForLevel(5));
    expect(levels).toBe(4);
    expect(player.level).toBe(5);
  });

  it("最大レベルを超えない", () => {
    const player = createPlayer(1);
    gainExp(player, 9_999_999);
    expect(player.level).toBe(MAX_LEVEL);
  });
});

describe("持ち物", () => {
  it("装備すると攻撃力に加算される", () => {
    const player = createPlayer(1);
    const item = createItem(100, "hatchet");
    addItem(player.inventory, item);
    expect(totalAttack(player)).toBe(player.atk);
    equip(player.inventory, item.uid);
    expect(weaponBonus(player.inventory)).toBe(4);
    expect(totalAttack(player)).toBe(player.atk + 4);
  });

  it("同じ武器をもう一度選ぶと外れる", () => {
    const inv = createInventory();
    const item = createItem(1, "hatchet");
    addItem(inv, item);
    equip(inv, item.uid);
    expect(inv.weaponUid).toBe(item.uid);
    equip(inv, item.uid);
    expect(inv.weaponUid).toBeNull();
  });

  it("上限を超えて持てない", () => {
    const inv = createInventory(3);
    for (let i = 0; i < 3; i++) expect(addItem(inv, createItem(i, "healLeaf"))).toBe(true);
    expect(addItem(inv, createItem(99, "healLeaf"))).toBe(false);
    expect(inv.items.length).toBe(3);
  });
});

describe("ゲーム進行", () => {
  it("開始時にプレイヤーは歩けるマスにいて、階段とは別の場所にいる", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new Game({ seed });
      expect(walkableAt(game.floor, game.player.pos)).toBe(true);
      expect(game.player.pos).not.toEqual(game.floor.stairs);
    }
  });

  it("壁に向かって歩いてもターンは進まない", () => {
    const game = newGame();
    // 壁に接する方向を探す
    let wallDir: Dir | null = null;
    for (const dir of [0, 1, 2, 3, 4, 5, 6, 7] as Dir[]) {
      const d = dirDelta(dir);
      if (!walkableAt(game.floor, { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y })) {
        wallDir = dir;
        break;
      }
    }
    if (wallDir === null) return; // 四方が開けている稀なケースは検証をとばす
    const before = game.turnCount;
    const events = game.command({ type: "move", dir: wallDir });
    expect(game.turnCount).toBe(before);
    expect(events.some((e) => e.type === "bump")).toBe(true);
  });

  it("歩くとターンが進み、満腹度が減る", () => {
    const game = newGame(5);
    const dir = walkableDir(game);
    expect(dir).not.toBeNull();
    const satietyBefore = game.player.satiety;
    game.command({ type: "move", dir: dir! });
    expect(game.turnCount).toBe(1);
    expect(game.player.satiety).toBeLessThan(satietyBefore);
  });

  it("向きを変えるだけではターンを消費しない", () => {
    const game = newGame();
    const before = game.turnCount;
    game.command({ type: "face", dir: 2 });
    expect(game.player.facing).toBe(2);
    expect(game.turnCount).toBe(before);
  });

  it("#189: 向きを変えるだけでもfaceイベントを出す(表示側のモデル回転に使う)", () => {
    const game = newGame();
    const events = game.command({ type: "face", dir: 6 });
    expect(events.some((e) => e.type === "face" && e.actorId === game.player.id && e.dir === 6)).toBe(true);
  });

  it("階段の上でなければ降りられない", () => {
    const game = newGame();
    const depthBefore = game.depth;
    const events = game.command({ type: "descend" });
    expect(game.depth).toBe(depthBefore);
    expect(events.some((e) => e.type === "message" && e.text.includes("階段がない"))).toBe(true);
  });

  it("階段に立って降りると次の階に進む", () => {
    const game = newGame(9);
    game.player.pos = game.floor.stairs;
    const events = game.command({ type: "descend" });
    expect(game.depth).toBe(2);
    expect(events.some((e) => e.type === "descend")).toBe(true);
    expect(walkableAt(game.floor, game.player.pos)).toBe(true);
  });

  it("最下層の階段を降りるとクリアになる", () => {
    const game = new Game({ seed: 3, maxDepth: 1 });
    game.player.pos = game.floor.stairs;
    game.command({ type: "descend" });
    expect(game.status).toBe("cleared");
  });

  it("満腹度が尽きるとHPが減り、やがて力尽きる", () => {
    const game = newGame(21);
    game.player.satiety = 0;
    const hpBefore = game.player.hp;
    game.command({ type: "wait" });
    expect(game.player.hp).toBeLessThan(hpBefore);

    for (let i = 0; i < 500 && game.status === "playing"; i++) {
      game.player.satiety = 0;
      game.command({ type: "wait" });
    }
    expect(game.status).toBe("dead");
  });

  it("いやしの葉を使うとHPが回復し、持ち物から消える", () => {
    const game = newGame(31);
    game.player.hp = 5;
    const item = game.giveItem("healLeaf")!;
    expect(item).not.toBeNull();
    game.command({ type: "use", uid: item.uid });
    expect(game.player.hp).toBeGreaterThan(5);
    expect(game.player.inventory.items.find((i) => i.uid === item.uid)).toBeUndefined();
  });

  it("パンを食べると満腹度が戻る", () => {
    const game = newGame(33);
    game.player.satiety = 10;
    const item = game.giveItem("hardBread")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.player.satiety).toBeGreaterThan(10);
  });

  it("地図の巻物を読むとフロア全体が探索済みになる", () => {
    const game = newGame(35);
    const item = game.giveItem("mapScroll")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.floor.tiles.every((t) => t.explored)).toBe(true);
  });

  it("杖は使うたびに残り回数が減り、尽きたら振れない", () => {
    const game = newGame(37);
    const item = game.giveItem("sleepStaff")!;
    // 対象がいないと消費しないので、隣にモンスターを立たせる
    const d = dirDelta(game.player.facing);
    const target = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (!walkableAt(game.floor, target)) return;
    const monster = game.floor.actors.find((a) => a.kind === "monster");
    if (!monster) return;
    monster.pos = target;

    const before = item.charges!;
    game.command({ type: "use", uid: item.uid });
    expect(item.charges).toBe(before - 1);
    expect(hasStatus(monster, STATUS_SLEEP)).toBe(true);
  });

  it("アイテムを置いて拾い直せる", () => {
    const game = newGame(41);
    // 足元に何も無い場所へ移動しておく
    game.floor.items = game.floor.items.filter((gi) => gi.pos.x !== game.player.pos.x || gi.pos.y !== game.player.pos.y);
    const item = game.giveItem("healLeaf")!;
    game.command({ type: "drop", uid: item.uid });
    expect(game.player.inventory.items.some((i) => i.uid === item.uid)).toBe(false);
    game.command({ type: "pickup" });
    expect(game.player.inventory.items.some((i) => i.uid === item.uid)).toBe(true);
  });

  it("眠っているあいだは行動できないが、ターンは進む", () => {
    const game = newGame(43);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 3 });
    const posBefore = { ...game.player.pos };
    const dir = walkableDir(game);
    if (dir === null) return;
    game.command({ type: "move", dir });
    expect(game.player.pos).toEqual(posBefore);
    expect(game.turnCount).toBe(1);
  });

  it("状態異常はターン経過で解ける", () => {
    const game = newGame(45);
    game.player.statuses.push({ kind: STATUS_SLEEP, turns: 2 });
    game.command({ type: "wait" });
    game.command({ type: "wait" });
    expect(hasStatus(game.player, STATUS_SLEEP)).toBe(false);
  });

  it("モンスターを倒すと経験値が入る", () => {
    const game = newGame(47);
    const monster = game.floor.actors.find((a) => a.kind === "monster")!;
    // 隣に置いて、確実に倒せるところまで弱らせる
    const d = dirDelta(2);
    monster.pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    monster.hp = 1;
    const expBefore = game.player.exp;
    game.command({ type: "face", dir: 2 });
    game.command({ type: "attack" });
    expect(game.player.exp).toBeGreaterThan(expBefore);
    expect(monster.alive).toBe(false);
  });

  it("200ターン動かしても例外なく進行し、状態が壊れない", () => {
    const game = newGame(51);
    const rng = new Rng(999);
    for (let i = 0; i < 200 && game.status === "playing"; i++) {
      const dir = rng.pick([0, 1, 2, 3, 4, 5, 6, 7] as Dir[]);
      game.command({ type: "move", dir });
      expect(game.player.hp).toBeLessThanOrEqual(game.player.maxHp);
      expect(walkableAt(game.floor, game.player.pos)).toBe(true);
      for (const actor of game.floor.actors) {
        if (actor.alive) expect(walkableAt(game.floor, actor.pos)).toBe(true);
      }
    }
  });

  it("同じマスに2体のアクターが重ならない", () => {
    const game = newGame(53);
    const rng = new Rng(1234);
    for (let i = 0; i < 300 && game.status === "playing"; i++) {
      game.command({ type: "move", dir: rng.pick([0, 1, 2, 3, 4, 5, 6, 7] as Dir[]) });
      const seen = new Set<string>();
      for (const actor of game.floor.actors) {
        if (!actor.alive) continue;
        const key = `${actor.pos.x},${actor.pos.y}`;
        expect(seen.has(key), `${key} に複数のアクターが重なっている`).toBe(false);
        seen.add(key);
      }
    }
  });
});
