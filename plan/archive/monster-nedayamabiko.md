> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "nedayamabiko"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# ねだやまびこ(nedayamabiko)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-nedayamabiko.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階33〜、視認で全体に警戒。

## 由来

尾根に根を張ってしまった古い響き。ほとんど動かず、周囲の物音をさらに遠くまで響かせる。地方固有の性質そのものを体現する種族。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 46 / 20 / 16 |
| exp | 32 |
| 出現weight | 3 |
| 備考 | 出現階33〜、視認で全体に警戒 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
