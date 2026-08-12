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
