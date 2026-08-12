import { describe, expect, it } from "vitest";
import { Game } from "../src/game";

describe("game.ts: 表の寝穴の第四地方(19〜24階)はモンスターハウスが出やすい", () => {
  it("19〜24階は、同程度の深さの他地方よりモンスターハウスの出現回数が多い", () => {
    const TRIALS = 300;
    let bonepileCount = 0;
    let otherCount = 0;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const bonepile = new Game({ seed, startDepth: 20 });
      if (bonepile.floor.rooms.some((r) => r.kind === "monsterHouse")) bonepileCount++;
      const other = new Game({ seed, startDepth: 14 });
      if (other.floor.rooms.some((r) => r.kind === "monsterHouse")) otherCount++;
    }
    expect(bonepileCount).toBeGreaterThan(otherCount);
  });

  it("第三地方(13〜18階)には、この倍率が乗らない", () => {
    // 単純にオンオフの確認: 13〜18階と19〜24階で、同じ試行回数に対する
    // モンスターハウスの出現回数の差が、地方境界(18→19)を境に生じることを確かめる
    const TRIALS = 300;
    let below = 0;
    let above = 0;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const belowGame = new Game({ seed, startDepth: 18 });
      if (belowGame.floor.rooms.some((r) => r.kind === "monsterHouse")) below++;
      const aboveGame = new Game({ seed, startDepth: 19 });
      if (aboveGame.floor.rooms.some((r) => r.kind === "monsterHouse")) above++;
    }
    expect(above).toBeGreaterThan(below);
  });
});
