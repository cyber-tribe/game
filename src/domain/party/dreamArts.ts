import type { DreamArtId, FloorState } from "../../core/types";

/**
 * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)の、仲間個体
 * ごとの持続時間を1ターンぶん減らす。「ホネつよし」はdefBuffTurns、
 * 発動済みの各ゆめわざのクールダウンはdreamArtCooldownsで管理する。
 * パーティ全体の持続効果(ほのかなあかり/ゆめのかけぶとん/こだまの雄叫び/
 * 光タルの明かり)はGame自身のフィールドのままなので、ここでは扱わない
 */
export function tickAllyDreamArts(floor: FloorState): void {
  for (const actor of floor.actors) {
    if (actor.kind !== "ally") continue;
    if (actor.dreamArtCooldowns) {
      for (const id of Object.keys(actor.dreamArtCooldowns) as DreamArtId[]) {
        const remaining = actor.dreamArtCooldowns[id] ?? 0;
        if (remaining > 0) actor.dreamArtCooldowns[id] = remaining - 1;
      }
    }
    if ((actor.defBuffTurns ?? 0) > 0) actor.defBuffTurns!--;
  }
}
