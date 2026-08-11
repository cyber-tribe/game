/**
 * シード付き乱数。フロア生成を再現できることがデバッグとテストの前提になるので、
 * Math.random は使わずすべてここを通す。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 0 は mulberry32 で縮退するので避ける
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] の整数 */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max(${max}) < min(${min})`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min, max) の実数 */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 1/n の確率で true */
  oneIn(n: number): boolean {
    return this.int(1, n) === 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: 空配列");
    return items[this.int(0, items.length - 1)]!;
  }

  /** 重み付き抽選 */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += weightOf(item);
    if (total <= 0) throw new Error("Rng.pickWeighted: 重みの合計が0以下");
    let roll = this.next() * total;
    for (const item of items) {
      roll -= weightOf(item);
      if (roll < 0) return item;
    }
    return items[items.length - 1]!;
  }

  /** Fisher-Yates。元配列は変更しない */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}
