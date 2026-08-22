import type { Vec2 } from "../../core/grid";
import type { Actor, Barrel, TargetActor } from "../../core/types";
import type { GameEvent } from "../../core/events";

/** 投げたときの威力(barrelThrowDamage()に掛ける倍率) */
export const WATER_BARREL_DAMAGE_MULTIPLIER = 1;
export const STONE_BARREL_DAMAGE_MULTIPLIER = 1.5;
/** 投げて命中した敵を押し出す距離(マス数)。強化版は+1 */
export const WIND_BARREL_PUSH_DISTANCE = 2;
/** 投げて命中した敵の混乱・眠りの持続ターン。強化版は+1 */
export const LIGHT_BARREL_CONFUSE_TURNS = 3;
export const SLEEP_BARREL_SLEEP_TURNS = 3;

export interface ApplyElementalBarrelHitArgs {
  barrel: Barrel;
  landing: Vec2;
  hits: Actor[];
  events: GameEvent[];
  // 樽比べ(plan/tarukurabe-minigame.md)はスコープ外。得点処理だけの専用フローはGame側
  resolveTarukurabeHit(hit: TargetActor): void;
  effect: (target: Actor) => void;
}

/**
 * 元素タル(plan/game/archive/barrel-arts.md)を投げて命中した最後の1体に
 * だけ効果を適用する共通処理。当たらなければ何も起きずタルだけ砕ける
 * (爆発タルと同じ、投げたら使い切り)
 */
export function applyElementalBarrelHit(args: ApplyElementalBarrelHitArgs): void {
  const { barrel, landing, hits, events, resolveTarukurabeHit, effect } = args;
  const target = hits[hits.length - 1];
  if (target?.kind === "target") {
    resolveTarukurabeHit(target);
  } else if (target?.alive) {
    effect(target);
  }
  events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });
}
