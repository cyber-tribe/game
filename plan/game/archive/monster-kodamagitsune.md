> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "kodamagitsune"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した(range5は`range: 5`、
> 2回攻撃30%は`echoAttackChance: 0.3`に対応)。差分なし。本文書はコードを
> 伴わない記録用の文書のため、追加の実装は行わない。

# こだまぎつね(kodamagitsune)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-kodamagitsune.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・配合限定。やまびこぎつね+こだまうさぎの成熟、range5、2回攻撃30%。

## 由来

攻撃が2回まで反響するように連続で発動するようになった姿。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 60 / 29 / 13 |
| exp | 68 |
| 出現weight | 0 |
| 備考 | やまびこぎつね+こだまうさぎの成熟、range5、2回攻撃30% |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
