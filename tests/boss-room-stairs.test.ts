import { describe, expect, it } from "vitest";
import { walkableAt } from "../src/core/types";
import type { MonsterActor } from "../src/core/types";
import { Game } from "../src/game";
import { access } from "./helpers/access";

describe("core/types.ts: walkableAt - ボスの間の階段", () => {
  it("stairsBlockedがtrueなら階段のマスは通れない", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    expect(game.floor.stairsBlocked).toBe(true);
    expect(walkableAt(game.floor, game.floor.stairs)).toBe(false);
  });

  it("stairsBlockedがfalse/未指定なら通れる(通常フロア)", () => {
    const game = new Game({ seed: 1, startDepth: 1 });
    expect(game.floor.stairsBlocked).toBeUndefined();
    expect(walkableAt(game.floor, game.floor.stairs)).toBe(true);
  });
});

describe("game.ts: ボスの間の階段(plan/game/dungeon-boss-rooms.md)", () => {
  function boss(game: Game): MonsterActor {
    return game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oonebosuke",
    )!;
  }

  it("ボスを撃破する前は、階段のマスに立っていてもdescendが弾かれる", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "descend" });
    expect(game.depth).toBe(6);
    expect(events.some((e) => e.type === "message" && e.text.includes("階段がない"))).toBe(true);
  });

  it("ボスを撃破すると階段が通れるようになり、案内メッセージが出る", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const target = boss(game);
    const killActor = access(game).killActor.bind(game);
    const events: { type: string; text?: string }[] = [];
    killActor(target, events);

    expect(game.floor.stairsBlocked).toBe(false);
    expect(walkableAt(game.floor, game.floor.stairs)).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text?.includes("踏破の階段が現れた"))).toBe(true);
  });

  it("ボス撃破後は、実際に階段まで移動してdescendできる", () => {
    const game = new Game({ seed: 1, startDepth: 6, maxDepth: 10 });
    const target = boss(game);
    const killActor = access(game).killActor.bind(game);
    killActor(target, []);

    // ボスの高い経験値でレベルアップし、run-build-skills.mdの3択提示が
    // 出ていることがある。提示中は他のコマンドを受け付けないため、
    // descendを試す前に解消しておく
    const pending = () => access(game).skillChoiceState.pendingSkillChoice;
    while (pending()) {
      game.command({ type: "chooseSkill", id: pending()![0] as never });
    }

    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "descend" });
    expect(game.depth).toBe(7);
    expect(events.some((e) => e.type === "message" && e.text.includes("階段がない"))).toBe(false);
  });
});
