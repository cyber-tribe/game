import { describe, expect, it } from "vitest";
import { eq } from "../src/core/grid";
import { TILE_ROOM, type TileKind } from "../src/core/types";
import { Game } from "../src/application/dungeonRun/game";

function forceRoomTiles(game: Game, positions: { x: number; y: number }[], kind: TileKind = TILE_ROOM): void {
  for (const p of positions) {
    game.floor.tiles[p.y * game.floor.width + p.x]!.kind = kind;
  }
}

describe("game.ts: タルを抱えたままの階段降りを禁止する(plan/barrel-stairs-safeguard.md)", () => {
  it("タルを抱えて階段の上で降りようとすると、降りずに警告を出し、隣接マスへ押し戻される", () => {
    const game = new Game({ seed: 1 });
    const stairs = game.floor.stairs;
    forceRoomTiles(game, [
      stairs,
      { x: stairs.x - 1, y: stairs.y },
      { x: stairs.x + 1, y: stairs.y },
      { x: stairs.x, y: stairs.y - 1 },
      { x: stairs.x, y: stairs.y + 1 },
    ]);
    game.player.pos = { ...stairs };
    game.player.carrying = { id: 1, kind: "empty", pos: { ...stairs } };
    const depthBefore = game.depth;

    const events = game.command({ type: "descend" });

    expect(game.depth).toBe(depthBefore);
    expect(eq(game.player.pos, stairs)).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text.includes("タルを抱えたままでは降りられない"))).toBe(
      true,
    );
    expect(game.player.carrying).not.toBeNull();
  });

  it("タルを抱えていなければ、通常通り階段を降りられる", () => {
    const game = new Game({ seed: 1 });
    game.player.pos = { ...game.floor.stairs };
    game.player.carrying = null;
    const depthBefore = game.depth;

    game.command({ type: "descend" });

    expect(game.depth).toBe(depthBefore + 1);
  });

  it("めざめの階段(bank)でも同様に、タルを抱えたままでは区切れない", () => {
    const game = new Game({ seed: 1 });
    const stairs = game.floor.stairs;
    forceRoomTiles(game, [
      stairs,
      { x: stairs.x - 1, y: stairs.y },
      { x: stairs.x + 1, y: stairs.y },
      { x: stairs.x, y: stairs.y - 1 },
      { x: stairs.x, y: stairs.y + 1 },
    ]);
    game.player.pos = { ...stairs };
    game.player.carrying = { id: 1, kind: "bomb", pos: { ...stairs } };

    const events = game.command({ type: "bank" });

    expect(game.status).toBe("playing");
    expect(eq(game.player.pos, stairs)).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text.includes("タルを抱えたままでは降りられない"))).toBe(
      true,
    );
  });
});
