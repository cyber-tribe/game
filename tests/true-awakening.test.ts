import { describe, expect, it } from "vitest";
import type { Actor, MonsterActor } from "../src/core/types";
import type { GameEvent } from "../src/core/events";
import { DUNGEONS, TRUE_AWAKENING_ID, dungeonById } from "../src/entities/dungeons";
import { HAJIME_NO_YUME_ID, REGION_BOSS_ORDER, SPECIES, speciesById } from "../src/entities/species";
import { Game } from "../src/application/dungeonRun/game";
import { ACHIEVEMENTS, achievementDef } from "../src/entities/achievements";
import { checkAchievements, initialSave, isCompendiumComplete, isTrueAwakeningUnlocked, recordRun } from "../src/save";

describe("entities/dungeons.ts: 真の目覚め(plan/true-awakening.md)", () => {
  it("DUNGEONSに登録され、maxDepth=3・floorOffset=42", () => {
    const dungeon = dungeonById(TRUE_AWAKENING_ID);
    expect(dungeon.maxDepth).toBe(3);
    expect(dungeon.floorOffset).toBe(42);
    expect(DUNGEONS.some((d) => d.id === TRUE_AWAKENING_ID)).toBe(true);
  });
});

describe("entities/species.ts: はじめの夢", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById(HAJIME_NO_YUME_ID);
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossは立てない(REGION_BOSS_ORDER・defeatedRegionBossesの対象外)", () => {
    const species = speciesById(HAJIME_NO_YUME_ID);
    expect(species.isRegionBoss).toBeFalsy();
    expect(REGION_BOSS_ORDER).not.toContain(HAJIME_NO_YUME_ID);
  });
});

describe("game.ts: 真の目覚めの最終フロア(3階)には「はじめの夢」が1体だけ配置される", () => {
  it("通常の野生モンスターは湧かない", () => {
    const game = new Game({ seed: 1, dungeonId: TRUE_AWAKENING_ID, startDepth: 3, maxDepth: 3 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe(HAJIME_NO_YUME_ID);
  });

  it("最終フロアより手前では出現しない", () => {
    const game = new Game({ seed: 1, dungeonId: TRUE_AWAKENING_ID, startDepth: 1, maxDepth: 3 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters.every((m) => m.speciesId !== HAJIME_NO_YUME_ID)).toBe(true);
  });
});

function callDamageActor(game: Game, target: Actor, damage: number, events: GameEvent[] = []): GameEvent[] {
  (
    game as unknown as {
      damageActor: (target: Actor, damage: number, critical: boolean, events: GameEvent[]) => void;
    }
  ).damageActor.bind(game)(target, damage, false, events);
  return events;
}

describe("game.ts: 「はじめの夢」のHPが0になると、通常のkillActorではなく専用の締めくくりに分岐する", () => {
  it("trueAwakeningClearedイベントが出て、statusがclearedになる。討伐メッセージ・経験値は出さない", () => {
    const game = new Game({ seed: 1, dungeonId: TRUE_AWAKENING_ID, startDepth: 3, maxDepth: 3 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === HAJIME_NO_YUME_ID,
    )!;

    const events = callDamageActor(game, boss, boss.hp);

    expect(events.some((e) => e.type === "trueAwakeningCleared")).toBe(true);
    expect(game.status).toBe("cleared");
    expect(events.some((e) => e.type === "message" && e.text.includes("はじめの夢「"))).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text.includes("をたおした!"))).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text.includes("経験値を"))).toBe(false);
  });

  it("仲間を連れていない場合はソロ用の一言になる", () => {
    const game = new Game({ seed: 1, dungeonId: TRUE_AWAKENING_ID, startDepth: 3, maxDepth: 3 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === HAJIME_NO_YUME_ID,
    )!;
    expect(game.allies).toHaveLength(0);

    const events = callDamageActor(game, boss, boss.hp);
    expect(events.some((e) => e.type === "message" && e.text.includes("独りで来たけど"))).toBe(true);
  });

  it("絆(なじみ)が最も深い仲間の段階に応じた一言になる", () => {
    const game = new Game({ seed: 1, dungeonId: TRUE_AWAKENING_ID, startDepth: 3, maxDepth: 3 });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === HAJIME_NO_YUME_ID,
    )!;
    (game.allies as Actor[]).push({
      id: 500,
      kind: "ally",
      name: "なかま",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 0,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      bondSuccessCount: 30,
    });

    const events = callDamageActor(game, boss, boss.hp);
    expect(events.some((e) => e.type === "message" && e.text.includes("かけがえのない仲間"))).toBe(true);
  });
});

describe("save.ts: isCompendiumComplete/isTrueAwakeningUnlocked(plan/true-awakening.md)", () => {
  it("isCompendiumCompleteはhajimeNoYumeを判定対象から除く(循環を避ける)", () => {
    const save = initialSave();
    const compendium: Record<string, "captured"> = {};
    for (const s of SPECIES) {
      if (s.id === HAJIME_NO_YUME_ID) continue;
      compendium[s.id] = "captured";
    }
    expect(isCompendiumComplete({ ...save, compendium })).toBe(true);
  });

  it("3条件のいずれか欠けていると未解放", () => {
    const save = initialSave();
    expect(isTrueAwakeningUnlocked(save)).toBe(false);
    expect(
      isTrueAwakeningUnlocked({ ...save, defeatedRegionBosses: [...REGION_BOSS_ORDER] }),
    ).toBe(false);
  });

  it("図鑑コンプリート・全地方ボス撃破・実績数の3条件がそろうと解放", () => {
    const compendium: Record<string, "captured"> = {};
    for (const s of SPECIES) {
      if (s.id === HAJIME_NO_YUME_ID) continue;
      compendium[s.id] = "captured";
    }
    const achievements: Record<string, string> = {};
    for (const a of ACHIEVEMENTS.slice(0, 10)) {
      achievements[a.id] = "2026-01-01T00:00:00.000Z";
    }
    const save = {
      ...initialSave(),
      compendium,
      defeatedRegionBosses: [...REGION_BOSS_ORDER],
      achievements,
    };
    expect(isTrueAwakeningUnlocked(save)).toBe(true);
  });
});

describe("save.ts: recordRunはtrueAwakeningClearedを一度trueになったら戻さない", () => {
  it("OR方式でマージされる", () => {
    const save1 = recordRun(initialSave(), {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      trueAwakeningCleared: true,
    });
    expect(save1.trueAwakeningCleared).toBe(true);

    const save2 = recordRun(save1, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      trueAwakeningCleared: false,
    });
    expect(save2.trueAwakeningCleared).toBe(true);
  });
});

describe("entities/achievements.ts + save.ts: trueAwakening実績", () => {
  it("実績カタログに登録されている", () => {
    expect(achievementDef("trueAwakening")).toBeDefined();
  });

  it("SaveData.trueAwakeningClearedがtrueならcheckAchievementsで解放される", () => {
    const save = { ...initialSave(), trueAwakeningCleared: true };
    const next = checkAchievements(save);
    expect(next.achievements.trueAwakening).toBeDefined();
  });

  it("falseのままなら解放されない", () => {
    const save = initialSave();
    const next = checkAchievements(save);
    expect(next.achievements.trueAwakening).toBeUndefined();
  });
});
