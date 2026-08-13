import { describe, expect, it } from "vitest";
import { DUNGEONS, TARUKURABE_ID, dungeonById } from "../src/entities/dungeons";
import { isTarukurabeDay } from "../src/entities/festivals";
import { ACHIEVEMENTS, achievementDef } from "../src/entities/achievements";
import { Game, TARUKURABE_PERFECT_SCORE } from "../src/game";
import { initialSave, recordTarukurabeResult } from "../src/save";

describe("entities/festivals.ts: isTarukurabeDay(plan/tarukurabe-minigame.md)", () => {
  it("日曜日ならtrue", () => {
    // 2026-08-16は日曜日
    expect(isTarukurabeDay("2026-08-16")).toBe(true);
  });

  it("日曜日以外はfalse", () => {
    expect(isTarukurabeDay("2026-08-17")).toBe(false); // 月曜
    expect(isTarukurabeDay("2026-08-13")).toBe(false); // 木曜
  });
});

describe("entities/dungeons.ts: 樽比べ(plan/tarukurabe-minigame.md)", () => {
  it("DUNGEONSに登録され、maxDepth=1・unlock=always", () => {
    const dungeon = dungeonById(TARUKURABE_ID);
    expect(dungeon.maxDepth).toBe(1);
    expect(dungeon.unlock).toBe("always");
    expect(DUNGEONS.some((d) => d.id === TARUKURABE_ID)).toBe(true);
  });
});

function newTarukurabeGame(seed = 1): Game {
  return new Game({ seed, dungeonId: TARUKURABE_ID });
}

describe("game.ts: 樽比べ専用フロア", () => {
  it("的が3つ、近1点・中2点・遠3点で配置される。野生モンスターはいない", () => {
    const game = newTarukurabeGame();
    const targets = game.floor.actors.filter((a) => a.kind === "target");
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.tarukurabePoints).sort()).toEqual([1, 2, 3]);
    expect(game.floor.actors.some((a) => a.kind === "monster")).toBe(false);
  });

  it("開始時にタルが10個、投擲台(プレイヤーの足元)に1個供給されている", () => {
    const game = newTarukurabeGame();
    expect(game.tarukurabeBarrelsLeft).toBe(10);
    expect(game.tarukurabeScore).toBe(0);
    expect(game.floor.barrels).toHaveLength(1);
    expect(game.floor.barrels[0]!.pos).toEqual(game.player.pos);
  });

  it("moveコマンドは無効(投擲台から動けない)。ターンも消費しない", () => {
    const game = newTarukurabeGame();
    const before = { ...game.player.pos };
    const barrelsBefore = game.tarukurabeBarrelsLeft;
    const events = game.command({ type: "move", dir: 2 });
    expect(game.player.pos).toEqual(before);
    expect(game.tarukurabeBarrelsLeft).toBe(barrelsBefore);
    expect(events.some((e) => e.type === "message")).toBe(true);
  });

  it("faceコマンドは通常どおり使える(狙いを変える手段)", () => {
    const game = newTarukurabeGame();
    game.command({ type: "face", dir: 2 });
    expect(game.player.facing).toBe(2);
  });

  function lift(game: Game): void {
    const events = game.command({ type: "liftBarrel" });
    expect(events.some((e) => e.type === "liftBarrel")).toBe(true);
  }

  it("北向き(既定)に投げると近の的(1点)に命中する", () => {
    const game = newTarukurabeGame();
    lift(game);
    const events = game.command({ type: "throwBarrel" });
    expect(game.tarukurabeScore).toBe(1);
    expect(game.tarukurabeBarrelsLeft).toBe(9);
    expect(events.some((e) => e.type === "message" && e.text.includes("命中"))).toBe(true);
    // 次の1個が投擲台に補充される
    expect(game.floor.barrels).toHaveLength(1);
  });

  it("東向きに投げると中の的(2点)、南向きに投げると遠の的(3点)に命中する", () => {
    const game = newTarukurabeGame();
    game.command({ type: "face", dir: 2 });
    lift(game);
    game.command({ type: "throwBarrel" });
    expect(game.tarukurabeScore).toBe(2);

    game.command({ type: "face", dir: 4 });
    lift(game);
    game.command({ type: "throwBarrel" });
    expect(game.tarukurabeScore).toBe(5);
  });

  it("全ての的(近中遠)に命中させると、タルを余していても専用モードが終了する", () => {
    const game = newTarukurabeGame();
    for (const dir of [0, 2, 4] as const) {
      game.command({ type: "face", dir });
      lift(game);
      game.command({ type: "throwBarrel" });
    }
    expect(game.tarukurabeScore).toBe(TARUKURABE_PERFECT_SCORE);
    expect(game.status).toBe("cleared");
    expect(game.tarukurabeBarrelsLeft).toBe(7);
  });

  it("タルを使い切ると(全て外しても)専用モードが終了する", () => {
    const game = newTarukurabeGame();
    // 西(dir 6)には的がいないので、10回すべて外れる
    game.command({ type: "face", dir: 6 });
    let lastEvents: ReturnType<Game["command"]> = [];
    for (let i = 0; i < 10; i++) {
      lift(game);
      lastEvents = game.command({ type: "throwBarrel" });
    }
    expect(game.tarukurabeScore).toBe(0);
    expect(game.tarukurabeBarrelsLeft).toBe(0);
    expect(game.status).toBe("cleared");
    expect(lastEvents.some((e) => e.type === "gameOver")).toBe(true);
    expect(lastEvents.some((e) => e.type === "tarukurabeFinished" && e.score === 0)).toBe(true);
  });

  it("終了後はタルが補充されない", () => {
    const game = newTarukurabeGame();
    for (const dir of [0, 2, 4] as const) {
      game.command({ type: "face", dir });
      lift(game);
      game.command({ type: "throwBarrel" });
    }
    expect(game.status).toBe("cleared");
    expect(game.floor.barrels).toHaveLength(0);
  });
});

