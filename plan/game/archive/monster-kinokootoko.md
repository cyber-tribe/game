> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "kinokootoko"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし(なお実装には
> 由来文の「胞子の満ちた部屋にいるほど力を増す」に対応する
> `atkMulInSporedRoom`も入っているが、データ表の対象外の付随効果であり
> 矛盾はない)。本文書はコードを伴わない記録用の文書のため、追加の実装は
> 行わない。

# きのこおとこ(kinokootoko)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-kinokootoko.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・通常出現。出現階13〜。

## 由来

眠気を吸い込んで育った茸そのものが人の形に育ったもの。胞子の満ちた部屋にいるほど力を増す。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 34 / 19 / 9 |
| exp | 32 |
| 出現weight | 5 |
| 備考 | 出現階13〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
