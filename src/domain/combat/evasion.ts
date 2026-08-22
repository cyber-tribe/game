import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { Actor } from "../../core/types";
import { displayActorName } from "../../entities/naming";
import { speciesById } from "../../entities/species";

/**
 * 地方ごとの成熟系統(plan/companion-evolution-expansion.md): かすみウツボは
 * 確率で攻撃をまるごと回避する。回避した場合はtrueを返し、呼び出し側は
 * ダメージ計算そのものをスキップする
 */
export function tryEvade(rng: Rng, target: Actor, events: GameEvent[]): boolean {
  const targetSpeciesId = target.kind === "monster" || target.kind === "ally" ? target.speciesId : undefined;
  const evadeChance = targetSpeciesId ? speciesById(targetSpeciesId).evadeChance ?? 0 : 0;
  if (evadeChance <= 0 || !rng.chance(evadeChance)) return false;
  events.push({ type: "message", text: `${displayActorName(target)}はひらりと攻撃をかわした!` });
  if (target.kind === "monster") target.aware = true;
  return true;
}
