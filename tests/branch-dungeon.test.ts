import { describe, expect, it } from "vitest";
import {
  ECHO_NEST_ID,
  MUDDY_DEPTHS_ID,
  REGION_DUNGEON_IDS,
  branchDungeonSpecFor,
  isBranchDungeonId,
  isCheckpointFloor,
} from "../src/entities/dungeons";
import { Game } from "../src/game";

const HOST_REGION2_ID = REGION_DUNGEON_IDS[1]!; // 忘れ潮の湿地
const HOST_REGION6_ID = REGION_DUNGEON_IDS[5]!; // こだまの尾根

/** 横穴の入り口が生成されたGameをseedを変えながら探す */
function findGameWithBranchEntrance(dungeonId: string, startDepth: number): Game | undefined {
  for (let seed = 1; seed <= 200; seed++) {
    const game = new Game({ seed, dungeonId, startDepth });
    if (game.floor.branchEntrance) return game;
  }
  return undefined;
}

describe("entities/dungeons.ts: 横穴(分岐ダンジョン)", () => {
  it("忘れ潮の湿地2階・こだまの尾根2階にだけ横穴の仕様がある", () => {
    expect(branchDungeonSpecFor(HOST_REGION2_ID, 2)?.branchDungeonId).toBe(MUDDY_DEPTHS_ID);
    expect(branchDungeonSpecFor(HOST_REGION6_ID, 2)?.branchDungeonId).toBe(ECHO_NEST_ID);
    expect(branchDungeonSpecFor(HOST_REGION2_ID, 1)).toBeUndefined();
    expect(branchDungeonSpecFor(HOST_REGION2_ID, 3)).toBeUndefined();
  });

  it("横穴のダンジョンidを判定できる", () => {
    expect(isBranchDungeonId(MUDDY_DEPTHS_ID)).toBe(true);
    expect(isBranchDungeonId(ECHO_NEST_ID)).toBe(true);
    expect(isBranchDungeonId(HOST_REGION2_ID)).toBe(false);
  });

  it("横穴は区切り(checkpoint)の対象にならない", () => {
    expect(isCheckpointFloor(MUDDY_DEPTHS_ID, 1)).toBe(false);
    expect(isCheckpointFloor(MUDDY_DEPTHS_ID, 2)).toBe(false);
    expect(isCheckpointFloor(ECHO_NEST_ID, 3)).toBe(false);
  });
});

describe("game.ts: 横穴への出入り", () => {
  it("低確率で入り口が生成される(seedを振れば見つかる)", () => {
    const game = findGameWithBranchEntrance(HOST_REGION2_ID, 2);
    expect(game).toBeDefined();
    expect(game?.floor.branchEntrance?.dungeonId).toBe(MUDDY_DEPTHS_ID);
  });

  it("入り口の無い階では生成されない(1階には仕様が無い)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = new Game({ seed, dungeonId: HOST_REGION2_ID, startDepth: 1 });
      expect(game.floor.branchEntrance).toBeUndefined();
    }
  });

  it("入り口に立ってenterBranchすると、プレイヤー・仲間・持ち物・ターン数を保ったまま横穴1階へ移る", () => {
    const game = findGameWithBranchEntrance(HOST_REGION2_ID, 2);
    expect(game).toBeDefined();
    if (!game) return;
    const entrance = game.floor.branchEntrance!;
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { ...entrance.pos };
    game.turnCount = 42;
    const hpBefore = game.player.hp;
    const invBefore = game.player.inventory.items.length;

    const events = game.command({ type: "enterBranch" });

    expect(game.dungeonId).toBe(MUDDY_DEPTHS_ID);
    expect(game.depth).toBe(1);
    expect(game.player.hp).toBe(hpBefore);
    expect(game.player.inventory.items.length).toBe(invBefore);
    // enterBranch自体も1手として数える(扉を開けるのと同じ扱い)
    expect(game.turnCount).toBe(43);
    expect(events.some((e) => e.type === "message")).toBe(true);
  });

  it("入り口に立っていなければenterBranchは弾かれる", () => {
    const game = findGameWithBranchEntrance(HOST_REGION2_ID, 2);
    expect(game).toBeDefined();
    if (!game) return;
    const entrance = game.floor.branchEntrance!;
    // 入り口ではなく階段の上にいる状態を作る(生成位置が違うことは
    // findFreeTile(..., avoid: [start]) が保証している)
    game.player.pos = { ...game.floor.stairs };
    expect(game.player.pos).not.toEqual(entrance.pos);
    const beforeDungeon = game.dungeonId;
    game.command({ type: "enterBranch" });
    expect(game.dungeonId).toBe(beforeDungeon);
  });

  it("横穴を踏破(descend)すると、元の地方ダンジョンの同じ階・同じ位置へ戻る", () => {
    const game = findGameWithBranchEntrance(HOST_REGION2_ID, 2);
    expect(game).toBeDefined();
    if (!game) return;
    const entrance = game.floor.branchEntrance!;
    const hostFloorBefore = game.floor;
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { ...entrance.pos };

    game.command({ type: "enterBranch" });
    expect(game.dungeonId).toBe(MUDDY_DEPTHS_ID);

    // 横穴の最終階まで直接進めて踏破させる
    const branchMaxDepth = game.maxDepth;
    while (game.depth < branchMaxDepth) {
      game.player.pos = { ...game.floor.stairs };
      game.command({ type: "descend" });
    }
    game.player.pos = { ...game.floor.stairs };
    const events = game.command({ type: "descend" });

    expect(game.dungeonId).toBe(HOST_REGION2_ID);
    expect(game.depth).toBe(2);
    expect(game.status).toBe("playing");
    expect(game.floor).toBe(hostFloorBefore);
    expect(game.player.pos).toEqual(entrance.pos);
    expect(game.floor.branchEntrance).toBeUndefined();
    expect(events.some((e) => e.type === "message")).toBe(true);
  });

  it("横穴に入っているあいだはinBranchDungeonがtrueになる", () => {
    const game = findGameWithBranchEntrance(HOST_REGION2_ID, 2);
    expect(game).toBeDefined();
    if (!game) return;
    const entrance = game.floor.branchEntrance!;
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.pos = { ...entrance.pos };
    expect(game.inBranchDungeon).toBe(false);
    game.command({ type: "enterBranch" });
    expect(game.inBranchDungeon).toBe(true);
  });
});
