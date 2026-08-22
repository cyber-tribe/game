import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { MonsterActor } from "../src/core/types";
import { rollBossTreasure } from "../src/entities/bossTreasure";
import { itemDef } from "../src/entities/itemCatalog";
import { Game } from "../src/application/dungeonRun/game";
import { access } from "./helpers/access";

describe("entities/bossTreasure.ts: ぬしの置き土産", () => {
  it("初回踏破では、高強化値の武器/盾・印つき装備・レア素材の束のいずれかを返す", () => {
    const seen = { plusEquip: false, markedEquip: false, materialBundle: false };
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      let uid = 0;
      const items = rollBossTreasure(rng, () => ++uid, 6, true);
      expect(items.length).toBeGreaterThan(0);
      const first = items[0]!;
      if (first.plus !== undefined && first.plus >= 3) seen.plusEquip = true;
      else if (first.markIds !== undefined) seen.markedEquip = true;
      else seen.materialBundle = true;
    }
    expect(seen.plusEquip).toBe(true);
    expect(seen.markedEquip).toBe(true);
    expect(seen.materialBundle).toBe(true);
  });

  it("2回目以降の踏破では、常にレア素材の束(軽め)だけになる", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new Rng(seed);
      let uid = 0;
      const items = rollBossTreasure(rng, () => ++uid, 6, false);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.plus).toBeUndefined();
        expect(item.markIds).toBeUndefined();
        expect(itemDef(item.defId).category).toBe("material");
      }
      // 初回踏破の「多め」バンドルより小さい(hokoraDust最大1個+印刻印石0〜1個)
      expect(items.length).toBeLessThanOrEqual(2);
    }
  });

  it("高強化値の武器/盾を引いたときは+3〜+5になる", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const rng = new Rng(seed);
      let uid = 0;
      const items = rollBossTreasure(rng, () => ++uid, 6, true);
      const item = items[0]!;
      if (item.plus === undefined) continue;
      found = true;
      expect(item.plus).toBeGreaterThanOrEqual(3);
      expect(item.plus).toBeLessThanOrEqual(5);
      expect(["weapon", "shield"]).toContain(itemDef(item.defId).category);
    }
    expect(found).toBe(true);
  });

  it("印つき装備を引いたときは、印の対象スロットと同じ種類の装備になる", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const rng = new Rng(seed);
      let uid = 0;
      const items = rollBossTreasure(rng, () => ++uid, 6, true);
      const item = items[0]!;
      if (!item.markIds || item.markIds.length === 0) continue;
      found = true;
      const category = itemDef(item.defId).category;
      // purun/honegarami は盾用、それ以外は武器用(entities/forging.tsのMARKS参照)
      const shieldMarks = new Set(["purun", "honegarami"]);
      const expectedCategory = shieldMarks.has(item.markIds[0]!) ? "shield" : "weapon";
      expect(category).toBe(expectedCategory);
    }
    expect(found).toBe(true);
  });
});

describe("game.ts: 地方ボスの階 - ぬしの置き土産(plan/game/dungeon-boss-rooms.md)", () => {
  function boss(game: Game): MonsterActor {
    return game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oonebosuke",
    )!;
  }

  it("初回踏破の撃破で、確定ドロップとは別に置き土産が落ちる", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const target = boss(game);
    const killActor = access(game).killActor.bind(game);
    const eventList: { type: string; text?: string }[] = [];
    killActor(target, eventList);

    const droppedAtBoss = game.floor.items.filter(
      (gi) => gi.pos.x === target.pos.x && gi.pos.y === target.pos.y,
    );
    // 確定ドロップ(おおねぼすけの眠り粉)+置き土産が両方とも同じマスに落ちる
    expect(droppedAtBoss.some((gi) => gi.item.defId === "oonebosukeDust")).toBe(true);
    expect(droppedAtBoss.length).toBeGreaterThan(1);
    expect(eventList.some((e) => e.type === "message" && e.text?.includes("置き土産"))).toBe(true);
  });

  it("既に撃破済みの地方ボス(defeatedRegionBossIds)なら、置き土産が軽くなる", () => {
    const game = new Game({
      seed: 1,
      startDepth: 6,
      maxDepth: 10,
      defeatedRegionBossIds: ["oonebosuke"],
    });
    const target = boss(game);
    const killActor = access(game).killActor.bind(game);
    killActor(target, []);

    const droppedAtBoss = game.floor.items.filter(
      (gi) => gi.pos.x === target.pos.x && gi.pos.y === target.pos.y,
    );
    const treasureItems = droppedAtBoss.filter((gi) => gi.item.defId !== "oonebosukeDust");
    for (const gi of treasureItems) {
      expect(gi.item.plus).toBeUndefined();
      expect(gi.item.markIds).toBeUndefined();
    }
  });
});
