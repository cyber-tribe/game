import { describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import { ARTS, artsForLevel } from "../src/entities/arts";
import { isFree, type MonsterActor } from "../src/core/types";
import { captureChance } from "../src/domain/barrel/barrelCapture";

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

function putMonster(
  game: Game,
  pos: { x: number; y: number },
  overrides: Partial<MonsterActor> = {},
): MonsterActor {
  const monster: MonsterActor = {
    id: 8001 + Math.floor(Math.random() * 100000),
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

describe("技の一覧", () => {
  it("5種類が習得レベル順に並んでいる", () => {
    expect(ARTS.map((a) => a.id)).toEqual(["critBarrel", "soothe", "ukemi", "shout", "pierce"]);
    for (let i = 1; i < ARTS.length; i++) {
      expect(ARTS[i]!.unlockLevel).toBeGreaterThan(ARTS[i - 1]!.unlockLevel);
    }
  });

  it("artsForLevelはそのレベルまでに習得済みの技だけを返す", () => {
    expect(artsForLevel(1)).toHaveLength(0);
    expect(artsForLevel(3).map((a) => a.id)).toEqual(["critBarrel"]);
    expect(artsForLevel(20)).toHaveLength(5);
  });
});

describe("技の使用条件", () => {
  it("習得レベルに満たないと使えない(ターンを消費しない)", () => {
    const game = newGame(1);
    game.player.level = 2; // critBarrel(レベル3)にまだ届かない
    const before = game.turnCount;
    const events = game.command({ type: "useArt", id: "critBarrel" });
    expect(game.turnCount).toBe(before);
    expect(events.some((e) => e.type === "message" && e.text === "まだ覚えていない技だ。")).toBe(
      true,
    );
    expect(game.player.critBarrelReady).toBe(false);
  });

  it("クールダウン中は使えない", () => {
    const game = newGame(2);
    game.player.level = 20;
    game.command({ type: "useArt", id: "critBarrel" });
    expect(game.player.artCooldowns.critBarrel).toBeGreaterThan(0);

    const events = game.command({ type: "useArt", id: "critBarrel" });
    expect(events.some((e) => e.type === "message" && e.text.includes("まだ使えない"))).toBe(true);
  });

  it("使うとクールダウンが設定され、ターンごとに1減る", () => {
    // 状態異常と同じ off-by-one 消化(発動したそのターンのupkeepで既に1減る)
    const game = newGame(3);
    game.player.level = 20;
    const def = ARTS.find((a) => a.id === "soothe")!;
    game.command({ type: "useArt", id: "soothe" });
    expect(game.player.artCooldowns.soothe).toBe(def.cooldownTurns - 1);
    game.command({ type: "wait" });
    expect(game.player.artCooldowns.soothe).toBe(def.cooldownTurns - 2);
  });
});

describe("会心の樽投げ", () => {
  it("次に投げるからのタルの捕獲判定が確実に成功する(満タンのHPでも)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      game.player.level = 20;
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      // 満タンHPだと通常の captureChance はごく低いはず
      const monster = putMonster(game, setup.front, { aware: true, hp: 999, maxHp: 999 });
      expect(captureChance(monster)).toBeLessThan(0.2);

      game.command({ type: "useArt", id: "critBarrel" });
      game.giveBarrel("empty");
      const events = game.command({ type: "throwBarrel" });
      expect(events.some((e) => e.type === "capture")).toBe(true);
      expect(game.player.critBarrelReady).toBe(false);
      return;
    }
    throw new Error("開けた方向が見つからなかった");
  });
});

describe("なだめの手つき", () => {
  it("正面のモンスターにダメージを与えずcaptureBonusを乗せる", () => {
    const game = newGame(4);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 20;
    const setup = faceOpenDirection(game);
    expect(setup).not.toBeNull();
    const monster = putMonster(game, setup!.front, { aware: true, hp: 999, maxHp: 999 });

    const events = game.command({ type: "useArt", id: "soothe" });
    expect(monster.hp).toBe(999); // ダメージは与えない
    expect(monster.captureBonus).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "message" && e.text.includes("勢いをそいだ"))).toBe(true);
  });

  it("正面に何もいなければ空振りする(それでもターンは消費する)", () => {
    const game = newGame(5);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 20;
    const before = game.turnCount;
    const events = game.command({ type: "useArt", id: "soothe" });
    expect(game.turnCount).toBe(before + 1);
    expect(events.some((e) => e.type === "message" && e.text === "しかし何も起こらなかった。")).toBe(
      true,
    );
  });
});

