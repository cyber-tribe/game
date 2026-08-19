import { describe, expect, it } from "vitest";
import { Game } from "../src/game";

/**
 * 草は葉っぱを食べている(plan/game/herb-satiety-bonus.md)。
 * 草系アイテムを「使う」と本来の効果に加えて満腹度が+5。投げ当ては
 * 対象外で、満タン時は100を超えず追加の文言も出さない。
 */

describe("game.ts: 草の満腹度ボーナス(plan/game/herb-satiety-bonus.md)", () => {
  it("いやしの葉を使うとHP回復に加えて満腹度が5回復する", () => {
    const game = new Game({ seed: 31 });
    game.player.hp = 5;
    game.player.satiety = 50;
    const item = game.giveItem("healLeaf")!;
    const events = game.command({ type: "use", uid: item.uid });
    expect(game.player.hp).toBeGreaterThan(5);
    // 使ったターンにも満腹度の自然減少(0.2)が乗るので、54.8前後になる
    expect(game.player.satiety).toBeGreaterThanOrEqual(54.5);
    expect(
      events.some((e) => e.type === "message" && e.text.includes("おなかが満たされた")),
    ).toBe(true);
  });

  it("満腹度100のときに使っても100を超えず、満腹度の文言も出ない", () => {
    const game = new Game({ seed: 31 });
    game.player.hp = 5;
    game.player.satiety = 100;
    const item = game.giveItem("healLeaf")!;
    const events = game.command({ type: "use", uid: item.uid });
    // ボーナスでは100を超えず、そのターンの自然減少(0.2)だけが引かれる
    expect(game.player.satiety).toBeLessThanOrEqual(100);
    expect(game.player.satiety).toBeGreaterThanOrEqual(99.5);
    expect(
      events.some((e) => e.type === "message" && e.text.includes("おなかが満たされた")),
    ).toBe(false);
  });

  it("草を投げても満腹度は回復しない", () => {
    const game = new Game({ seed: 31 });
    game.player.satiety = 50;
    const item = game.giveItem("healLeaf")!;
    const satietyBefore = game.player.satiety;
    game.command({ type: "throw", uid: item.uid });
    // 投げた直後の満腹度は、ターン経過の減少ぶんを除いて増えていない
    expect(game.player.satiety).toBeLessThanOrEqual(satietyBefore);
  });

  it("草でないアイテム(パン以外の道具等)には満腹度ボーナスが付かない", () => {
    const game = new Game({ seed: 31 });
    game.player.satiety = 50;
    const item = game.giveItem("mapScroll")!;
    game.command({ type: "use", uid: item.uid });
    expect(game.player.satiety).toBeLessThanOrEqual(50);
  });
});
