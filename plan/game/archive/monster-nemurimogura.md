> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "nemurimogura"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# ねむりモグラ(nemurimogura)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-nemurimogura.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・配合限定。ユメクイモグラ+ホロホロチョウの成熟(sleep100% 3turn)。

## 由来

攻撃に眠りが確定でまとわりつくようになった姿。この地方のボス・オオマドロミの力をわずかに宿している。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `burrow` |
| maxHp / atk / def | 52 / 23 / 11 |
| exp | 42 |
| 出現weight | 0 |
| 備考 | ユメクイモグラ+ホロホロチョウの成熟(sleep100% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
