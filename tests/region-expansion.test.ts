import { describe, expect, it } from "vitest";
import {
  NIGHTLY_DREAM_ID,
  REGION_CHECKPOINT_FLOOR,
  REGION_DUNGEON_IDS,
  REGION_SIZE,
  TOTAL_REGION_FLOORS,
  dungeonById,
} from "../src/entities/dungeons";
import { speciesForDepth } from "../src/entities/species";
import { Game } from "../src/game";

const region1 = REGION_DUNGEON_IDS[0];

/**
 * 地方ごとの独立ダンジョン(plan/game/dungeon-per-region.md)。表の寝穴の
 * 8地方・全48階を、地方ごとに入口の異なる8つのダンジョン(各6階)へ分割し、
 * めざめの階段(チェックポイント)を各ダンジョンの中間階だけに絞る。
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

describe("entities/dungeons.ts: 地方ごとの独立ダンジョンが8地方・各6階になる", () => {
  it("TOTAL_REGION_FLOORSは48(地方1〜8の合計階数)", () => {
    expect(TOTAL_REGION_FLOORS).toBe(48);
  });

  it("REGION_SIZEは6(1地方=6階)で、TOTAL_REGION_FLOORSはその倍数", () => {
    expect(REGION_SIZE).toBe(6);
    expect(TOTAL_REGION_FLOORS % REGION_SIZE).toBe(0);
  });

  it("地方ダンジョンが8件、いずれもmaxDepth=REGION_SIZE", () => {
    expect(REGION_DUNGEON_IDS).toHaveLength(8);
    for (const id of REGION_DUNGEON_IDS) {
      expect(dungeonById(id).maxDepth).toBe(REGION_SIZE);
    }
  });

  it("省略時のGame.maxDepthは第一地方のREGION_SIZEになる", () => {
    const game = new Game({ seed: 1 });
    expect(game.maxDepth).toBe(REGION_SIZE);
    expect(game.dungeonId).toBe(region1);
  });
});

describe("entities/species.ts: monster-compendium.mdの地方別モンスターが到達可能な階数に収まる", () => {
  it("第八地方(43〜48階)の種族が、48階の出現テーブルに乗る(以前はmaxDepth=10で到達不能だった)", () => {
    const found = speciesForDepth(48).some((s) => s.minFloor === 43);
    expect(found).toBe(true);
  });
});

describe("game.ts: 地方ダンジョンのめざめの階段は各ダンジョンの中間階だけになる", () => {
  it.each(REGION_DUNGEON_IDS)("%sのREGION_CHECKPOINT_FLOOR階ではcheckpointイベントが出る", (dungeonId) => {
    const game = new Game({ seed: 5, dungeonId, startDepth: REGION_CHECKPOINT_FLOOR });
    const events = stepOntoStairs(game);
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeDefined();
  });

  it.each([1, 2].filter((d) => d !== REGION_CHECKPOINT_FLOOR))(
    "第一地方の%i階(中間階でない)ではcheckpointイベントが出ない",
    (depth) => {
      const game = new Game({ seed: 5, dungeonId: region1, startDepth: depth });
      const events = stepOntoStairs(game);
      const checkpoint = events.find((e) => e.type === "checkpoint");
      expect(checkpoint).toBeUndefined();
    },
  );

  it("近道屋の裏穴(地方の概念を持たないダンジョン)は、どの階でも従来どおりcheckpointイベントが出る", () => {
    const game = new Game({ seed: 5, dungeonId: "shortcutBackHole", startDepth: 3 });
    const events = stepOntoStairs(game);
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeDefined();
  });
});

describe("dungeon/generate.ts: 地形生成アルゴリズム自体は深さによらず共通", () => {
  it("深い階でもフロア生成が破綻しない(到達可能性を含む)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, dungeonId: NIGHTLY_DREAM_ID, startDepth: 48 });
      expect(game.floor.width).toBeGreaterThan(0);
      expect(game.floor.stairs).toBeDefined();
    }
  });
});
