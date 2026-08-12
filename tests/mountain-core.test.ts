import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import type { GameEvent } from "../src/core/events";
import { DUNGEONS, MOUNTAIN_CORE_ID, dungeonById, isDungeonUnlocked } from "../src/entities/dungeons";
import { Game } from "../src/game";
import { initialSave, recordRun } from "../src/save";

describe("entities/dungeons.ts: 山の芯(plan/mountain-core.md)", () => {
  it("撃破済み地方ボスに掘り杭の主が含まれないと未解放", () => {
    const mountainCore = dungeonById(MOUNTAIN_CORE_ID);
    expect(isDungeonUnlocked(mountainCore, 999, 999, 0, [])).toBe(false);
    expect(isDungeonUnlocked(mountainCore, 999, 999, 0, ["nushigaeru"])).toBe(false);
  });

  it("掘り杭の主を撃破済みなら解放", () => {
    const mountainCore = dungeonById(MOUNTAIN_CORE_ID);
    expect(isDungeonUnlocked(mountainCore, 0, 0, 0, ["horikuiNoNushi"])).toBe(true);
  });

  it("maxDepth=3、floorOffset=42で第八地方相当のテーブルを引く", () => {
    const mountainCore = dungeonById(MOUNTAIN_CORE_ID);
    expect(mountainCore.maxDepth).toBe(3);
    expect(mountainCore.floorOffset).toBe(42);
    expect(mountainCore.unlock).not.toBe("always");
    expect(mountainCore.unlock !== "always" && "afterBossDefeated" in mountainCore.unlock).toBe(true);
  });

  it("DUNGEONSに登録されている", () => {
    expect(DUNGEONS.some((d) => d.id === MOUNTAIN_CORE_ID)).toBe(true);
  });
});

function makeMountainCoreGame(): Game {
  return new Game({ seed: 1, dungeonId: MOUNTAIN_CORE_ID, startDepth: 1, maxDepth: 3 });
}

function callKillActor(game: Game, target: Actor, events: GameEvent[] = []): void {
  (game as unknown as { killActor: (target: Actor, events: GameEvent[]) => void }).killActor.bind(game)(
    target,
    events,
  );
}

describe("game.ts: killActorは地方ボス撃破をdefeatedRegionBossesThisRunに記録する", () => {
  it("isRegionBossの種族を倒すと記録される", () => {
    const game = makeMountainCoreGame();
    const boss: Actor = {
      id: 999,
      kind: "monster",
      name: "掘り杭の主",
      speciesId: "horikuiNoNushi",
      model: "horikuiNoNushi",
      pos: { x: 0, y: 0 },
      facing: 0,
      hp: 1,
      maxHp: 1,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
    };
    callKillActor(game, boss);
    expect(game.defeatedRegionBossesThisRun.has("horikuiNoNushi")).toBe(true);
  });

  it("通常の野生モンスターを倒しても記録されない", () => {
    const game = makeMountainCoreGame();
    const wild = game.floor.actors.find((a) => a.kind === "monster")!;
    callKillActor(game, wild);
    expect(game.defeatedRegionBossesThisRun.size).toBe(0);
  });
});

describe("game.ts: 山の芯の最終フロア(3階)で固定の会話イベントが発生する", () => {
  it("階段を降りると会話イベント+mountainCoreClearedイベントが出て、statusがclearedになる", () => {
    const game = new Game({ seed: 1, dungeonId: MOUNTAIN_CORE_ID, startDepth: 3, maxDepth: 3 });
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "descend" });

    expect(events.some((e) => e.type === "mountainCoreCleared")).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text.includes("マサカリのドンズル"))).toBe(true);
    expect(game.status).toBe("cleared");
  });

  it("区切って持ち帰る(bank)でも会話イベントが発生する", () => {
    const game = new Game({ seed: 1, dungeonId: MOUNTAIN_CORE_ID, startDepth: 3, maxDepth: 3 });
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "bank" });

    expect(events.some((e) => e.type === "mountainCoreCleared")).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text.includes("マサカリのドンズル"))).toBe(true);
    expect(game.status).toBe("cleared");
  });

  it("最終フロアより手前では会話イベントは発生しない", () => {
    const game = new Game({ seed: 1, dungeonId: MOUNTAIN_CORE_ID, startDepth: 1, maxDepth: 3 });
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "bank" });

    expect(events.some((e) => e.type === "mountainCoreCleared")).toBe(false);
    expect(game.status).toBe("cleared");
  });
});

describe("save.ts: recordRunは山の芯の記録をマージする(plan/mountain-core.md)", () => {
  it("defeatedRegionBossesは重複を除いて積み上がる", () => {
    const save1 = recordRun(initialSave(), {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      defeatedRegionBosses: ["horikuiNoNushi", "nushigaeru"],
    });
    expect(save1.defeatedRegionBosses.sort()).toEqual(["horikuiNoNushi", "nushigaeru"].sort());

    const save2 = recordRun(save1, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      defeatedRegionBosses: ["nushigaeru", "oonebosuke"],
    });
    expect(save2.defeatedRegionBosses.sort()).toEqual(["horikuiNoNushi", "nushigaeru", "oonebosuke"].sort());
  });

  it("mountainCoreCleared: trueでstoryClearedがtrueになり、以後falseに戻らない", () => {
    const save1 = recordRun(initialSave(), {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      mountainCoreCleared: true,
    });
    expect(save1.storyCleared).toBe(true);

    const save2 = recordRun(save1, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      mountainCoreCleared: false,
    });
    expect(save2.storyCleared).toBe(true);
  });

  it("全滅した場合でも地方ボス撃破の記録は失われない", () => {
    const save = recordRun(initialSave(), {
      depth: 1,
      level: 1,
      cleared: false,
      broughtBack: [],
      defeatedRegionBosses: ["horikuiNoNushi"],
    });
    expect(save.defeatedRegionBosses).toEqual(["horikuiNoNushi"]);
  });
});
