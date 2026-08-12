import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import { activeStatusLabels } from "../src/view/hud";
import { initialSave, loadSave, setFontSize } from "../src/save";
import { withMockedLocalStorage } from "./helpers/localStorage";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 1,
    kind: "player",
    name: "ガルド",
    model: "garudo",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

describe("view/hud.ts: activeStatusLabels(色だけに頼らない状態異常表示)", () => {
  it("状態異常が無ければ空", () => {
    expect(activeStatusLabels(actor())).toEqual([]);
  });

  it("ねむり・こんらん・封じを、記号つきのラベルで返す", () => {
    const a = actor({
      statuses: [
        { kind: "sleep", turns: 3 },
        { kind: "confuse", turns: 2 },
        { kind: "seal", turns: 1 },
      ],
    });
    const labels = activeStatusLabels(a);
    expect(labels).toHaveLength(3);
    expect(labels.some((l) => l.includes("ねむり") && l !== "ねむり")).toBe(true);
    expect(labels.some((l) => l.includes("こんらん") && l !== "こんらん")).toBe(true);
    expect(labels.some((l) => l.includes("封じ") && l !== "封じ")).toBe(true);
  });

  it("ターン切れ(turns:0)の状態異常は含めない", () => {
    const a = actor({ statuses: [{ kind: "sleep", turns: 0 }] });
    expect(activeStatusLabels(a)).toEqual([]);
  });

  it("毒など対象外の状態異常は含めない", () => {
    const a = actor({ statuses: [{ kind: "poison", turns: 3 }] });
    expect(activeStatusLabels(a)).toEqual([]);
  });
});

describe("save.ts: fontSize(アクセシビリティ)", () => {
  it("初期値は normal", () => {
    expect(initialSave().fontSize).toBe("normal");
  });

  it("setFontSizeで切り替わる", () => {
    let save = initialSave();
    save = setFontSize(save, "large");
    expect(save.fontSize).toBe("large");
    save = setFontSize(save, "normal");
    expect(save.fontSize).toBe("normal");
  });

  it("同じ値を渡すと同じ参照を返す", () => {
    const save = initialSave();
    expect(setFontSize(save, "normal")).toBe(save);
  });

  it("壊れたセーブデータのfontSizeはnormalに丸められる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({ fontSize: "huge" }));
      expect(loadSave().fontSize).toBe("normal");
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({ fontSize: "large" }));
      expect(loadSave().fontSize).toBe("large");
    });
  });
});
