import type { Rng } from "../../core/rng";
import { rollCritical } from "./criticalHit";
import type { DamageOptions, DamageResult } from "./types";

/**
 * オーソドックスな和製RPGの手触りに寄せたダメージ計算。
 *   ダメージ = (attack - defense / 2) × 0.9〜1.1
 * 会心の一撃は守備力を無視する。守備を固めても最低1は通る。
 */
export function computeDamage(
  rng: Rng,
  attack: number,
  defense: number,
  opts?: DamageOptions,
): DamageResult {
  const critical = rollCritical(rng, opts);
  const base = critical ? attack : attack - defense / 2;
  const damage = Math.max(1, Math.floor(base * rng.float(0.9, 1.1)));
  return { damage, critical };
}
