import type { Rng } from "../core/rng";
import { type Dir, type Vec2, dirDelta } from "../core/grid";
import type { WeaponPattern } from "../core/types";

/** 会心の一撃が出る基本確率(1/32) */
const CRITICAL_ONE_IN = 32;
/**
 * 会心率の合計の上限(plan/combat-mechanics.md)。武器・印・特技などの
 * 会心率ボーナスをいくら積んでも、この値を超えない。会心が戦闘の主軸に
 * なりすぎないための歯止め。不意打ち・強制会心(forceCrit)はこの上限の
 * 対象外(そもそも確率ではなく確定なので)。
 */
export const MAX_CRIT_RATE = 0.2;

export interface DamageResult {
  damage: number;
  critical: boolean;
}

export interface DamageOptions {
  /** 会心率に上乗せする分(例: 双樽鉤の+0.15) */
  critBonus?: number;
  /** 会心を強制する(例: 双樽鉤のそのラン最初の1手、不意打ち) */
  forceCrit?: boolean;
}

/**
 * ドラクエ系の手触りに寄せたダメージ計算。
 *   ダメージ = (attack - defense / 2) × 0.9〜1.1
 * 会心の一撃は守備力を無視する。守備を固めても最低1は通る。
 */
export function computeDamage(
  rng: Rng,
  attack: number,
  defense: number,
  opts?: DamageOptions,
): DamageResult {
  const rate = Math.min(MAX_CRIT_RATE, 1 / CRITICAL_ONE_IN + (opts?.critBonus ?? 0));
  const critical = opts?.forceCrit || rng.chance(rate);
  const base = critical ? attack : attack - defense / 2;
  const damage = Math.max(1, Math.floor(base * rng.float(0.9, 1.1)));
  return { damage, critical };
}

/**
 * 武器の攻撃パターンごとに、攻撃者の位置・向いている方向を基準にした
 * 相対マス(オフセット)を返す。plan/protagonist-weapons.md 参照。
 * quickSingle・heavySingle は当たり判定そのものは single と同じで、
 * 特殊効果(会心率・行動遅延)は呼び出し側(game.ts)で扱う。
 */
export function attackOffsets(pattern: WeaponPattern, dir: Dir): Vec2[] {
  const forward = dirDelta(dir);
  switch (pattern) {
    case "line2":
      return [forward, { x: forward.x * 2, y: forward.y * 2 }];
    case "arc3": {
      const left = dirDelta(((dir + 7) % 8) as Dir);
      const right = dirDelta(((dir + 1) % 8) as Dir);
      return [forward, left, right];
    }
    default:
      return [forward];
  }
}