describe("樽受け身", () => {
  function setupAdjacentBrawl(seed: number) {
    const game = newGame(seed);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 20;
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

  /**
   * 「技を使う」こと自体が1ターンなので、隣接する敵がいれば
   * useArt を発行したその command 呼び出しの中で反撃が起きる。
   * (「発動から1ターンだけ有効」とはこの1手ぶんを指す)
   */
  it("発動したそのターンの被弾を完全無効化するが、次のターンへは持ち越さない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const setup = setupAdjacentBrawl(seed);
      if (!setup) continue;
      const { game } = setup;

      const before = game.player.hp;
      const events = game.command({ type: "useArt", id: "ukemi" });
      // 無効化されると amount:0 の damage イベントとして残るので、amount では絞らない
      const wasAttacked = events.some((e) => e.type === "damage" && e.actorId === game.player.id);
      if (!wasAttacked) continue; // 反撃が来なかった場合は無効化の検証にならないので次のseedへ

      expect(game.player.hp, `seed=${seed}`).toBe(before);
      expect(game.player.ukemiReady, `seed=${seed}`).toBe(false);
      expect(
        events.some((e) => e.type === "message" && e.text === "樽受け身で衝撃を受け流した!"),
      ).toBe(true);

      // 効果は使い切り。次のターンの被弾までは持ち越さない
      const afterUkemiHp = game.player.hp;
      const nextEvents = game.command({ type: "wait" });
      const tookDamageAgain = nextEvents.some(
        (e) => e.type === "damage" && e.actorId === game.player.id && e.amount > 0,
      );
      if (tookDamageAgain) {
        expect(game.player.hp, `seed=${seed}`).toBeLessThan(afterUkemiHp);
      }
      return;
    }
    throw new Error("反撃が起きるseedが見つからなかった");
  });

  it("隣接する敵がいなければ、発動してもそのターンのうちに失効する", () => {
    const game = newGame(6);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 20;
    game.command({ type: "useArt", id: "ukemi" });
    expect(game.player.ukemiReady).toBe(false);
  });
});

describe("目覚ましの一喝", () => {
  it("地方ボス(未実装)がいないため、現状は不発のメッセージだけを返す", () => {
    const game = newGame(7);
    game.player.level = 20;
    const events = game.command({ type: "useArt", id: "shout" });
    expect(
      events.some((e) => e.type === "message" && e.text === "しかし、それらしい気配はなかった。"),
    ).toBe(true);
    expect(game.player.artCooldowns.shout).toBeGreaterThan(0);
  });
});

describe("抱え投げの奥義", () => {
  it("直線上の複数体に当たり、手前は通過ダメージ、最後の1体にだけ捕獲判定を行う", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      game.player.level = 20;
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const d = { x: setup.front.x - game.player.pos.x, y: setup.front.y - game.player.pos.y };
      const secondPos = { x: setup.front.x + d.x, y: setup.front.y + d.y };
      if (!isFree(game.floor, secondPos)) continue;

      // 技の発動を先に済ませてから配置する(runActorsで敵の位置がずれないように)
      game.command({ type: "useArt", id: "pierce" });
      const first = putMonster(game, setup.front, { aware: true, hp: 999, maxHp: 999, def: 0 });
      const second = putMonster(game, secondPos, { aware: true, hp: 999, maxHp: 999, def: 0 });

      game.giveBarrel("empty");
      const events = game.command({ type: "throwBarrel" });

      expect(first.hp).toBeLessThan(999);
      expect(events.some((e) => e.type === "message" && e.text.includes("貫いた"))).toBe(true);
      const secondDamaged = events.some(
        (e) => e.type === "damage" && e.actorId === second.id,
      );
      expect(secondDamaged).toBe(true);
      expect(game.player.pierceReady).toBe(false);
      return;
    }
    throw new Error("直線上に2マス空いている方向が見つからなかった");
  });
});
