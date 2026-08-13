import { describe, expect, it } from "vitest";
import { createPlayer, expForLevel, gainExp } from "../src/entities/player";

describe("plan/game/levelup-full-heal.md: レベルアップ時のHP全回復", () => {
  it("HPが減っていても、レベルアップした瞬間に新しい最大HPまで全回復する", () => {
    const player = createPlayer(1);
    player.hp = 1;
    gainExp(player, expForLevel(2));
    expect(player.hp).toBe(player.maxHp);
  });

  it("複数レベル同時に上がっても、最終的な最大HPまで全回復する", () => {
    const player = createPlayer(1);
    player.hp = 1;
    const levels = gainExp(player, expForLevel(5));
    expect(levels).toBeGreaterThan(1);
    expect(player.hp).toBe(player.maxHp);
  });

  it("レベルが上がらなければHPは変化しない", () => {
    const player = createPlayer(1);
    player.hp = 1;
    gainExp(player, 1);
    expect(player.hp).toBe(1);
  });
});
