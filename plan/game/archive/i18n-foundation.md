> **実装済み(第1段階の土台+代表的な移行のみ。全面移行は継続作業として未着手)。**
>
> **土台**: `src/i18n/index.ts`(`t()`/`setLocale()`、計画書の設計どおり)・
> `src/i18n/ja.ts`(辞書、40キー)を新規実装。`t()`は未翻訳キーをキー自体で
> フォールバックし、`{name}`等は`replaceAll`で単純置換する(計画書どおり)。
> `en.ts`は計画書の指示どおり作らず、`LocaleId = "ja" | "en"`型だけを
> `src/i18n/index.ts`に置いた。`LOCALES: readonly LocaleId[] = ["ja"]`で
> 「第1段階時点で実際に選べるのは"ja"のみ」を表現している。
>
> **SaveData.locale**: `messageSpeed`と同じ型パターン(`SAVE_FIELDS`・
> `sanitizeLocale`・`tests/fixtures/save/v14-i18n-foundation.json`・
> `save-compat.test.ts`への新describe)で追加。既定`"ja"`、`LOCALES`に無い値は
> `"ja"`に丸める。`SaveData`用のセッターは`setMessageSpeed`等と同じ命名慣習だと
> `setLocale`になり、i18n側の`setLocale(辞書を切り替える関数)`と名前が衝突する
> ため、`setSaveLocale`という名前にした(計画書に無い決定、命名の衝突回避のため)。
>
> **設定画面への言語選択**: `src/ui/town.ts`列19に4行目として追加
> (`settingsCursor`を`0|1|2|3`に拡張)。Enterで`LOCALES`を1周する骨格のみで、
> 実際に選べるのは「日本語」だけ(計画書の想定どおり)。
>
> **移行した範囲(t()化)**: HUD全体(`src/view/hud.ts`、地下◯階・Lv・HP/まんぷく
> 見出し・経験値・かかえ中・なかま・構え・操作説明オーバーレイ)、もちもの
> メニュー全体(`src/ui/menu.ts`)、設定画面列19全体(`src/ui/town.ts`、今回追加の
> 言語行を含む)、`src/game.ts`のシステムメッセージ9件(地下降下・めざめの階段で
> 区切り・経験値獲得・レベルアップ・仲間になった・タルへの吸い込み成功/失敗・
> 満腹度減少・ゴールド拾得)。`{name}`が絡むものは変数として差し込むだけに留め、
> 名称自体(`hit.name`/`ally.name`)は翻訳していない(計画書の優先順位2の対象)。
> 既存のja文字列を一字一句変えずに辞書へ転記しており、`npx vitest run`は
> 移行前と全く同じ1035件が変更なしで通過することを確認済み(+新規10件)。
>
> **移行しなかった範囲(計画書が明示的にスコープ外とした、または今回は見送った)**:
> `Species.name`・`ItemDef.description`等データ定義の文字列そのもの(優先順位2)、
> flavorText・NPCせりふ(優先順位3)は対象外のまま。`src/ui/town.ts`の列19以外
> (倉庫・持ち物・出発・鍛え方・工房・依頼板・実績帳・NPCと話す・宵祭り・音量列等、
> 2000行超)、`src/game.ts`の残り数百件のメッセージ(こうげき・被ダメージ・
> 状態異常・アイテム使用等)は、計画書自身が「1つのPRで数百箇所を一度に移すのは
> 非現実的」と述べているとおり、今回は着手していない。ファイル単位・機能単位で
> 別の`plan/`文書に分けて継続することを推奨する(依頼板・実績帳・工房など、
> 画面のまとまりごとに1文書ずつが扱いやすいと思われる)。HUDの状態異常表示
> (`STATUS_DISPLAY`の「◐ねむり」等)はデータ定義寄りのRecordのため今回は据え置いた。
>
> **未決事項への回答**: 対応言語の範囲・翻訳体制・優先順位2/3の分割粒度は、
> 計画書どおり今後の計画セッションに委ねる(本PRでは判断していない)。
>
> ブラウザでの動作確認は行っていない(自動テスト・`tsc --noEmit`・`vite build`の
> みで検証)。

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
