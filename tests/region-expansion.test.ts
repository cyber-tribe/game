import { describe, expect, it } from "vitest";
import {
  MAIN_CAVE_ID,
  MAIN_CAVE_MAX_DEPTH,
  NIGHTLY_DREAM_ID,
  REGION_SIZE,
  dungeonById,
  isDungeonUnlocked,
} from "../src/entities/dungeons";
import { speciesForDepth } from "../src/entities/species";
import { Game } from "../src/game";

/**
 * 地方拡張(plan/region-expansion.md)。表の寝穴を8地方・全48階に広げ、
 * めざめの階段(チェックポイント)を地方境界(6階ごと)だけに絞る。
 */

/** 階段に隣接する歩けるマスから1歩だけ踏み出し、そのイベント列を返す */
function stepOntoStairs(game: Game): ReturnType<Game["command"]> {
  const candidates: Array<{ from: { x: number; y: number }; dir: 0 | 2 | 4 | 6 }> = [
    { from: { x: game.floor.stairs.x, y: game.floor.stairs.y - 1 }, dir: 4 },
    { from: { x: game.floor.stairs.x - 1, y: game.floor.stairs.y }, dir: 2 },
    { from: { x: game.floor.stairs.x, y: game.floor.stairs.y + 1 }, dir: 0 },
    { from: { x: game.floor.stairs.x + 1, y: game.floor.stairs.y }, dir: 6 },
  ];
  for (const { from, dir } of candidates) {
    if (from.x < 0 || from.y < 0 || from.x >= game.floor.width || from.y >= game.floor.height) {
      continue;
    }
    const tile = game.floor.tiles[from.y * game.floor.width + from.x];
    if (!tile || tile.kind === 0) continue;
    game.player.pos = from;
    return game.command({ type: "move", dir });
  }
  throw new Error("階段に隣接する歩けるマスが見つからなかった");
}

describe("entities/dungeons.ts: 表の寝穴が8地方・全48階になる", () => {
  it("MAIN_CAVE_MAX_DEPTHは48", () => {
    expect(MAIN_CAVE_MAX_DEPTH).toBe(48);
  });

  it("REGION_SIZEは6(1地方=6階)で、MAIN_CAVE_MAX_DEPTHはその倍数", () => {
    expect(REGION_SIZE).toBe(6);
    expect(MAIN_CAVE_MAX_DEPTH % REGION_SIZE).toBe(0);
  });

  it("省略時のGame.maxDepthは48になる", () => {
    const game = new Game({ seed: 1 });
    expect(game.maxDepth).toBe(48);
    expect(game.dungeonId).toBe(MAIN_CAVE_ID);
  });

  it("夜ごとの夢の解放条件は、表の寝穴の完全踏破(48階)に引き上がる", () => {
    const nightly = dungeonById(NIGHTLY_DREAM_ID);
    expect(isDungeonUnlocked(nightly, 47, 1)).toBe(false);
    expect(isDungeonUnlocked(nightly, 48, 1)).toBe(true);
  });
});

describe("entities/species.ts: monster-compendium.mdの地方別モンスターが到達可能な階数に収まる", () => {
  it("第八地方(43〜48階)の種族が、48階の出現テーブルに乗る(以前はmaxDepth=10で到達不能だった)", () => {
    const found = speciesForDepth(48).some((s) => s.minFloor === 43);
    expect(found).toBe(true);
  });
});

describe("game.ts: 表の寝穴のめざめの階段は地方境界(6の倍数)だけになる", () => {
  it.each([6, 12, 18, 24, 30, 36, 42, 48])("%i階(地方境界)ではcheckpointイベントが出る", (depth) => {
    const game = new Game({ seed: 5, startDepth: depth });
    const events = stepOntoStairs(game);
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeDefined();
  });

  it.each([1, 3, 7, 13, 19, 25, 31, 37, 43])("%i階(地方境界でない)ではcheckpointイベントが出ない", (depth) => {
    const game = new Game({ seed: 5, startDepth: depth });
    const events = stepOntoStairs(game);
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeUndefined();
  });

  it("近道屋の裏穴(地方の概念を持たないダンジョン)は、どの階でも従来どおりcheckpointイベントが出る", () => {
    const game = new Game({ seed: 5, dungeonId: "shortcutBackHole", startDepth: 3 });
    const events = stepOntoStairs(game);
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeDefined();
  });
});

describe("dungeon/generate.ts: 地形生成アルゴリズム自体は深さによらず共通", () => {
  it("48階でもフロア生成が破綻しない(到達可能性を含む)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, startDepth: 48 });
      expect(game.floor.width).toBeGreaterThan(0);
      expect(game.floor.stairs).toBeDefined();
    }
  });
});
