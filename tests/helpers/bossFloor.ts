import type { MonsterActor } from "../../src/core/types";
import type { Game } from "../../src/game";
import { speciesById } from "../../src/entities/species";
import { access } from "./access";

/**
 * ボスの間の階段(plan/game/dungeon-boss-rooms.md)は、ボスを撃破するまで
 * 壁と同じく通れない。「stairsへ直接テレポート→descend」で一息に潜る
 * テストが地方ボスの階を素通りできるよう、実際の移動・戦闘の代わりに
 * ここでボスを直接killActorする。ボスの間でなければ何もしない
 */
export function clearBossIfPresent(game: Game): void {
  if (!game.floor.stairsBlocked) return;
  const boss = game.floor.actors.find(
    (a): a is MonsterActor =>
      a.kind === "monster" &&
      a.alive &&
      a.speciesId !== undefined &&
      speciesById(a.speciesId).isRegionBoss === true,
  );
  if (!boss) return;
  access(game).killActor(boss, []);
  // 地方ボスの高い経験値でレベルアップし、run-build-skills.mdの3択提示が
  // 出ていることがある。提示中はchooseSkill以外のコマンドを受け付けない
  // ため、直後にdescendするテストが巻き添えで止まらないよう解消しておく
  const internals = game as unknown as { pendingSkillChoice: string[] | null };
  while (internals.pendingSkillChoice) {
    game.command({ type: "chooseSkill", id: internals.pendingSkillChoice[0] as never });
  }
}
