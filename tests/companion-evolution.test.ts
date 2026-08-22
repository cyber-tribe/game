import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import type { GameEvent } from "../src/core/events";
import type { OncePerRunTracker } from "../src/core/oncePerRunTracker";
import { EVOLUTION_RULES, MAX_RECENT_FUSION_MATERIALS, tryEvolve } from "../src/entities/evolution";
import { Game } from "../src/application/dungeonRun/game";
import { speciesById } from "../src/entities/species";
import { mitigateIncomingDamage as domainMitigateIncomingDamage } from "../src/domain/combat/damageModifier";
import { fuseMonsters, initialSave, type StoredMonster } from "../src/save";

function mitigate(game: Game, target: Actor, damage: number, events: unknown[]): number {
  const internals = game as unknown as { oncePerRun: OncePerRunTracker; partyGuardTurns: number };
  return domainMitigateIncomingDamage({
    target,
    damage,
    events: events as GameEvent[],
    rng: game.rng,
    runSkills: game.runSkills,
    player: game.player,
    oncePerRun: internals.oncePerRun,
    partyGuardTurns: internals.partyGuardTurns,
  });
}

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

describe("entities/evolution.ts: tryEvolve", () => {
  it("成熟レベル未満なら進化しない", () => {
    const m = stored({ speciesId: "gajiri", level: 9, recentFusionMaterials: ["honegarami", "honegarami", "honegarami"] });
    expect(tryEvolve(m)).toBe(m);
  });

  it("直近の夢あわせ履歴がlookbackFusions未満なら進化しない", () => {
    const m = stored({ speciesId: "gajiri", level: 10, recentFusionMaterials: ["honegarami", "honegarami"] });
    expect(tryEvolve(m)).toBe(m);
  });

  it("直近3回のうち過半数がホネガラミなら、ガジリねずみはいしずえねずみに進化する", () => {
    const m = stored({
      speciesId: "gajiri",
      level: 10,
      recentFusionMaterials: ["honegarami", "purun", "honegarami"],
    });
    const result = tryEvolve(m);
    expect(result.speciesId).toBe("ishizuenezumi");
  });

  it("過半数に届かなければ進化しない", () => {
    const m = stored({
      speciesId: "gajiri",
      level: 10,
      recentFusionMaterials: ["honegarami", "purun", "purun"],
    });
    expect(tryEvolve(m)).toBe(m);
  });

  it("ぷるん+ぷるんの繰り返しでとこしえのぷるんに進化する", () => {
    const m = stored({
      speciesId: "purun",
      level: 10,
      recentFusionMaterials: ["purun", "purun", "purun"],
    });
    expect(tryEvolve(m).speciesId).toBe("tokoshiepurun");
  });

  it("ぷるん+マドロミダケの繰り返しでゆめみるぷるんに進化する", () => {
    const m = stored({
      speciesId: "purun",
      level: 10,
      recentFusionMaterials: ["madoromi", "madoromi", "purun"],
    });
    expect(tryEvolve(m).speciesId).toBe("yumemirupurun");
  });

  it("対応するEvolutionRuleが無い種族はそのまま", () => {
    const m = stored({
      speciesId: "tsubute",
      level: 99,
      recentFusionMaterials: ["honegarami", "honegarami", "honegarami"],
    });
    expect(tryEvolve(m)).toBe(m);
  });
});

describe("save.ts: fuseMonstersと成熟の統合", () => {
  it("直近3回の夢あわせでホネガラミを糧に選び続けると、次の夢あわせで進化する", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", level: 20, recentFusionMaterials: ["honegarami", "honegarami"] }),
        stored({ uid: 2, speciesId: "honegarami", level: 1 }),
      ],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused).not.toBeNull();
    expect(fused!.result.speciesId).toBe("ishizuenezumi");
    expect(fused!.result.recentFusionMaterials).toEqual(["honegarami", "honegarami", "honegarami"]);
    expect(fused!.save.hut.find((m) => m.uid === 1)?.speciesId).toBe("ishizuenezumi");
  });

  it("進化すると図鑑に進化後の種族も「捕まえた」で登録される", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", level: 20, recentFusionMaterials: ["honegarami", "honegarami"] }),
        stored({ uid: 2, speciesId: "honegarami", level: 1 }),
      ],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused!.save.compendium.ishizuenezumi).toBe("captured");
  });

  it("recentFusionMaterialsはMAX_RECENT_FUSION_MATERIALS件を超えると古い方から捨てられる", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "tsubute", level: 1, recentFusionMaterials: ["a", "b", "c"] }),
        stored({ uid: 2, speciesId: "gajiri", level: 1 }),
      ],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused!.result.recentFusionMaterials).toHaveLength(MAX_RECENT_FUSION_MATERIALS);
    expect(fused!.result.recentFusionMaterials).toEqual(["b", "c", "gajiri"].slice(-MAX_RECENT_FUSION_MATERIALS));
  });

  it("進化条件を満たさない通常の夢あわせでは種族は変わらない", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [stored({ uid: 1, speciesId: "gajiri", level: 1 }), stored({ uid: 2, speciesId: "tsubute", level: 1 })],
    };
    const fused = fuseMonsters(save, 1, 2);
    expect(fused!.result.speciesId).toBe("gajiri");
  });
});

describe("evolution rules: 全ルールの整合性", () => {
  it("すべてのfromSpeciesId/toSpeciesIdが実在の種族である", () => {
    for (const rule of EVOLUTION_RULES) {
      expect(() => speciesById(rule.fromSpeciesId)).not.toThrow();
      expect(() => speciesById(rule.toSpeciesId)).not.toThrow();
    }
  });
});

describe("game.ts: 特技「ゆるがぬからだ」(steadfastBody)", () => {
  it("softBodyと違い、確率に関わらず必ず被弾ダメージを1割軽減する", () => {
    const game = new Game({ seed: 1 });
    const ally: Actor = {
      id: 500,
      kind: "ally",
      name: "とこしえのぷるん",
      speciesId: "tokoshiepurun",
      model: "purun",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 100,
      maxHp: 100,
      atk: 5,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      skills: ["steadfastBody"],
    };
    for (let i = 0; i < 10; i++) {
      const events: unknown[] = [];
      const finalDamage = mitigate(game, ally, 100, events);
      expect(finalDamage).toBe(90);
    }
  });
});
