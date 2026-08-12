# 多言語対応の土台(第1段階: システム文言)

`design/localization.md` が定めた方針(idと表示文字列を分離する、
優先順位1〜3で段階的に進める)を、実装可能な最初の一歩として仕様化する。
**本文書は`design/localization.md`の優先順位1(操作に直結する
システムメッセージ・メニュー・ステータス表示)だけを対象にし**、
優先順位2(モンスター・アイテム等の名称)・3(flavorText)は、i18nの
土台が敷かれたあとの**ファイル単位の継続的な移行作業**として本文書の
スコープ外に残す(1つのPRで数百箇所の文字列を一度に移し替えるのは
レビュー・検証の観点で非現実的なため)。

## 土台となる仕組み

```ts
// src/i18n/ja.ts
export const ja: Record<string, string> = {
  "ui.menu.inventory": "もちもの",
  "ui.hud.hp": "HP",
  "msg.captureSuccess": "{name}を捕まえた!",
  "msg.levelUp": "{name}はレベル{level}に上がった!",
  // ...
};

// src/i18n/index.ts
export type LocaleKey = keyof typeof ja;
let currentLocale: Record<string, string> = ja;
export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
  const template = currentLocale[key] ?? key; // 未翻訳キーはキー自体を表示(気づきやすくする)
  return vars
    ? Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template)
    : template;
}
export function setLocale(locale: Record<string, string>): void {
  currentLocale = locale;
}
```

`design/localization.md`が挙げた`{name}`のような変数差し込みは、
既存のテンプレート文字列(`` `${displayName(...)}を捕まえた!` ``のような
形)をそのまま`t("msg.captureSuccess", { name: ... })`に置き換えられる
よう、単純な文字列置換方式にする(複雑な複数形処理等は、この作品が
対象とする言語(日本語→英語)の範囲では不要と判断し、扱わない)。

## 対象範囲(第1段階)

- `src/ui/`配下のメニュー・ラベル・ボタン文言。
- `src/game.ts`の`GameEvent`の`message`テキストのうち、**システム的な
  ものだけ**(捕獲成功・レベルアップ・満腹度警告・チェックポイント等)。
  モンスター名・アイテム名を含むメッセージは、その名称自体が優先順位2
  (本文書のスコープ外)のため、**変数として差し込む形にしておくだけ**
  に留める(名称そのものの翻訳は別文書に委ねる)。
- HUD(HP・満腹度・所持金等の見出し)。

対象外(優先順位2・3、将来の別文書に委ねる):
- `Species.name`・`ItemDef.description`等、データ定義に直接埋め込まれた
  文字列そのものの`nameKey`化。
- `design/flavor-details.md`のflavorText・NPCのせりふプール。

## `design/ui-flow.md`への申し送りの実装反映

`design/localization.md`が申し送っていた「可変長テキストを前提にした
レイアウト」を、この段階で先に効かせておく。`src/ui/`のラベル系
コンポーネントに`min-width`ではなく`max-width`+折り返し、または
`white-space: nowrap`を避ける、というCSS上の方針を、第1段階の実装時に
適用する対象として明記する(具体的なコンポーネント一覧は実装時に
洗い出す)。

## 言語切り替えの入り口

- `SaveData`に`locale: "ja" | "en"`を追加する(既定`"ja"`)。第1段階
  時点では英語の翻訳テーブル(`src/i18n/en.ts`)は用意しない
  (`ja`のキーだけを先に整備し、`en`は空のオブジェクトから始めて
  未翻訳キーがそのままキー名で表示される状態を許容する。翻訳の実作業は
  優先順位2・3と同様、本文書の対象外)。
- `src/ui/town.ts`の設定画面(`fontSize`と同じ並び)に言語選択を追加する。
  選べる選択肢は`"ja"`のみ(第1段階時点)でもよいが、UIの骨格だけ先に
  用意しておく。

## 実装への影響の見積もり

- `src/i18n/index.ts`・`src/i18n/ja.ts`(新規): 土台とキー一覧。
- `src/ui/`配下の各ファイル: 直接埋め込まれた日本語文字列を`t(key)`
  呼び出しに置き換える(第1段階対象の範囲のみ)。
- `src/game.ts`: システム的な`GameEvent.message`の該当箇所を`t(key,
  vars)`形式に置き換える。
- `src/save.ts`: `SaveData.locale`を追加。既存のsanitize処理・
  save-compat新フィクスチャ。

## 未決事項(design/localization.mdから継続)

- 対応する言語の範囲(まず英語のみか)。
- 翻訳作業の体制。
- 優先順位2(名称・description)・3(flavorText)の移行を、今後どの粒度で
  `plan/`文書に分けて進めるか(地方・NPCのまとまりごとに分割する案を
  推奨するが、最終判断は今後の計画セッションに委ねる)。
