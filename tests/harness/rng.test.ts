import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/rng";
import { EnumeratedRng, seededRng } from "./rng";

describe("箱庭ダンジョンの決定的Rng(plan/game/test-dungeon-harness.md)", () => {
  it("seededRngは本物のRngと同じシードで同じ出目になる", () => {
    const a = seededRng(42);
    const b = new Rng(42);
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("EnumeratedRngはnext()で渡した列をそのまま順に返す", () => {
    const rng = new EnumeratedRng([0, 0.5, 0.99]);
    expect(rng.next()).toBe(0);
    expect(rng.next()).toBe(0.5);
    expect(rng.next()).toBe(0.99);
  });

  it("EnumeratedRngは列を使い切ると先頭に戻る", () => {
    const rng = new EnumeratedRng([0.1, 0.9]);
    rng.next();
    rng.next();
    expect(rng.next()).toBe(0.1);
    expect(rng.next()).toBe(0.9);
  });

  it("EnumeratedRngのint/chanceはnext()の列を踏まえた本来の計算式のまま", () => {
    // Rng.chance(p) は next() < p。0.2は0.5未満なのでtrue、0.8は0.5以上なのでfalse
    const rng = new EnumeratedRng([0.2, 0.8]);
    expect(rng.chance(0.5)).toBe(true);
    expect(rng.chance(0.5)).toBe(false);
  });

  it("空の列を渡すと例外", () => {
    expect(() => new EnumeratedRng([])).toThrow();
  });
});
