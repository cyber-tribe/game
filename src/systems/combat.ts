import type { Rng } from "../core/rng";

/** 会心の一撃が出る確率(1/32) */
const CRITICAL_ONE_IN = 32;

export interface DamageResult {
  damage: number;
  critical: boolean;
}

/**
 * ドラクエ系の手触りに寄せたダメージ計算。
 *   ダメージ = (attack - defense / 2) × 0.9〜1.1
 * 会心の一撃は守備力を無視する。守備を固めても最低1は通る。
 */
export function computeDamage(rng: Rng, attack: number, defense: number): DamageResult {
  const critical = rng.oneIn(CRITICAL_ONE_IN);
  const base = critical ? attack : attack - defense / 2;
  const damage = Math.max(1, Math.floor(base * rng.float(0.9, 1.1)));
  return { damage, critical };
}
