import { describe, expect, it } from "vitest";
import { resolveText, type TextVariant } from "../src/entities/inputText";

describe("entities/inputText.ts: resolveText(plan/game/mobile-layout-redesign.md)", () => {
  const variant: TextVariant = { keyboard: "Xキーで攻撃", touch: "攻撃ボタンで攻撃" };

  it("keyboardモードではkeyboard側の文面を返す", () => {
    expect(resolveText(variant, "keyboard")).toBe("Xキーで攻撃");
  });

  it("touchモードではtouch側の文面を返す", () => {
    expect(resolveText(variant, "touch")).toBe("攻撃ボタンで攻撃");
  });
});
