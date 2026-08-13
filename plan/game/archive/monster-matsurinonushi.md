> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "matsurinonushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# まつりのぬし(matsurinonushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-matsurinonushi.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・配合限定。めんかぶりこぞう+かざりだるまの成熟、状態異常完全耐性。

## 由来

状態異常を受けつけなくなった姿。祭りの高揚が、正気を失わせる悪戯からも自分を守るようになった。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 63 / 31 / 16 |
| exp | 78 |
| 出現weight | 0 |
| 備考 | めんかぶりこぞう+かざりだるまの成熟、状態異常完全耐性 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
