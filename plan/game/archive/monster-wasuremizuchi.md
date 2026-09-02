> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "wasuremizuchi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/出現階)がすべて一致することを確認した。同エントリの
> コードコメントにあるとおり、由来にある「触れられると深みタイルへ
> 逃げ込む」逃走先誘導は`plan/archive/monster-roster-expansion-
> species.md`側で既存の`coward`(瀕死で離脱)のまま簡略化する判断が
> 済んでおり、本文書のデータ表自体はそれを含まないため矛盾はない。
> 本文書自体は追加のコード変更を要求していないため、記録としてそのまま
> アーカイブする。

# わすれみずち(wasuremizuchi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-wasuremizuchi.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・通常出現。出現階9〜。

## 由来

すっかり忘れ去られた水霊。モヤウツボの成れの果てに近い存在で、触れられるとすぐ深みへ逃げ込み、追う者の足を止める。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `coward` |
| maxHp / atk / def | 16 / 9 / 3 |
| exp | 14 |
| 出現weight | 4 |
| 備考 | 出現階9〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
