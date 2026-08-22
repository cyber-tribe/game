import { type Dir, type Vec2, dirDelta } from "../../core/grid";
import type { WeaponPattern } from "../../core/types";

/**
 * 武器の攻撃パターンごとに、攻撃者の位置・向いている方向を基準にした
 * 相対マス(オフセット)を返す。plan/game/archive/protagonist-weapons.md
 * 参照。quickSingle・heavySingle は当たり判定そのものは single と同じで、
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
