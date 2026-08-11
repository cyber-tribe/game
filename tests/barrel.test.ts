import { describe, expect, it } from "vitest";
import { Game, captureChance } from "../src/game";
import { Rng } from "../src/core/rng";
import { type Dir, dirDelta } from "../src/core/grid";
import { MAX_ALLIES } from "../src/entities/player";
import {
  type Actor,
  actorAt,
  barrelAt,
  isFree,
  isHostile,
  walkableAt,
} from "../src/core/types";

function newGame(seed = 42) {
  return new Game({ seed });
}

/** プレイヤーの正面が空くように向きを選ぶ。無理なら null */
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

/** プレイヤーの正面にモンスターを1体連れてくる */
function putMonsterInFront(game: Game): { monster: Actor; dir: Dir } | null {
  const dir = faceOpenDirection(game);
  if (dir === null) return null;
  const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive);
  if (!monster) return null;
  const d = dirDelta(dir);
  monster.pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
  return { monster, dir };
}

describe("タルの配置", () => {
  it("どの階にも必ずタルが置かれる", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed });
      expect(game.floor.barrels.length, `seed=${seed}`).toBeGreaterThan(0);
    }
  });

  it("タルは歩けるマスに、重ならずに置かれる", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed });
      const seen = new Set<string>();
      for (const barrel of game.floor.barrels) {
        expect(walkableAt(game.floor, barrel.pos)).toBe(true);
        const key = `${barrel.pos.x},${barrel.pos.y}`;
        expect(seen.has(key), `seed=${seed} でタルが重なっている`).toBe(false);
        seen.add(key);
        // アクターの上にも乗らない
        expect(actorAt(game.floor, barrel.pos)).toBeUndefined();
      }
    }
  });

  it("深い階ほど爆発タルが混ざりやすい", () => {
    const bombRate = (depth: number) => {
      let bombs = 0;
      let total = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const game = new Game({ seed: seed * 31, maxDepth: 20 });
        // 目的の階まで潜る
        while (game.depth < depth && game.status === "playing") {
          game.player.pos = game.floor.stairs;
          game.command({ type: "descend" });
        }
        bombs += game.floor.barrels.filter((b) => b.kind === "bomb").length;
        total += game.floor.barrels.length;
      }
      return bombs / total;
    };
    expect(bombRate(8)).toBeGreaterThan(bombRate(1));
  });
});

describe("タルの持ち上げと設置", () => {
  it("正面のタルを持ち上げると、盤面から消えて手元に来る", () => {
    const game = newGame(11);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    const barrel = game.floor.barrels[0]!;
    barrel.pos = front;

    game.command({ type: "liftBarrel" });
    expect(game.player.carrying?.id).toBe(barrel.id);
    expect(barrelAt(game.floor, front)).toBeUndefined();
  });

  it("抱えたまま持ち上げ操作をすると置く", () => {
    const game = newGame(12);
    faceOpenDirection(game);
    game.giveBarrel("empty");
    const carried = game.player.carrying!;
    game.command({ type: "liftBarrel" });
    expect(game.player.carrying).toBeNull();
    expect(game.floor.barrels.some((b) => b.id === carried.id)).toBe(true);
  });

  it("タルが無いところで持ち上げようとしても何も起きない", () => {
    const game = newGame(13);
    game.floor.barrels = [];
    const before = game.turnCount;
    const events = game.command({ type: "liftBarrel" });
    expect(game.turnCount).toBe(before);
    expect(events.some((e) => e.type === "message" && e.text.includes("タルがない"))).toBe(true);
  });

  it("タルを抱えていると足元のアイテムを拾えない", () => {
    const game = newGame(14);
    game.giveBarrel("empty");
    game.floor.items.push({
      item: { uid: 9999, defId: "healLeaf" },
      pos: { ...game.player.pos },
    });
    const events = game.command({ type: "pickup" });
    expect(events.some((e) => e.type === "message" && e.text.includes("手がふさがっている"))).toBe(
      true,
    );
  });

  it("タルは通り抜けられない", () => {
    const game = newGame(15);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    const d = dirDelta(dir!);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    game.floor.barrels[0]!.pos = front;

    const before = { ...game.player.pos };
    const events = game.command({ type: "move", dir: dir! });
    expect(game.player.pos).toEqual(before);
    expect(events.some((e) => e.type === "message" && e.text.includes("ふさいで"))).toBe(true);
  });
});

