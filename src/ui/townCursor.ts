/**
 * 拠点画面(town.ts)の列移動(plan外のリファクタリング、Martin Fowler PR18)。
 *
 * 拠点画面は0〜19の20列が一直線に並んでおり、左右キーで隣の列へ移り、
 * 両端(列0の左・列19の右)ではその場に留まる。以前はこの「隣の列番号」を
 * town.ts内の各列のArrowLeft/ArrowRight case(約20箇所)に個別の
 * リテラル(例: `this.column = 4;`)として書いており、列を1つ増減する
 * たびに前後の列のリテラルも書き換える必要があった。ここでは隣接列の
 * 計算だけを1つの純粋関数に集約し、DOM非依存のままユニットテストできる
 * ようにする。
 *
 * town.tsの各列は依然として `column === N` で個別に分岐しており(列ごとの
 * 表示・操作がリストの並び替えや2Dグリッド化ではなく質的に異なるため)、
 * 列の識別子そのものをテーブル駆動にする変更は含まない。
 */
export type TownColumn =
  | 0
  | 1
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19;

const TOWN_COLUMN_MIN: TownColumn = 0;
const TOWN_COLUMN_MAX: TownColumn = 19;

/**
 * 村の建物・村人ごとのメニュー分割(plan/game/archive/village-scoped-menus.md)。
 *
 * `openColumns`を渡すと、左右キーの移動先はその部分集合の中だけに限られる。
 * 集合内での`current`の位置を探し、その前後の要素へ移るだけ(両端では
 * 従来どおりその場に留まる)。`openColumns`を省略した場合は、従来どおり
 * 0〜19の全列を一直線に辿る(既存の呼び出し・テストと完全互換)。
 */
export function nextTownColumn(
  current: TownColumn,
  direction: -1 | 1,
  openColumns?: readonly TownColumn[],
): TownColumn {
  if (!openColumns || openColumns.length === 0) {
    const next = current + direction;
    if (next < TOWN_COLUMN_MIN || next > TOWN_COLUMN_MAX) return current;
    return next as TownColumn;
  }
  const sorted = [...openColumns].sort((a, b) => a - b);
  const idx = sorted.indexOf(current);
  if (idx === -1) return current;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= sorted.length) return current;
  return sorted[nextIdx]!;
}
