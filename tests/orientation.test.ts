import { describe, expect, it } from "vitest";
import { shouldLockToPortraitPrompt } from "../src/entities/orientation";

describe("entities/orientation.ts: shouldLockToPortraitPrompt(plan/touch-ui-overlap-fix.md)", () => {
  it("タッチ端末かつ縦持ちのときだけ案内へ切り替える", () => {
    expect(shouldLockToPortraitPrompt(true, true)).toBe(true);
  });

  it("タッチ端末でも横持ちなら案内を出さない", () => {
    expect(shouldLockToPortraitPrompt(true, false)).toBe(false);
  });

  it("縦長ウィンドウでもタッチ端末でなければ(マウス・トラックパッド等)案内を出さない", () => {
    expect(shouldLockToPortraitPrompt(false, true)).toBe(false);
  });

  it("タッチでも縦持ちでもなければ案内を出さない", () => {
    expect(shouldLockToPortraitPrompt(false, false)).toBe(false);
  });
});
