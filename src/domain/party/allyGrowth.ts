import type { FloorState } from "../../core/types";
import type { GameEvent } from "../../core/events";
import { gainAllyExp } from "../../entities/companionGrowth";
import { dreamArtDef } from "../../entities/dreamArts";
import { displayActorName } from "../../entities/naming";
import { t } from "../../i18n";

/**
 * 仲間の経験値・レベルアップ(plan/game/archive/companion-leveling-and-arts.md)。
 * killActorから、ガルドの経験値取得と同じタイミングで呼ばれる。ガルドが得る
 * 全量とは別に、生存して連れている仲間全員がそれぞれ50%を得る
 * (頭割りにしない。複数連れのパーティが不利にならないように)
 */
export function gainAllyExpFromKill(floor: FloorState, playerExp: number, events: GameEvent[]): void {
  const allyExp = Math.round(playerExp * 0.5);
  if (allyExp <= 0) return;
  for (const actor of floor.actors) {
    if (actor.kind !== "ally" || !actor.alive) continue;
    const result = gainAllyExp(actor, allyExp);
    if (result.levelsGained > 0) {
      events.push({ type: "levelUp", actorId: actor.id, level: actor.level });
      events.push({
        type: "message",
        text: t("msg.allyLevelUp", { name: displayActorName(actor), level: actor.level }),
      });
    }
    for (const learned of result.learnedDreamArts) {
      events.push({ type: "dreamArtLearned", actorId: actor.id, id: learned.id, level: learned.level });
      events.push({
        type: "message",
        text: `${displayActorName(actor)}は『${dreamArtDef(learned.id).name}』をゆめみた!`,
      });
    }
  }
}
