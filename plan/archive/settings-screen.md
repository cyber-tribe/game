> **実装済み。** `src/entities/settings.ts`(新規)に`MessageSpeed`・
> `MESSAGE_DELAY_MS`・`messageSpeedScale()`・`KEY_REFERENCE`を実装。
> `SaveData.messageSpeed`(既定`"normal"`)を追加し、save-compatの
> 新フィクスチャ(v12)で検証済み。
>
> **メッセージ速度**は、計画書が前提としていた専用の文字送り・ログ
> ペースの仕組みがコード上に存在しなかったため、`src/view/stage.ts`が
> 既に持っていたターン再生アニメーションの倍率`scale`
> (`(hurry ? HURRY : 1) * messageSpeedScale`)に`messageSpeedScale()`
> (`MESSAGE_DELAY_MS[speed] / MESSAGE_DELAY_MS.normal`の比率)を掛ける
> 形で反映した。新しいアニメーション機構は作らず、既存の再生速度を
> 速度設定で伸縮させる解釈とした(未決事項だったミリ秒値は計画書の
> 案をそのまま採用)。
>
> **キー配置の確認**は、`main.ts`にあった「Hキーで開くヘルプ」用の
> 定数(旧`KEY_HELP_LINES`、README操作表を手動転記したもの)を
> `KEY_REFERENCE`として`src/entities/settings.ts`へ移動し、ヘルプ
> 画面と設定画面の両方から参照する形にした。計画書は新規の定数配列を
> 想定していたが、内容が同じ既存データが既にあったため、二重管理を
> 避けるために一本化した(README側を生成元とする申し送りは既存の
> ヘルプ定数がそのまま引き継ぐ)。
>
> **画面配置**: 計画書は既存の`fontSize`(列14)・音量(`plan/
> audio-playback.md`実装済み、列18)を含めて1つの設定画面にまとめる
> ことを想定していたが、`src/ui/town.ts`は列の追加のたびに列インデックス
> を全箇所で手で増やす作りになっており、既存2列を統合・列番号変更
> すると2200行超のファイル内の多数の参照を書き換える必要がありリグレッ
> ションのリスクが高いと判断した。そのため、既存の列14・18はそのまま
> 残し、本文書が新規に定める3項目(メッセージ速度・操作説明の再表示・
> キー配置の確認)だけを持つ新しい列19「設定」を追加する形にした。
>
> **言語設定**は`plan/i18n-foundation.md`が未実装(文字列のt(key)化が
> 大規模なため別途見送り中)のため、本文書の列にも含めていない。
> `plan/i18n-foundation.md`実装時に追加想定。
>
> ブラウザでの動作確認済み: メッセージ速度の切り替えとlocalStorageへの
> 永続化、操作説明の再表示(TUTORIAL_TIPS全11件)・キー配置確認
> (KEY_REFERENCE全13件)のサブビューの開閉、列18↔列19間の移動、
> コンソールエラー無し。

# 設定画面

`design/ui-flow.md` が「新規に用意する」とした設定画面を実装可能な形に
確定させる。音量(`plan/audio-playback.md`)・言語(`plan/i18n-
foundation.md`)は既に別文書で仕様化済みのため、本文書では**設定画面
そのものの置き場所と、残る3項目(メッセージ速度・操作説明の再表示・
キー配置の確認)**を扱う。

## 設定画面の位置づけ

拠点メニュー(`design/ui-flow.md`の「拠点画面のまとめ方」)に「設定」を
1項目追加する。既存の`fontSize`切り替え(`src/ui/town.ts`)と同じ
一覧UIパターンを踏襲し、新しいUIの型は増やさない。

| 項目 | 出典 |
|---|---|
| 文字サイズ | 既存実装(`SaveData.fontSize`) |
| 音量(BGM/効果音) | `plan/audio-playback.md` |
| 言語 | `plan/i18n-foundation.md` |
| メッセージ速度 | 本文書(新設) |
| 操作説明の再表示 | 本文書(新設) |
| キー配置の確認 | 本文書(新設、確認のみ) |

## メッセージ速度(確定)

```ts
export type MessageSpeed = "slow" | "normal" | "fast";
export const MESSAGE_DELAY_MS: Record<MessageSpeed, number> = {
  slow: 60, normal: 30, fast: 10,
};
```

`src/view/stage.ts`の`GameEvent`再生ループが、メッセージ表示のたびに
既に何らかの表示間隔(文字送り・ログ追加のペース)を持っている前提で、
その間隔の基準値を`MESSAGE_DELAY_MS[speed]`から引く形にする。新しい
アニメーションの仕組みは作らず、既存の間隔を差し替えるだけ。

```ts
export interface SaveData {
  // ...既存フィールド
  messageSpeed: MessageSpeed; // 既定"normal"
}
```

## 操作説明の再表示(確定)

`src/core/tutorial.ts`の`TUTORIAL_TIPS`(既存。チュートリアルの各tipの
本文を保持している)を**そのまま一覧表示するだけ**の画面を追加する。
新しいテキストは書かない(既存のtip文言を再利用する)。`SaveData.
seenTutorialTips`による「まだ見ていないものだけ表示」のような絞り込みは
行わず、**常に全件を一覧できる**ようにする(README操作表の代替として、
いつでも全体を見返せることを優先する)。

## キー配置の確認(確定: 確認のみ、再割り当ては実装しない)

`design/ui-flow.md`が明記する通り、**再割り当ては本文書でも対象外**と
する。README記載の操作表(矢印/WASD/テンキー、Shift+方向、Space、
`.`、F、G、I、T、C、Q/E、`+`/`-`、R)を、そのままゲーム内の静的な
一覧として表示するだけの画面を追加する。動的な生成は不要(README の
表を手動でTypeScriptの定数配列に落とし込む)。

```ts
export const KEY_REFERENCE: readonly { keys: string; action: string }[] = [
  { keys: "矢印 / WASD / テンキー", action: "8方向に移動。モンスターがいる方向へ進むと攻撃" },
  { keys: "Shift + 方向", action: "その場で向きだけ変える(ターンを消費しない)" },
  // ...README操作表の残りをそのまま転記
];
```

README側の表現が変わった場合にこの一覧が古くならないよう、実装時は
README側をこの定数の**生成元**として扱う(手動転記後、README更新時に
ここも合わせて直す運用上の注意点として申し送る)。

## 実装への影響の見積もり

- `src/entities/settings.ts`(新規、または`src/core/tutorial.ts`と同じ
  階層): `MessageSpeed`・`MESSAGE_DELAY_MS`・`KEY_REFERENCE`。
- `src/save.ts`: `SaveData.messageSpeed`を追加。既存のsanitize処理・
  save-compat新フィクスチャ。
- `src/view/stage.ts`: メッセージ表示間隔を`MESSAGE_DELAY_MS[speed]`
  から引くよう変更。
- `src/ui/town.ts`: 設定画面本体(音量・言語・文字サイズ・メッセージ
  速度・操作説明・キー配置確認への導線)。

## 未決事項

- メッセージ速度3段階の具体的なミリ秒値(実装後の体感で調整)。
- 操作説明・キー配置確認の画面デザイン(一覧表示という以上の詳細)。
