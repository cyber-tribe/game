import { describe, expect, it } from "vitest";
import { REGION_DUNGEON_IDS } from "../src/entities/dungeons";
import { Game } from "../src/application/dungeonRun/game";

const region6 = REGION_DUNGEON_IDS[5]!;
const region8 = REGION_DUNGEON_IDS[7]!;

/** 第八地方ダンジョンの各地方ギミックが、他地方由来でも出現しうるかを確かめる */
function findMosaicOccurrence(check: (game: Game) => boolean, seeds = 60): boolean {
  for (let seed = 1; seed <= seeds; seed++) {
    const game = new Game({ seed, dungeonId: region8, startDepth: 1 });
    if (check(game)) return true;
  }
  return false;
}

describe("game.ts: 第八地方(めざめの前庭)ダンジョンは他地方のギミックが1〜2種類混ざる", () => {
  it("深みタイル(第二地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence((g) => g.floor.tiles.some((t) => t.quagmire))).toBe(true);
  });

  it("胞子部屋(第三地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence((g) => g.floor.rooms.some((r) => r.spored))).toBe(true);
  });

  it("奔流タイル(第五地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence((g) => g.floor.tiles.some((t) => t.torrent !== undefined))).toBe(true);
  });

  it("偽の階段(第七地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence((g) => (g.floor.decoyStairsPositions?.length ?? 0) > 0)).toBe(true);
  });

  it("すべてのギミックが同時に乗ることはない(1〜2種類に絞られる)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed, dungeonId: region8, startDepth: 1 });
      const kinds = [
        game.floor.tiles.some((t) => t.quagmire),
        game.floor.rooms.some((r) => r.spored),
        game.floor.tiles.some((t) => t.torrent !== undefined),
        (game.floor.decoyStairsPositions?.length ?? 0) > 0 || game.floor.barrels.some((b) => b.decoy),
      ].filter(Boolean).length;
      expect(kinds, `seed=${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it("他の地方(第六地方など)には第八地方のモザイクは影響しない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed, dungeonId: region6, startDepth: 1 });
      // 深みタイル(第二地方)・偽の階段(第七地方)は第六地方には出ない
      expect(game.floor.tiles.some((t) => t.quagmire)).toBe(false);
      expect(game.floor.decoyStairsPositions ?? []).toHaveLength(0);
    }
  });
});
