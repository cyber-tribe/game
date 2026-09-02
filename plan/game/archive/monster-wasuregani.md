> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "wasuregani"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/confuse付与)がすべて一致することを確認した。本文書
> 自体は追加のコード変更を要求していないため、記録としてそのまま
> アーカイブする。

# ワスレガニ(wasuregani)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-wasuregani.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・通常出現。出現階7〜(confuse20% 3turn)。

## 由来

置き忘れた記憶が硬い殻をまとって居座るもの。攻撃が当たると軽い混乱を起こすのは、思い出そうとして余計に頭が混乱する様子から。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 34 / 12 / 12 |
| exp | 24 |
| 出現weight | 5 |
| 備考 | 出現階7〜(confuse20% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
