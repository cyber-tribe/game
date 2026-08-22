import type { Rng } from "../../core/rng";
import type { DamageOptions } from "./types";

/** 会心の一撃が出る基本確率(1/32) */
const CRITICAL_ONE_IN = 32;
/**
 * 会心率の合計の上限(plan/game/archive/combat-mechanics.md)。武器・印・
 * 特技などの会心率ボーナスをいくら積んでも、この値を超えない。会心が
 * 戦闘の主軸になりすぎないための歯止め。不意打ち・強制会心(forceCrit)
 * はこの上限の対象外(そもそも確率ではなく確定なので)。
 */
export const MAX_CRIT_RATE = 0.2;

export function rollCritical(rng: Rng, opts?: DamageOptions): boolean {
  const rate = Math.min(MAX_CRIT_RATE, 1 / CRITICAL_ONE_IN + (opts?.critBonus ?? 0));
  return opts?.forceCrit || rng.chance(rate);
}
