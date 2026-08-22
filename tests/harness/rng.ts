import { Rng } from "../../src/core/rng";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)向けの決定的な乱数、
 * その1: シード固定Rng。本物と全く同じ実装なので、`generateFloor`等
 * 本来の乱数消費コードにもそのまま渡せる。呼び出し順が変わると出目も
 * 変わる点まで含めて本番のRngと同一
 */
export function seededRng(seed: number): Rng {
  return new Rng(seed);
}

/**
 * 箱庭ダンジョン向けの決定的な乱数、その2: 列挙Rng。
 * `next()`が返す値の列をあらかじめ指定し、「命中する/しない」
 * 「捕獲に成功する/失敗する」といった分岐を狙って踏ませる。
 * `int`・`chance`等の他メソッドはすべて`Rng`本来の実装のまま
 * (内部で`next()`を呼ぶ)なので、列の値を選ぶ側が`Rng`の各計算式を
 * 踏まえて逆算する
 *
 * 列を使い切ると先頭に戻って繰り返す(呼び出し回数を数え上げずに
 * 済ませるため)。分岐直前で列が尽きると意図しない値に戻る点に注意
 */
export class EnumeratedRng extends Rng {
  private readonly values: readonly number[];
  private cursor = 0;

  constructor(values: readonly number[]) {
    super(1);
    if (values.length === 0) throw new Error("EnumeratedRng: 空の列は渡せない");
    this.values = values;
  }

  override next(): number {
    const v = this.values[this.cursor % this.values.length]!;
    this.cursor += 1;
    return v;
  }
}