describe("タルを投げる", () => {
  it("誰にも当たらなければ、飛んだ先に落ちる", () => {
    const game = newGame(21);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    // 進路上のモンスターをどかしておく
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const barrel = game.giveBarrel("empty");

    game.command({ type: "throwBarrel" });
    expect(game.player.carrying).toBeNull();
    const landed = game.floor.barrels.find((b) => b.id === barrel.id);
    expect(landed, "投げたタルが盤面に見当たらない").toBeDefined();
    expect(landed!.pos).not.toEqual(game.player.pos);
  });

  it("モンスターに当てるとダメージが入る", () => {
    const game = newGame(23);
    const placed = putMonsterInFront(game);
    if (!placed) return;
    placed.monster.hp = placed.monster.maxHp;
    game.giveBarrel("empty");

    const before = placed.monster.hp;
    game.command({ type: "throwBarrel" });
    expect(placed.monster.hp).toBeLessThan(before);
  });

  it("爆発タルは周囲のモンスターをまとめて巻き込む", () => {
    const game = newGame(25);
    const dir = faceOpenDirection(game);
    if (dir === null) return;
    const d = dirDelta(dir);
    const center = { x: game.player.pos.x + d.x * 2, y: game.player.pos.y + d.y * 2 };
    if (!walkableAt(game.floor, center)) return;

    // 爆心のまわりにモンスターを2体並べる
    const monsters = game.floor.actors.filter((a) => a.kind === "monster" && a.alive).slice(0, 2);
    if (monsters.length < 2) return;
    monsters[0]!.pos = center;
    const side = { x: center.x, y: center.y + 1 };
    if (!walkableAt(game.floor, side)) return;
    monsters[1]!.pos = side;
    for (const m of monsters) m.hp = m.maxHp = 60;

    game.giveBarrel("bomb");
    const events = game.command({ type: "throwBarrel" });

    expect(events.some((e) => e.type === "explosion")).toBe(true);
    for (const m of monsters) {
      expect(m.hp, `${m.name} が巻き込まれていない`).toBeLessThan(60);
    }
  });

  it("爆発タルは投げたあと盤面に残らない", () => {
    const game = newGame(27);
    faceOpenDirection(game);
    const barrel = game.giveBarrel("bomb");
    game.command({ type: "throwBarrel" });
    expect(game.floor.barrels.some((b) => b.id === barrel.id)).toBe(false);
  });
});

describe("タルに吸い込む", () => {
  it("弱っている相手ほど吸い込みやすい", () => {
    const healthy = { hp: 20, maxHp: 20 } as Actor;
    const wounded = { hp: 2, maxHp: 20 } as Actor;
    expect(captureChance(wounded)).toBeGreaterThan(captureChance(healthy));
    expect(captureChance(healthy)).toBeGreaterThan(0);
    expect(captureChance(wounded)).toBeLessThanOrEqual(0.85);
  });

  it("吸い込みに成功すると、盤面から消えてタルが中身入りになる", () => {
    // 吸い込みが必ず成功するよう、瀕死にしてから何度か試す
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game({ seed });
      const placed = putMonsterInFront(game);
      if (!placed) continue;
      placed.monster.maxHp = 200;
      placed.monster.hp = 200; // タルのダメージでは倒れない
      // 瀕死扱いにして成功率を最大にする
      placed.monster.maxHp = 1000;
      const barrel = game.giveBarrel("empty");

      const events = game.command({ type: "throwBarrel" });
      const captured = events.find((e) => e.type === "capture");
      if (!captured) continue;

      expect(game.floor.actors.some((a) => a.id === placed.monster.id)).toBe(false);
      const onFloor = game.floor.barrels.find((b) => b.id === barrel.id);
      expect(onFloor?.kind).toBe("caught");
      expect(onFloor?.speciesId).toBe(placed.monster.speciesId);
      return;
    }
    throw new Error("40シード試しても吸い込みが1度も成功しなかった");
  });

  it("中身入りのタルを投げると仲間になる", () => {
    const game = newGame(31);
    faceOpenDirection(game);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.giveBarrel("caught", "purun");

    const events = game.command({ type: "throwBarrel" });
    expect(events.some((e) => e.type === "recruit")).toBe(true);
    expect(game.allies.length).toBe(1);
    expect(game.allies[0]!.kind).toBe("ally");
    expect(game.allies[0]!.speciesId).toBe("purun");
    expect(game.floor.actors.some((a) => a.kind === "ally")).toBe(true);
  });

  it("上限を超えて仲間にはできない", () => {
    const game = newGame(33);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    for (let i = 0; i < MAX_ALLIES + 2; i++) {
      faceOpenDirection(game);
      game.giveBarrel("caught", "purun");
      game.command({ type: "throwBarrel" });
    }
    expect(game.allies.length).toBe(MAX_ALLIES);
  });
});