describe("save.ts: recordTarukurabeResult(plan/tarukurabe-minigame.md)", () => {
  it("自己ベストを更新する(下回った場合は更新しない)", () => {
    const save = initialSave();
    const afterFirst = recordTarukurabeResult(save, 3);
    expect(afterFirst.tarukurabeBestScore).toBe(3);
    const afterLower = recordTarukurabeResult(afterFirst, 1);
    expect(afterLower.tarukurabeBestScore).toBe(3);
    const afterHigher = recordTarukurabeResult(afterLower, 5);
    expect(afterHigher.tarukurabeBestScore).toBe(5);
  });

  it("0〜2点は無報酬、3〜4点は下位、5点は中位、満点は上位の報酬が倉庫に積まれる", () => {
    const save = initialSave();
    const baseline = save.storage.length;
    expect(recordTarukurabeResult(save, 2).storage.length).toBe(baseline);
    expect(recordTarukurabeResult(save, 3).storage.length).toBeGreaterThan(baseline);
    const mid = recordTarukurabeResult(save, 5).storage;
    const perfect = recordTarukurabeResult(save, TARUKURABE_PERFECT_SCORE).storage;
    expect(perfect.length).toBeGreaterThan(mid.length);
  });

  it("満点(6点)を達成すると実績tarukurabePerfectが解放される", () => {
    const save = initialSave();
    expect(save.achievements.tarukurabePerfect).toBeUndefined();
    const next = recordTarukurabeResult(save, TARUKURABE_PERFECT_SCORE);
    expect(next.achievements.tarukurabePerfect).toBeDefined();
  });

  it("満点未満では実績が解放されない", () => {
    const save = initialSave();
    const next = recordTarukurabeResult(save, TARUKURABE_PERFECT_SCORE - 1);
    expect(next.achievements.tarukurabePerfect).toBeUndefined();
  });
});

describe("entities/achievements.ts: tarukurabePerfect", () => {
  it("一覧に含まれる", () => {
    expect(ACHIEVEMENTS.some((a) => a.id === "tarukurabePerfect")).toBe(true);
    expect(achievementDef("tarukurabePerfect")).toBeDefined();
  });
});
