import type { AllyActor } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { PlayerState } from "../../entities/player";
import { knownBarrelArt } from "../../entities/dreamArts";
import { bondStage } from "../../entities/companionBond";
import { displayActorName } from "../../entities/naming";

export interface CastBarrelArtArgs {
  player: PlayerState;
  allies: readonly AllyActor[];
  allyId: number;
  events: GameEvent[];
}

/**
 * タルわざ(plan/game/archive/barrel-arts.md): 空のタルを抱えた状態で、
 * タルわざ持ちの仲間に変化を頼む。なじみが「すっかりなじんだ」段階以上の
 * 仲間が作ると強化版(enhanced)になる
 */
export function castBarrelArt(args: CastBarrelArtArgs): boolean {
  const { player, allies, allyId, events } = args;
  if (!player.carrying || player.carrying.kind !== "empty") {
    events.push({ type: "message", text: "からのタルを持っていないと頼めない。" });
    return false;
  }
  const ally = allies.find((a) => a.id === allyId && a.alive);
  if (!ally) return false;
  const art = knownBarrelArt(ally.dreamArts ?? []);
  if (!art || !art.barrelKind) {
    events.push({ type: "message", text: `${displayActorName(ally)}はタルわざを覚えていない。` });
    return false;
  }
  const enhanced =
    bondStage(ally.bondSuccessCount ?? 0) === "close" || bondStage(ally.bondSuccessCount ?? 0) === "irreplaceable";
  const barrel = player.carrying;
  player.carrying = { ...barrel, kind: art.barrelKind, enhanced };
  events.push({
    type: "message",
    text: `${displayActorName(ally)}が『${art.name}』でタルを変えた!`,
  });
  // タルわざ注入の音(plan/sound/archive/village-soundscape.md)
  events.push({ type: "barrelArtCast", allyId: ally.id, kind: art.barrelKind });
  return true;
}
