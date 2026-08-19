import { describe, expect, it } from "vitest";
import type { AllyActor } from "../src/core/types";
import { speciesById } from "../src/entities/species";
import { createMonster } from "../src/dungeon/populate";
import { Game } from "../src/game";

/**
 * 仲間モンスターの自然回復(plan/ally-natural-regen.md)。
 * 仲間全員がプレイヤーと同じ間隔(8ターンごと)でHP+1。特性
 * regenIfUnhit・特技しずけさのいやしは従来どおり上乗せとして残り、
 * 敵モンスターの回復挙動は変わらない。
 */

function ally(id: number, speciesId: string, pos: { x: number; y: number }): AllyActor {
  const species = speciesById(speciesId);
  return {
    id,
    kind: "ally",
    name: species.name,
    speciesId,
    model: species.model,
    pos,
    facing: 4,
    hp: 20,
    maxHp: 20,
    atk: 5,
    def: 2,
    level: 1,
    statuses: [],
    alive: true,
  };
}

/** 敵も罠もいない状態でnターン足踏みする */
function waitTurns(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.command({ type: "wait" });
}

describe("game.ts: 仲間の自然回復(plan/ally-natural-regen.md)", () => {
  it("特性・特技なしの仲間が8ターンごとにHP+1回復する", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally(9001, "gajiri", { x: game.player.pos.x + 1, y: game.player.pos.y });
    companion.hp = 10;
    game.floor.actors.push(companion);

    waitTurns(game, 16);
    // 16ターンのうち、8の倍数ターンが2回ある(turnCountの初期値に
    // よらず、16ターン中にちょうど2回)ので +2
    expect(companion.hp).toBe(12);
  });

  it("満タンの仲間はそれ以上回復しない", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally(9002, "gajiri", { x: game.player.pos.x + 1, y: game.player.pos.y });
    game.floor.actors.push(companion);

    waitTurns(game, 16);
    expect(companion.hp).toBe(companion.maxHp);
  });

  it("しずけさのいやし持ちは自然回復に上乗せしてさらに速く回復する", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally(9003, "gajiri", { x: game.player.pos.x + 1, y: game.player.pos.y });
    companion.maxHp = 40;
    companion.hp = 10;
    companion.skills = ["slowMend"];
    game.floor.actors.push(companion);

    waitTurns(game, 16);
    // 自然回復ぶん(+2)より多く回復しているはず(毎ターンの上乗せがある)
    expect(companion.hp).toBeGreaterThan(12);
  });

  it("特性なしの敵モンスターは回復しない", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // gajiriはregenIfUnhitを持たない。プレイヤーから離して戦闘を避ける
    const enemy = createMonster(9004, speciesById("gajiri"), {
      x: game.player.pos.x + 3,
      y: game.player.pos.y,
    });
    enemy.hp = Math.max(1, enemy.maxHp - 5);
    const before = enemy.hp;
    game.floor.actors.push(enemy);

    waitTurns(game, 16);
    expect(enemy.hp).toBe(before);
  });
});
