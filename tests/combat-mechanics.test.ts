import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { computeDamage, MAX_CRIT_RATE } from "../src/systems/combat";
import { isFree, type Actor } from "../src/core/types";
import { Game } from "../src/game";

describe("会心率の上限", () => {
  it("critBonusをいくら積んでも上限(20%)を超えない", () => {
    const rng = new Rng(1);
    let crits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (computeDamage(rng, 10, 5, { critBonus: 1 }).critical) crits++;
    }
    const rate = crits / trials;
    expect(rate).toBeGreaterThan(MAX_CRIT_RATE - 0.03);
    expect(rate).toBeLessThan(MAX_CRIT_RATE + 0.03);
  });

  it("forceCritは上限の対象外で、常に会心になる", () => {
    const rng = new Rng(2);
    for (let i = 0; i < 50; i++) {
      expect(computeDamage(rng, 10, 100, { critBonus: 1, forceCrit: true }).critical).toBe(true);
    }
  });

  it("ボーナスが無ければ従来どおり約1/32", () => {
    const rng = new Rng(3);
    let crits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (computeDamage(rng, 10, 5).critical) crits++;
    const rate = crits / trials;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.045);
  });
});

function newGame(seed = 1) {
  return new Game({ seed });
}

function faceOpenDirection(game: Game) {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
    const d = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ][dir]!;
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return { dir, front };
    }
  }
  return null;
}

function putMonster(game: Game, pos: { x: number; y: number }, overrides: Partial<Actor> = {}): Actor {
  const monster: Actor = {
    id: 8001 + Math.floor(Math.random() * 1000),
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 999,
    maxHp: 999,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: false,
    ...overrides,
  };
  game.floor.actors.push(monster);
  return monster;
}

describe("不意打ち", () => {
  it("まだ気づいていないモンスターへの攻撃は必ず会心になる", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front, { aware: false });
      const events = game.command({ type: "move", dir: setup.dir });
      const damage = events.find(
        (e): e is Extract<typeof events[number], { type: "damage" }> =>
          e.type === "damage" && e.actorId === monster.id,
      );
      expect(damage?.critical, `seed=${seed}`).toBe(true);
      expect(events.some((e) => e.type === "message" && e.text === "不意打ち!")).toBe(true);
      return;
    }
    throw new Error("開けた方向が見つからなかった");
  });

  it("すでに気づいているモンスターには不意打ちが乗らない(通常の確率になる)", () => {
    let crits = 0;
    let hits = 0;
    for (let seed = 1; seed <= 400 && hits < 3000; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front, { aware: true, hp: 100000, maxHp: 100000 });
      for (let i = 0; i < 20; i++) {
        const events = game.command({ type: "move", dir: setup.dir });
        const damage = events.find(
          (e): e is Extract<typeof events[number], { type: "damage" }> =>
            e.type === "damage" && e.actorId === monster.id,
        );
        if (!damage) break;
        hits++;
        if (damage.critical) crits++;
      }
    }
    expect(hits).toBeGreaterThan(500);
    const rate = crits / hits;
    expect(rate).toBeLessThan(0.15); // 100%(不意打ち)ではないことを広めのマージンで確認
  });
});

describe("身構え(足踏み)", () => {
  it("足踏みをすると身構え状態になる", () => {
    const game = newGame(1);
    expect(game.player.guarding).toBe(false);
    game.command({ type: "wait" });
    expect(game.player.guarding).toBe(true);
  });

  it("被弾するまでは、他の行動をはさんでも身構えは解けない", () => {
    const game = newGame(1);
    game.command({ type: "wait" });
    expect(game.player.guarding).toBe(true);
    const dir = faceOpenDirection(game);
    if (!dir) return;
    game.command({ type: "move", dir: dir.dir }); // 敵のいない方向へただ歩く
    expect(game.player.guarding).toBe(true);
  });

  /**
   * プレイヤーの正面に頑丈なモンスターを置き、「move で攻撃する」1コマンドで
   * プレイヤーの攻撃とモンスターの反撃を同一ターンに起こす。身構えの有無を
   * player.guarding の直接操作で切り替え、同じ seed(=同じ乱数列)で比較する
   * ことで、軽減倍率以外の条件をそろえたまま被ダメージを比較できる。
   */
  function setupAdjacentBrawl(seed: number) {
    const game = newGame(seed);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.hp = 100000;
    game.player.maxHp = 100000;
    const setup = faceOpenDirection(game);
    if (!setup) return null;
    const monster = putMonster(game, setup.front, {
      aware: true,
      aiKind: "melee",
      atk: 30,
      def: 0,
      hp: 100000,
      maxHp: 100000,
    });
    return { game, monster, dir: setup.dir };
  }

  it("身構え中に被弾すると、ダメージが軽減され、身構えが解ける", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const setup = setupAdjacentBrawl(seed);
      if (!setup) continue;
      const { game, dir } = setup;

      game.player.guarding = true;
      const before = game.player.hp;
      game.command({ type: "move", dir }); // 攻撃 → 同一ターン内でモンスターが反撃
      const guardedDamage = before - game.player.hp;
      if (guardedDamage <= 0) continue; // 反撃が起きなければ別seedで試す

      expect(game.player.guarding, `seed=${seed}`).toBe(false);

      // 同じ seed・同じ手順で、身構えていない場合のダメージと比較する
      const unguarded = setupAdjacentBrawl(seed)!;
      const beforeU = unguarded.game.player.hp;
      unguarded.game.command({ type: "move", dir: unguarded.dir });
      const unguardedDamage = beforeU - unguarded.game.player.hp;

      expect(guardedDamage, `seed=${seed}`).toBeLessThan(unguardedDamage);
      return;
    }
    throw new Error("反撃が起きるseedが見つからなかった");
  });
});
