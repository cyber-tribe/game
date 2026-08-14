import { describe, expect, it } from "vitest";
import { nextTownColumn, type TownColumn } from "../src/ui/townCursor";

describe("ui/townCursor.ts", () => {
  it("右へ1つ隣の列番号を返す", () => {
    expect(nextTownColumn(0, 1)).toBe(1);
    expect(nextTownColumn(9, 1)).toBe(10);
    expect(nextTownColumn(18, 1)).toBe(19);
  });

  it("左へ1つ隣の列番号を返す", () => {
    expect(nextTownColumn(1, -1)).toBe(0);
    expect(nextTownColumn(10, -1)).toBe(9);
    expect(nextTownColumn(19, -1)).toBe(18);
  });

  it("列0で左へ移動しても列0のまま(端で止まる)", () => {
    expect(nextTownColumn(0, -1)).toBe(0);
  });

  it("列19で右へ移動しても列19のまま(端で止まる)", () => {
    expect(nextTownColumn(19, 1)).toBe(19);
  });

  it("0から19まで右へ、19から0まで左へ、一列ずつ辿れる", () => {
    let column: TownColumn = 0;
    for (let i = 0; i < 19; i++) column = nextTownColumn(column, 1);
    expect(column).toBe(19);
    for (let i = 0; i < 19; i++) column = nextTownColumn(column, -1);
    expect(column).toBe(0);
  });
});

/**
 * 村のメニューを建物・村人ごとの役割に分ける
 * (plan/game/archive/village-scoped-menus.md)。openColumnsを渡すと、
 * 左右キーでの移動先はその部分集合の中だけに限られる
 */
describe("ui/townCursor.ts: openColumnsによる巡回範囲の限定", () => {
  it("集合内の隣の列(昇順で1つ先)へ移る", () => {
    const cave = [0, 1, 2, 3, 4, 10, 12] as const;
    expect(nextTownColumn(0, 1, cave)).toBe(1);
    expect(nextTownColumn(4, 1, cave)).toBe(10);
    expect(nextTownColumn(10, 1, cave)).toBe(12);
  });

  it("集合内の隣の列(昇順で1つ前)へ移る", () => {
    const cave = [0, 1, 2, 3, 4, 10, 12] as const;
    expect(nextTownColumn(1, -1, cave)).toBe(0);
    expect(nextTownColumn(10, -1, cave)).toBe(4);
    expect(nextTownColumn(12, -1, cave)).toBe(10);
  });

  it("集合の右端で右へ移動しても、集合の外(例えば13以降)へは出ない", () => {
    const cave = [0, 1, 2, 3, 4, 10, 12] as const;
    expect(nextTownColumn(12, 1, cave)).toBe(12);
  });

  it("集合の左端で左へ移動しても、集合の外(マイナス側)へは出ない", () => {
    const cave = [0, 1, 2, 3, 4, 10, 12] as const;
    expect(nextTownColumn(0, -1, cave)).toBe(0);
  });

  it("集合が1列だけ(例: ゲンドの工房=5列目のみ)なら、左右どちらでもその場に留まる", () => {
    const workshopOnly = [5] as const;
    expect(nextTownColumn(5, 1, workshopOnly)).toBe(5);
    expect(nextTownColumn(5, -1, workshopOnly)).toBe(5);
  });

  it("集合の中を端から端まで、他の列(システム系の14・18・19等)へ漏れずに一巡できる", () => {
    // モグラ婆の倉庫: 0・1の2列だけが開いている想定
    const storage = [0, 1] as const;
    let column: TownColumn = 0;
    for (let i = 0; i < 5; i++) {
      column = nextTownColumn(column, 1, storage);
      expect(storage).toContain(column);
    }
    expect(column).toBe(1); // 右端(1)で止まり続ける
  });

  it("記録の間(6・8)を、7(モンスター図鑑)へ抜けずに往復できる", () => {
    const recordsHall = [6, 8] as const;
    expect(nextTownColumn(6, 1, recordsHall)).toBe(8);
    expect(nextTownColumn(8, 1, recordsHall)).toBe(8);
    expect(nextTownColumn(8, -1, recordsHall)).toBe(6);
    expect(nextTownColumn(6, -1, recordsHall)).toBe(6);
  });
});
