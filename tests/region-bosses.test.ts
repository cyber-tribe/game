import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState, MonsterActor, PlayerActor } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { speciesById } from "../src/entities/species";
import { Game } from "../src/application/dungeonRun/game";
import { access } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";
import { fuseMonsters, initialSave, type StoredMonster } from "../src/save";

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    dreamArts: [],
    ...overrides,
  };
}

function bossActor(overrides: Partial<MonsterActor> = {}): MonsterActor {
  const species = speciesById("oonebosuke");
  return {
    id: 1,
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
  return makeEmptyFloor({ depth: 6 });
}

describe("entities/species.ts: おおねぼすけ(地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("oonebosuke");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("予兆つきの大技を持つ", () => {
    const species = speciesById("oonebosuke");
    expect(species.bossTelegraph).toBeDefined();
    expect(species.bossTelegraph!.multiplier).toBeGreaterThan(1);
  });

  it("isRegionBossフラグを持つ", () => {
    expect(speciesById("oonebosuke").isRegionBoss).toBe(true);
  });
});

describe("entities/ai.ts: 地方ボスの予兆(decideMonsterAction)", () => {
  it("隣接した最初の手は攻撃せず、予兆(telegraph)を返す", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor();
    const target = player({ x: 6, y: 5 }); // bossの東隣
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action.type).toBe("telegraph");
    expect(boss.telegraphCharge).toBe(true);
  });

  it("予兆の次に隣接して出す手は、必ずempoweredな攻撃になる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 1 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id, empowered: true });
    expect(boss.telegraphCharge).toBe(false);
  });

  it("大技のあとはクールダウン中、通常攻撃に戻る", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    // 直前のempowered攻撃でcooldownTurns(3)が設定された直後の状態を模す
    const boss = bossActor({ telegraphCharge: false, telegraphCooldown: 3 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id });
    expect(boss.telegraphCooldown).toBe(2); // このターンで1減る
  });

  it("通常のモンスター(bossTelegraphを持たない)は今までどおり即座に攻撃する", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const species = speciesById("gajiri");
    const monster: MonsterActor = {
      id: 3,
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
    };
    const target = player({ x: 6, y: 5 });
    floor.actors = [monster, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, monster, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id });
  });
});

describe("game.ts: 地方ボスの大技(mitigateなしの生ダメージ倍率)", () => {
  it("empoweredな攻撃は通常より大きなダメージを与える", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oonebosuke",
    );
    expect(boss).toBeDefined();

    const damageActor = (
      game as unknown as {
        attack: (attacker: Actor, target: Actor, power: number, events: unknown[]) => void;
      }
    ).attack.bind(game);

    const dummy: Actor = { ...game.player, hp: 9999, maxHp: 9999, def: 0 };
    const normalEvents: unknown[] = [];
    damageActor(boss!, dummy, boss!.atk, normalEvents);
    const normalHp = dummy.hp;

    dummy.hp = 9999;
    const empoweredEvents: unknown[] = [];
    const multiplier = speciesById("oonebosuke").bossTelegraph!.multiplier;
    damageActor(boss!, dummy, Math.round(boss!.atk * multiplier), empoweredEvents);
    const empoweredDamage = 9999 - dummy.hp;
    const normalDamage = 9999 - normalHp;

    expect(empoweredDamage).toBeGreaterThan(normalDamage);
  });
});

describe("game.ts: 地方ボスの階(depth 6、表の寝穴)", () => {
  it("ボスが1体だけ配置され、通常の野生モンスターは湧かない", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("oonebosuke");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(おおねぼすけの眠り粉)を確定ドロップする", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oonebosuke",
    )!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "oonebosukeDust" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("save.ts: 地方ボスを夢あわせの糧にすると3体分の経験値換算になる", () => {
  it("通常個体を糧にした場合との差でレベルが大きく伸びる", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", level: 5 }),
        stored({ uid: 2, speciesId: "oonebosuke", level: 6 }),
        stored({ uid: 3, speciesId: "gajiri", level: 5 }),
        stored({ uid: 4, speciesId: "tsubute", level: 6 }),
      ],
    };
    const withBoss = fuseMonsters(save, 1, 2)!;
    const withNormal = fuseMonsters(save, 3, 4)!;
    // 糧のlevelは同じ(6)。ボスは3倍換算になるぶん、通常個体より結果のlevelが高い
    expect(withBoss.result.level).toBeGreaterThan(withNormal.result.level);
    expect(withBoss.result.level).toBe(5 + Math.floor((6 * 3) / 2) + 1);
  });
});
