import { describe, expect, it } from "vitest";
import { shouldPromptRotate } from "../src/entities/orientation";

describe("entities/orientation.ts: shouldPromptRotate(plan/game/archive/orientation-rotate-prompt.md)", () => {
  it("タッチ端末かつ縦持ちのときだけ回転案内を出す", () => {
    expect(shouldPromptRotate(true, true)).toBe(true);
  });

  it("タッチ端末でも横持ちなら回転案内を出さない", () => {
    expect(shouldPromptRotate(true, false)).toBe(false);
  });

  it("縦長ウィンドウでもタッチ端末でなければ(マウス・トラックパッド等)回転案内を出さない", () => {
    expect(shouldPromptRotate(false, true)).toBe(false);
  });

  it("タッチでも縦持ちでもなければ回転案内を出さない", () => {
    expect(shouldPromptRotate(false, false)).toBe(false);
  });
});
