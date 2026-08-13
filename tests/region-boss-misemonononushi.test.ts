import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { FloorState, MonsterActor, PlayerActor } from "../src/core/types";
import { roomContains } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { access } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";

function bossActor(overrides: Partial<MonsterActor> = {}): MonsterActor {
  const species = speciesById("misemonoNoNushi");
  return {
    // プレイヤー(id: 1固定、src/game.tsのcreatePlayer(1))との衝突を避ける
    id: 100,
    kind: "monster",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos: { x: 5, y: 5 },
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: species.ai,
    aware: true,
    ...overrides,
  };
}

function player(pos = { x: 5, y: 6 }): PlayerActor {
  return {
    id: 2,
    kind: "player",
    name: "プレイヤー",
    model: "player",
    pos,
    facing: 0,
    hp: 100,
    maxHp: 100,
    atk: 5,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
  };
}

function emptyFloor(): FloorState {
  return makeEmptyFloor({ depth: 42, rooms: [{ id: 0, x: 0, y: 0, w: 12, h: 12 }] });
}

describe("entities/species.ts: 見世物のぬし(第七地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("misemonoNoNushi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はsummonMirror", () => {
    const species = speciesById("misemonoNoNushi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("summonMirror");
  });

  it("REGION_BOSS_ORDERで掘り杭の主(第八地方)の直前に登録されている", () => {
    expect(REGION_BOSS_ORDER.indexOf("misemonoNoNushi")).toBe(
      REGION_BOSS_ORDER.indexOf("horikuiNoNushi") - 1,
    );
  });
});

describe("entities/ai.ts: 見世物のぬしの大技(decideMonsterAction)", () => {
  it("隣接した最初の手は攻撃せず、予兆(telegraph)を返す", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor();
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action.type).toBe("telegraph");
    expect(boss.telegraphCharge).toBe(true);
  });

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくsummonMirrorになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 5 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "bossMove", moveId: "summonMirror" });
    expect(boss.telegraphCharge).toBe(false);
  });

  it("幻影(mirrorOfを持つ)は、隣接しても常に待機するだけで自分からは行動しない", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const mirror = bossActor({ id: 5, mirrorOf: 100 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [mirror, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, mirror, target, field);
    expect(action).toEqual({ type: "wait" });
  });
});

describe("game.ts: 地方ボスの階(depth 42、表の寝穴)", () => {
  it("見世物のぬしが1体だけ配置される(通常の野生モンスターは湧かない)", () => {
    const game = new Game({ seed: 1, startDepth: 42 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("misemonoNoNushi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, startDepth: 42 });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(見世物の面)を確定ドロップする", () => {
    const game = new Game({ seed: 1, startDepth: 42 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "misemonoNoNushi",
    )!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "misemonoNoOmen" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 大技(summonMirror)が本体そっくりの幻影を呼び出す", () => {
  it("予兆済みのボスに隣接した状態で行動させると、幻影が3体まで現れる", () => {
    const game = new Game({ seed: 1, startDepth: 42 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "misemonoNoNushi",
    )!;
    const room = game.floor.rooms.find((r) => roomContains(r, boss.pos))!;
    expect(room).toBeDefined();

    const neighbors = [
      { x: boss.pos.x - 1, y: boss.pos.y },
      { x: boss.pos.x + 1, y: boss.pos.y },
      { x: boss.pos.x, y: boss.pos.y - 1 },
      { x: boss.pos.x, y: boss.pos.y + 1 },
    ];
    const spot = neighbors.find((n) => {
      const t = game.floor.tiles[n.y * game.floor.width + n.x];
      return t && t.kind !== 0 && roomContains(room, n);
    });
    expect(spot).toBeDefined();
    if (!spot) return;

    boss.telegraphCharge = true;
    boss.telegraphCooldown = 5;
    game.player.pos = spot;

    const events = game.command({ type: "wait" });

    const mirrors = game.floor.actors.filter(
      (a): a is MonsterActor => a.kind === "monster" && a.mirrorOf === boss.id,
    );
    expect(mirrors.length).toBeGreaterThan(0);
    expect(mirrors.length).toBeLessThanOrEqual(3);
    for (const mirror of mirrors) expect(mirror.speciesId).toBe("misemonoNoNushi");
    expect(events.some((e) => e.type === "message" && e.text.includes("幻影が現れた"))).toBe(true);
    // summonMirrorでmirrorTurnsLeft=5に設定した直後、同じcommand内のupkeepで
    // tickMirrorsが1回減らすため、この時点では4になっている
    expect(boss.mirrorTurnsLeft).toBe(4);
  });
});

describe("game.ts: 幻影を攻撃するとダメージなしで消え、本体が反撃する", () => {
  it("幻影への攻撃はダメージが発生せず消えるだけで、本体からプレイヤーへ反撃が入る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor();
    const mirror = bossActor({ id: 5, mirrorOf: boss.id, pos: { x: 6, y: 5 } });
    game.floor.actors.push(boss, mirror);
    game.player.pos = { x: 5, y: 5 };
    game.player.facing = 2; // 東(mirrorの方向)
    const hpBefore = game.player.hp;

    const events = game.command({ type: "move", dir: 2 });

    expect(game.floor.actors.some((a) => a.id === mirror.id)).toBe(false);
    expect(game.player.hp).toBeLessThan(hpBefore);
    expect(events.some((e) => e.type === "message" && e.text === "――そっちは幻だった!")).toBe(true);
  });

  it("本体への命中は通常どおりダメージが入り、残りの幻影はすべて消える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ pos: { x: 6, y: 5 } });
    const mirror1 = bossActor({ id: 5, mirrorOf: boss.id, pos: { x: 6, y: 6 } });
    const mirror2 = bossActor({ id: 6, mirrorOf: boss.id, pos: { x: 6, y: 4 } });
    game.floor.actors.push(boss, mirror1, mirror2);
    game.player.pos = { x: 5, y: 5 };
    const bossHpBefore = boss.hp;

    game.command({ type: "move", dir: 2 });

    expect(boss.hp).toBeLessThan(bossHpBefore);
    expect(game.floor.actors.some((a) => a.id === mirror1.id)).toBe(false);
    expect(game.floor.actors.some((a) => a.id === mirror2.id)).toBe(false);
  });
});

describe("game.ts: 幻影の自然消滅(tickMirrors)", () => {
  it("5ターン経過しても本体を当てられない場合、幻影が自然に消える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ mirrorTurnsLeft: 5 });
    const mirror = bossActor({ id: 5, mirrorOf: boss.id, pos: { x: 9, y: 9 } });
    game.floor.actors.push(boss, mirror);

    for (let i = 0; i < 5; i++) {
      game.command({ type: "wait" });
    }

    expect(game.floor.actors.some((a) => a.id === mirror.id)).toBe(false);
    expect(boss.mirrorTurnsLeft).toBeUndefined();
  });
});
