import { afterEach, describe, expect, it } from "vitest";
import { LOCALES, setLocale, t } from "../src/i18n";
import { ja } from "../src/i18n/ja";

describe("i18n/index.ts(plan/i18n-foundation.md)", () => {
  afterEach(() => {
    // 既定のjaに戻す。テスト間でcurrentLocaleが漏れないように
    setLocale(ja);
  });

  it("既知キーはja辞書の文字列を返す", () => {
    expect(t("ui.hud.hp")).toBe("HP");
  });

  it("varsを渡すと{name}のようなプレースホルダを置換する", () => {
    expect(t("msg.recruit", { name: "ガジリ" })).toBe("ガジリが仲間になった!");
  });

  it("同じプレースホルダが複数回出てきても全て置換する(replaceAll)", () => {
    expect(t("hud.depth", { depth: 5 })).toBe("地下 5 階");
  });

  it("複数のプレースホルダをまとめて置換する", () => {
    expect(t("ui.hud.satiety")).toBe("まんぷく"); // 素の文字列(vars無し)も確認
    expect(t("msg.satietyDrained", { amount: 3 })).toBe("満腹度が3減った!");
  });

  it("未翻訳キー(現在のロケールの辞書に無いキー)はキー自体を返す", () => {
    setLocale({});
    expect(t("ui.hud.hp")).toBe("ui.hud.hp");
  });

  it("varsが渡されても、テンプレートが見つからなければキー自体をそのまま返す(プレースホルダは残る)", () => {
    setLocale({});
    expect(t("hud.depth", { depth: 5 })).toBe("hud.depth");
  });

  it("setLocaleで辞書を切り替えられる", () => {
    setLocale({ "ui.hud.hp": "HITPOINT" });
    expect(t("ui.hud.hp")).toBe("HITPOINT");
  });

  it("LOCALESは第1段階時点でjaのみを含む", () => {
    expect(LOCALES).toEqual(["ja"]);
  });
});
