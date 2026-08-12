import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import type { GameEvent } from "../src/core/events";
import { addStatus, type EffectContext } from "../src/items/effects";
import { EVOLUTION_RULES, tryEvolve } from "../src/entities/evolution";
import { Game } from "../src/game";
import { speciesById } from "../src/entities/species";
import type { StoredMonster } from "../src/save";

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    ...overrides,
  };
}

describe("entities/evolution.ts: 地方ごとの成熟系統(plan/companion-evolution-expansion.md)", () => {
  it("6件の新規ルールがすべて実在の種族を指す", () => {
    const newToIds = [
      "kasumiutsubo",
      "nemurimogura",
      "yoroioiteke",
      "namidaguma",
      "kodamagitsune",
      "matsurinonushi",
    ];
    for (const id of newToIds) {
      const rule = EVOLUTION_RULES.find((r) => r.toSpeciesId === id);
      expect(rule).toBeDefined();
      expect(() => speciesById(rule!.fromSpeciesId)).not.toThrow();
      expect(() => speciesById(rule!.toSpeciesId)).not.toThrow();
    }
  });

  it("モヤウツボ+ワスレガニの繰り返しでかすみウツボに進化する", () => {
    const m = stored({ speciesId: "moyautsubo", level: 10, recentFusionMaterials: ["wasuregani", "wasuregani", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("kasumiutsubo");
  });

  it("ユメクイモグラ+ホロホロチョウの繰り返しでねむりモグラに進化する", () => {
    const m = stored({ speciesId: "yumekuimogura", level: 10, recentFusionMaterials: ["horoholocho", "horoholocho", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("nemurimogura");
  });

  it("ヨロイムカデ+オイテケボシの繰り返しでヨロイオイテケに進化する", () => {
    const m = stored({ speciesId: "yoroimukade", level: 10, recentFusionMaterials: ["oitekeboshi", "oitekeboshi", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("yoroioiteke");
  });

  it("しずくうお+うるみぐまの繰り返しでなみだぐまに進化する", () => {
    const m = stored({ speciesId: "shizukuuo", level: 10, recentFusionMaterials: ["urumiguma", "urumiguma", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("namidaguma");
  });

  it("やまびこぎつね+こだまうさぎの繰り返しでこだまぎつねに進化する", () => {
    const m = stored({ speciesId: "yamabikogitsune", level: 10, recentFusionMaterials: ["kodamausagi", "kodamausagi", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("kodamagitsune");
  });

  it("めんかぶりこぞう+かざりだるまの繰り返しでまつりのぬしに進化する", () => {
    const m = stored({ speciesId: "menkaburikozo", level: 10, recentFusionMaterials: ["kazaridaruma", "kazaridaruma", "purun"] });
    expect(tryEvolve(m).speciesId).toBe("matsurinonushi");
  });

  it("成熟レベル未満なら進化しない", () => {
    const m = stored({ speciesId: "moyautsubo", level: 9, recentFusionMaterials: ["wasuregani", "wasuregani", "wasuregani"] });
    expect(tryEvolve(m)).toBe(m);
  });
});

function ally(id: number, speciesId: string, overrides: Partial<Actor> = {}): Actor {
  const species = speciesById(speciesId);
  return {
    id,
    kind: "ally",
    name: species.name,
    speciesId,
    model: species.model,
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

function monster(id: number, speciesId: string, overrides: Partial<Actor> = {}): Actor {
  const species = speciesById(speciesId);
  return {
    id,
    kind: "monster",
    name: species.name,
    speciesId,
    model: species.model,
    pos: { x: 1, y: 0 },
    facing: 6,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    aware: true,
    ...overrides,
  };
}

function attackFn(game: Game) {
  return (
    game as unknown as {
      attack: (attacker: Actor, target: Actor, attackPower: number, events: GameEvent[]) => void;
    }
  ).attack.bind(game);
}

describe("game.ts: かすみウツボの回避(evadeChance、plan/companion-evolution-expansion.md)", () => {
  it("確率で攻撃をまるごと回避し、ダメージが発生しない", () => {
    let evaded = 0;
    const trials = 300;
    for (let seed = 1; seed <= trials; seed++) {
      const game = new Game({ seed });
      const attack = attackFn(game);
      const attacker = monster(100, "gajiri");
      const target = ally(200, "kasumiutsubo");
      const events: GameEvent[] = [];
      attack(attacker, target, attacker.atk, events);
      if (events.some((e) => e.type === "message" && e.text.includes("かわした"))) {
        evaded++;
        expect(events.some((e) => e.type === "message" && e.text.includes("のダメージ"))).toBe(false);
      }
    }
    const rate = evaded / trials;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.3);
  });
});

describe("game.ts: なみだぐまのHP依存攻撃力(lowHpAtkBonusMax、plan/companion-evolution-expansion.md)", () => {
  it("HPが低いほど平均ダメージが大きくなる", () => {
    const trials = 200;
    let totalLowHp = 0;
    let totalFullHp = 0;
    for (let seed = 1; seed <= trials; seed++) {
      // 一撃で倒れるとダメージ量が maxHp で頭打ちになり比較にならないため、
      // 十分に耐久のある的を使う
      const target = () => monster(300, "gajiri", { hp: 9999, maxHp: 9999, def: 0 });

      const lowHpGame = new Game({ seed });
      const lowHpAttack = attackFn(lowHpGame);
      const lowHpAttacker = ally(100, "namidaguma", { hp: 1 });
      const lowHpTarget = target();
      const lowHpEvents: GameEvent[] = [];
      lowHpAttack(lowHpAttacker, lowHpTarget, lowHpAttacker.atk, lowHpEvents);
      totalLowHp += Math.max(0, lowHpTarget.maxHp - lowHpTarget.hp);

      const fullHpGame = new Game({ seed });
      const fullHpAttack = attackFn(fullHpGame);
      const fullHpAttacker = ally(100, "namidaguma");
      const fullHpTarget = target();
      const fullHpEvents: GameEvent[] = [];
      fullHpAttack(fullHpAttacker, fullHpTarget, fullHpAttacker.atk, fullHpEvents);
      totalFullHp += Math.max(0, fullHpTarget.maxHp - fullHpTarget.hp);
    }
    expect(totalLowHp).toBeGreaterThan(totalFullHp);
  });
});

describe("game.ts: ヨロイオイテケの反射ダメージ(counterDamageRatio、plan/companion-evolution-expansion.md)", () => {
  it("被弾するたび、受けたダメージの一部を攻撃者に返す", () => {
    const game = new Game({ seed: 1 });
    const attack = attackFn(game);
    const attacker = monster(100, "gajiri", { def: 0 });
    const target = ally(200, "yoroioiteke");
    const attackerHpBefore = attacker.hp;
    const events: GameEvent[] = [];
    attack(attacker, target, attacker.atk, events);
    expect(attacker.hp).toBeLessThan(attackerHpBefore);
    expect(events.some((e) => e.type === "message" && e.text.includes("ダメージを返した"))).toBe(true);
  });
});

describe("game.ts: こだまぎつねの反響攻撃(echoAttackChance、plan/companion-evolution-expansion.md)", () => {
  it("確率で追加の1撃を同じ相手に放つ(最大2回まで)", () => {
    let echoed = 0;
    const trials = 300;
    for (let seed = 1; seed <= trials; seed++) {
      const game = new Game({ seed });
      const attack = attackFn(game);
      const attacker = ally(100, "kodamagitsune");
      const target = monster(300, "gajiri", { hp: 9999, maxHp: 9999, def: 0 });
      const events: GameEvent[] = [];
      attack(attacker, target, attacker.atk, events);
      const echoCount = events.filter((e) => e.type === "message" && e.text.includes("こだました")).length;
      if (echoCount > 0) echoed++;
      expect(echoCount).toBeLessThanOrEqual(2);
    }
    const rate = echoed / trials;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.6);
  });
});

describe("items/effects.ts: まつりのぬしの状態異常無効(statusImmune、plan/companion-evolution-expansion.md)", () => {
  it("あらゆる状態異常を受け付けない", () => {
    const game = new Game({ seed: 1 });
    const target = ally(200, "matsurinonushi");
    const ctx = (game as unknown as { effectContext: (events: GameEvent[]) => EffectContext }).effectContext.bind(
      game,
    );
    const events: GameEvent[] = [];
    addStatus(ctx(events), target, "sleep", 5, "眠ってしまった");
    expect(target.statuses).toHaveLength(0);
    expect(events.some((e) => e.type === "message" && e.text.includes("には効かなかった"))).toBe(true);
  });
});
