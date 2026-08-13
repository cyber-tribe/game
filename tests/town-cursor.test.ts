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
