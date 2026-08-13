> **実装済み。**
> `src/entities/storedMonster.ts`(`StoredMonster.favorite?: boolean`を
> 追加)、`src/save.ts`(`fuseMonsters`・`releaseCompanion`の冒頭にガードを
> 追加。新規`toggleFavorite`関数。`sanitizeHut`にfavoriteのsanitizeを
> 追加)、`src/ui/town.ts`(ねむり小屋一覧に星マーク表示、新規キー`F`で
> 切り替え、糧選択・夢に還す選択でのガード+理由メッセージ表示)、
> `src/main.ts`(`toggleFavorite`の呼び出し配線)に実装した。テストは
> `tests/companion-favorite-lock.test.ts`(新規10件)。
>
> 実装時の判断:
> - **「選べない」の実現方法**: プランは「糧の選択候補一覧に表示自体は
>   するが選べない(グレーアウト)」としていたが、既存の`renderHut`は
>   CSSクラスでの無効化表現を持たないため、**一覧には引き続き通常表示し、
>   Mキーで実際に選ぼうとした瞬間にブロックして理由メッセージを出す**
>   方式にした。メッセージは新規の一時フィールド`favoriteNotice`(次の
>   操作で自動的にクリアされる)を介して、既存の説明文表示(`desc`
>   要素)にそのまま流し込む形にし、新しいUIコンポーネント(ダイアログ等)
>   は追加していない。
> - **糧選択時の挙動**: 従来「2回目のMで、軸と異なるuidなら即
>   `onFuse`を呼び`fusionAxisUid`をリセットする」だった処理を、糧が
>   `favorite`なら`onFuse`を呼ばずに理由メッセージだけ出し、`fusionAxisUid`
>   はリセットする(選び直しをやり直せる状態に戻す)よう変更した。
> - **お気に入り星マーク表示**: 一覧の名前の先頭に`★`を付けるだけの
>   最小実装(既存の「(夢あわせの軸)」「(夢に還す?)」接尾辞パターンとは
>   別に、名前そのものへの前置記号にした)。
> - `src/save.ts`側のガード(`fuseMonsters`・`releaseCompanion`)は、
>   UI側が選ばせない前提のもとでの**保険**として実装した(直接
>   `save.ts`の関数を呼ぶような不正な経路からも一貫して守られる)。
> - 未決事項(メッセージ文言・お気に入り件数の上限)は、文言はテスト
>   コード中に明記した通りに確定し、件数上限はプランの初期案通り
>   「当面は無制限」のまま実装した。
> - save-compatは既存v6フィクスチャがfavoriteを持たない状態のまま
>   後方互換であることを確認済み(新規フィクスチャの追加はプラン記載の
>   通り不要と判断)。

# 仲間の「お気に入り」ロック

`plan/archive/monster-fusion.md`(夢あわせの「糧」は選ぶと元に戻せない)・
`plan/archive/release-companion.md`(仲間を手放す)という、**取り消せない
形で仲間を失いうる2つの既存機能**に対する、誤操作防止の新機能を提案する。
どちらの実装済み文書も改修せず、`StoredMonster`に軽いフラグを1つ足す
だけで両方に効かせる。

## 内容

```ts
// src/entities/storedMonster.ts
export interface StoredMonster {
  // ...既存フィールド
  favorite?: boolean;
}
```

ねむり小屋の一覧UI(`plan/archive/monster-fusion.md`が定めた一覧
パターン)に、既存の`nickname`編集と同じ並びで「お気に入り」の
星マーク切り替えを追加する。

## 既存2機能への効かせ方

- **夢あわせの「糧」選択**: `favorite: true`の個体は、糧の選択候補一覧に
  表示自体はするが選べない(グレーアウト)。選ぼうとすると
  「お気に入りに設定されているため、糧にはできない。先にお気に入りを
  外すこと」という既存の`GameEvent`(`message`)相当のメッセージを出す。
  `plan/archive/costumes.md`・`plan/archive/multiple-dungeons.md`等、
  他の一覧UIが既に採用している「未解放・選べない項目はグレーアウト+
  条件表示」というパターンをそのまま踏襲する(新しいUIパターンは
  増やさない)。
- **仲間を手放す(`releaseCompanion`)**: `plan/archive/release-
  companion.md`が既に持つ二段階の確認状態(`releaseConfirmUid`)の
  **手前**で、`favorite: true`の個体を選んだ場合は確認状態にすら
  進めず、同じ理由メッセージを出す。

いずれも**新しい確認ダイアログを作らない**。「お気に入りを外す」という
明示的な一手を挟むこと自体を抑止力にする(`design/balance-
philosophy.md`の「操作の複雑さを大きく崩さない」方針に沿う)。

## 軸(残る側)には影響しない

夢あわせの**軸**(残る側)としてお気に入り個体を選ぶことは今まで通り
制限しない(軸は消えないため、保護する必要がない)。

## データ構造

`StoredMonster.favorite?: boolean`(既定`undefined`≒`false`)のみ。
`SaveData`自体の構造は変わらない(`hut: StoredMonster[]`の要素が
1フィールド増えるだけ)。

## 実装への影響の見積もり

- `src/entities/storedMonster.ts`: `favorite?: boolean`を追加。
- `src/save.ts`: `fuseMonsters`・`releaseCompanion`の冒頭に、糧/対象が
  `favorite`なら処理を中断してメッセージを返すガードを追加。
  `sanitizeHut`(既存のsanitize処理)で`favorite`のsanitizeを追加。
- `src/ui/town.ts`: ねむり小屋一覧に星マークの切り替え、糧選択・
  手放す選択でのグレーアウト表示。
- save-compat: 既存フィクスチャの`hut`要素は`favorite`を持たない状態
  (`undefined`→`false`扱い)のまま後方互換が保たれるため、新規
  フィクスチャの追加は必須ではない(既存のv6フィクスチャで検証可能)。

## 未決事項

- グレーアウト時のメッセージ文言の最終調整。
- お気に入り件数の上限を設けるか(当面は無制限とする)。
