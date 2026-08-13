/**
 * カーソル位置を length で循環させる(負数にも対応)。
 * menu.ts / stance.ts / arts.ts / town.ts に完全一致のまま4重複していたものを集約
 * (plan外のリファクタリング、Martin Fowler PR17)
 */
export function wrap(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}
