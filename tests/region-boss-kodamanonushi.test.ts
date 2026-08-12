import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState } from "../src/core/types";
import { roomContains } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { makeEmptyFloor } from "./helpers/floor";

function bossActor(overrides: Partial<Actor> = {}): Actor {
  const species = speciesById("kodamaNoNushi");
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

function player(pos = { x: 5, y: 6 }): Actor {
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
  return makeEmptyFloor({ depth: 36, rooms: [{ id: 0, x: 0, y: 0, w: 12, h: 12 }] });
}

describe("entities/species.ts: こだまの主(第六地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("kodamaNoNushi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はsummonEcho", () => {
    const species = speciesById("kodamaNoNushi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("summonEcho");
  });

  it("REGION_BOSS_ORDERに、淵の主に続いて登録されている", () => {
    expect(REGION_BOSS_ORDER.indexOf("kodamaNoNushi")).toBe(REGION_BOSS_ORDER.indexOf("fuchiNoNushi") + 1);
  });
});

describe("entities/ai.ts: こだまの主の大技(decideMonsterAction)", () => {
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

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくsummonEchoになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 4 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "summonEcho" });
    expect(boss.telegraphCharge).toBe(false);
  });

  it("分身(sharesHpWithを持つ)は、隣接しても予兆サイクルに入らず通常攻撃する", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const echo = bossActor({ id: 5, sharesHpWith: 1 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [echo, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, echo, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id });
  });
});

describe("game.ts: 地方ボスの階(depth 36、表の寝穴)", () => {
  it("こだまの主が1体だけ配置される(通常の野生モンスターは湧かない)", () => {
    const game = new Game({ seed: 1, startDepth: 36 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("kodamaNoNushi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, startDepth: 36 });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(こだまのかけら)を確定ドロップする", () => {
    const game = new Game({ seed: 1, startDepth: 36 });
    const boss = game.floor.actors.find((a) => a.speciesId === "kodamaNoNushi")!;

    const killActor = (
      game as unknown as { killActor: (target: Actor, events: unknown[]) => void }
    ).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "kodamaNoKakera" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 大技(summonEcho)がHPを共有する分身を呼び出す", () => {
  it("予兆済みのボスに隣接した状態で行動させると、分身が2体まで現れる", () => {
    const game = new Game({ seed: 1, startDepth: 36 });
    const boss = game.floor.actors.find((a) => a.speciesId === "kodamaNoNushi")!;
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
    boss.telegraphCooldown = 4;
    game.player.pos = spot;

    const events = game.command({ type: "wait" });

    const echoes = game.floor.actors.filter((a) => a.sharesHpWith === boss.id);
    expect(echoes).toHaveLength(2);
    for (const echo of echoes) {
      expect(echo.speciesId).toBe("kodamaNoNushi");
      expect(echo.atk).toBe(Math.round(boss.atk * 0.5));
      expect(echo.hp).toBe(boss.hp);
    }
    expect(events.some((e) => e.type === "message" && e.text.includes("分身を呼び出した"))).toBe(true);
  });
});

describe("game.ts: 分身とのHP共有(damageActor/killActor)", () => {
  it("分身へのダメージは、本体の共有HPを減らす", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ hp: 76, maxHp: 76 });
    const echo = bossActor({ id: 5, hp: 76, maxHp: 76, sharesHpWith: boss.id });
    game.floor.actors.push(boss, echo);

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);
    damageActor(echo, 20, false, []);

    expect(boss.hp).toBe(56);
    expect(echo.hp).toBe(56); // 表示用にミラーされる
  });

  it("共有HPが0になると、本体・分身のすべてが同時に撃破される", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ hp: 10, maxHp: 76 });
    const echo1 = bossActor({ id: 5, hp: 10, maxHp: 76, sharesHpWith: boss.id });
    const echo2 = bossActor({ id: 6, hp: 10, maxHp: 76, sharesHpWith: boss.id });
    game.floor.actors.push(boss, echo1, echo2);

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);
    damageActor(echo1, 20, false, []);

    expect(boss.alive).toBe(false);
    expect(echo1.alive).toBe(false);
    expect(echo2.alive).toBe(false);
  });

  it("本体を直接攻撃した場合も、通常どおり共有HPが減る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ hp: 76, maxHp: 76 });
    const echo = bossActor({ id: 5, hp: 76, maxHp: 76, sharesHpWith: boss.id });
    game.floor.actors.push(boss, echo);

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);
    damageActor(boss, 30, false, []);

    expect(boss.hp).toBe(46);
    expect(echo.hp).toBe(46);
  });
});
