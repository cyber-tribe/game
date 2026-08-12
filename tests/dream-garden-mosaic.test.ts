import { describe, expect, it } from "vitest";
import { Game } from "../src/game";

/** 第八地方(43〜48階)の各地方ギミックが、規定のdepth範囲外でも出現しうるかを確かめる */
function findMosaicOccurrence(depth: number, check: (game: Game) => boolean, seeds = 60): boolean {
  for (let seed = 1; seed <= seeds; seed++) {
    const game = new Game({ seed, startDepth: depth });
    if (check(game)) return true;
  }
  return false;
}

describe("game.ts: 第八地方(43〜48階)は他地方のギミックが1〜2種類混ざる", () => {
  it("深みタイル(第二地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence(43, (g) => g.floor.tiles.some((t) => t.quagmire))).toBe(true);
  });

  it("胞子部屋(第三地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence(44, (g) => g.floor.rooms.some((r) => r.spored))).toBe(true);
  });

  it("奔流タイル(第五地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence(45, (g) => g.floor.tiles.some((t) => t.torrent !== undefined))).toBe(true);
  });

  it("偽の階段(第七地方のギミック)が現れることがある", () => {
    expect(findMosaicOccurrence(46, (g) => (g.floor.decoyStairsPositions?.length ?? 0) > 0)).toBe(true);
  });

  it("すべてのギミックが同時に乗ることはない(1〜2種類に絞られる)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed, startDepth: 47 });
      const kinds = [
        game.floor.tiles.some((t) => t.quagmire),
        game.floor.rooms.some((r) => r.spored),
        game.floor.tiles.some((t) => t.torrent !== undefined),
        (game.floor.decoyStairsPositions?.length ?? 0) > 0 || game.floor.barrels.some((b) => b.decoy),
      ].filter(Boolean).length;
      expect(kinds, `seed=${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it("他の地方(31〜36階など)には第八地方のモザイクは影響しない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed, startDepth: 33 });
      // 深みタイル(第二地方)・偽の階段(第七地方)は31〜36階には出ない
      expect(game.floor.tiles.some((t) => t.quagmire)).toBe(false);
      expect(game.floor.decoyStairsPositions ?? []).toHaveLength(0);
    }
  });
});
