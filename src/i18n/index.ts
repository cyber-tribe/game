import { ja } from "./ja";

/**
 * 多言語対応の土台(plan/i18n-foundation.md)。idと表示文字列を分離する。
 * 第1段階時点では英語の翻訳テーブル(en.ts)は用意しない
 * (design/localization.mdの優先順位2・3の移行と合わせて別途行う)。
 */
export type LocaleKey = keyof typeof ja;

/** SaveData.localeが取りうる値。第1段階時点で実際に選べるのは"ja"だけ(LOCALES参照) */
export type LocaleId = "ja" | "en";

/** 設定画面の言語選択で実際に選べる選択肢。"en"の翻訳テーブルができるまでは"ja"のみ */
export const LOCALES: readonly LocaleId[] = ["ja"];

let currentLocale: Record<string, string> = ja;

/**
 * キーに対応する表示文字列を返す。未翻訳キー(現在のロケールの辞書に無いキー)は
 * キー自体を返す(気づきやすくするため、design/localization.mdの方針どおり)。
 * varsを渡すと`{name}`のようなプレースホルダを単純な文字列置換で埋める。
 */
export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
  const template = currentLocale[key] ?? key;
  return vars
    ? Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template)
    : template;
}

export function setLocale(locale: Record<string, string>): void {
  currentLocale = locale;
}
