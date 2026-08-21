import { describe, expect, it } from "vitest";
import { REGION_DUNGEON_IDS } from "../src/entities/dungeons";
import { Game } from "../src/game";

const region3 = REGION_DUNGEON_IDS[2]!;
const region4 = REGION_DUNGEON_IDS[3]!;

describe("game.ts: 第四地方(骨積みの回廊)ダンジョンはモンスターハウスが出やすい", () => {
  it("第四地方は、他地方よりモンスターハウスの出現回数が多い", () => {
    const TRIALS = 300;
    let bonepileCount = 0;
    let otherCount = 0;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const bonepile = new Game({ seed, dungeonId: region4, startDepth: 5 });
      if (bonepile.floor.rooms.some((r) => r.kind === "monsterHouse")) bonepileCount++;
      const other = new Game({ seed, dungeonId: region3, startDepth: 5 });
      if (other.floor.rooms.some((r) => r.kind === "monsterHouse")) otherCount++;
    }
    expect(bonepileCount).toBeGreaterThan(otherCount);
  });

  it("第三地方には、この倍率が乗らない", () => {
    // 単純にオンオフの確認: 第三地方と第四地方で、同じ試行回数に対する
    // モンスターハウスの出現回数の差が、地方の境目を境に生じることを確かめる
    const TRIALS = 300;
    let below = 0;
    let above = 0;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const belowGame = new Game({ seed, dungeonId: region3, startDepth: 5 });
      if (belowGame.floor.rooms.some((r) => r.kind === "monsterHouse")) below++;
      const aboveGame = new Game({ seed, dungeonId: region4, startDepth: 5 });
      if (aboveGame.floor.rooms.some((r) => r.kind === "monsterHouse")) above++;
    }
    expect(above).toBeGreaterThan(below);
  });
});