describe("仲間の振る舞い", () => {
  function withAlly(seed: number) {
    const game = new Game({ seed });
    faceOpenDirection(game);
    game.giveBarrel("caught", "gajiri");
    game.command({ type: "throwBarrel" });
    return game;
  }

  it("仲間はプレイヤーと同じ陣営で、モンスターとは敵対する", () => {
    const game = withAlly(41);
    const ally = game.allies[0];
    if (!ally) return;
    expect(isHostile(game.player, ally)).toBe(false);
    const monster = game.floor.actors.find((a) => a.kind === "monster");
    if (monster) expect(isHostile(ally, monster)).toBe(true);
  });

  it("仲間の上を歩こうとすると位置が入れ替わる", () => {
    const game = withAlly(43);
    const ally = game.allies[0];
    if (!ally) return;
    // 仲間を正面に連れてくる
    const dir = faceOpenDirection(game);
    if (dir === null) return;
    const d = dirDelta(dir);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    ally.pos = front;
    const playerBefore = { ...game.player.pos };

    const events = game.command({ type: "move", dir });
    expect(events.some((e) => e.type === "swap")).toBe(true);
    expect(game.player.pos).toEqual(front);
    expect(ally.pos).toEqual(playerBefore);
  });

  it("仲間は階段について来る", () => {
    const game = withAlly(45);
    if (game.allies.length === 0) return;
    const allyId = game.allies[0]!.id;
    game.player.pos = game.floor.stairs;
    game.command({ type: "descend" });
    expect(game.depth).toBe(2);
    expect(game.floor.actors.some((a) => a.id === allyId)).toBe(true);
  });

  it("仲間がいても、アクターが同じマスに重ならない", () => {
    const game = withAlly(47);
    const rng = new Rng(777);
    for (let i = 0; i < 250 && game.status === "playing"; i++) {
      game.command({ type: "move", dir: rng.pick([0, 1, 2, 3, 4, 5, 6, 7] as Dir[]) });
      const seen = new Set<string>();
      for (const actor of game.floor.actors) {
        if (!actor.alive) continue;
        const key = `${actor.pos.x},${actor.pos.y}`;
        expect(seen.has(key), `${key} に複数のアクターが重なっている`).toBe(false);
        seen.add(key);
      }
      // タルとアクターも重ならない
      for (const barrel of game.floor.barrels) {
        const occupant = actorAt(game.floor, barrel.pos);
        expect(occupant, "タルの上にアクターが乗っている").toBeUndefined();
      }
    }
  });

  it("仲間が倒れると一覧から外れる", () => {
    const game = withAlly(49);
    const ally = game.allies[0];
    if (!ally) return;
    ally.hp = 1;
    // 隣にモンスターを置いて殴らせる
    const spot = { x: ally.pos.x + 1, y: ally.pos.y };
    const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive);
    if (!monster || !walkableAt(game.floor, spot)) return;
    monster.pos = spot;
    monster.atk = 999;
    monster.aware = true;

    for (let i = 0; i < 6 && game.allies.length > 0; i++) game.command({ type: "wait" });
    expect(game.allies.some((a) => a.id === ally.id)).toBe(false);
  });
});
