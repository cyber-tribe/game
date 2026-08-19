import { describe, expect, it } from "vitest";
import { SPECIES } from "../src/entities/species";
import { speciesNamesEn } from "../src/i18n/en";
import { LOCALES, t } from "../src/i18n";

/**
 * モンスター種族名の英訳ぐろっさり(plan/game/archive/localization-monster-names-en.md)。
 *
 * このファイルが検証するのは「グロッサリーのデータとしての完全性」だけ。
 * ドキュメント自身が「ネイティブ英語話者のチェックが要るたたき台」と
 * 明記しているとおり、英訳の語感の妥当性そのものはテストの対象外
 */
describe("src/i18n/en.ts: モンスター種族名の英訳データ", () => {
  it("SPECIESの全種族が対応するspecies.<id>.nameキーを持つ", () => {
    for (const species of SPECIES) {
      const key = `species.${species.id}.name`;
      expect(speciesNamesEn[key], `${species.id}の英訳が無い`).toBeDefined();
    }
  });

  it("実在しない種族idを指す余計なキーが無い(typo・削除漏れの検出)", () => {
    const validKeys = new Set(SPECIES.map((s) => `species.${s.id}.name`));
    for (const key of Object.keys(speciesNamesEn)) {
      expect(validKeys.has(key), `${key}に対応する種族がSPECIESに無い`).toBe(true);
    }
  });

  it("すべての値が空でない文字列", () => {
    for (const [key, value] of Object.entries(speciesNamesEn)) {
      expect(typeof value, key).toBe("string");
      expect(value.length, key).toBeGreaterThan(0);
    }
  });

  it("単純なローマ字化(idそのまま)になっていない(design/localization.mdの方針)", () => {
    for (const species of SPECIES) {
      const en = speciesNamesEn[`species.${species.id}.name`];
      expect(en?.toLowerCase()).not.toBe(species.id.toLowerCase());
    }
  });
});

describe("この英訳データはまだ生きたロケール切り替えには配線されていない", () => {
  it("LOCALESは引き続きjaのみ(design/localization.mdの優先順位1がまだ未着手のため)", () => {
    expect(LOCALES).toEqual(["ja"]);
  });

  it("t()はspecies.*キーを(ja辞書に無いので)キーそのまま返す", () => {
    expect(t("species.purun.name" as never)).toBe("species.purun.name");
  });
});
